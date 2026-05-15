from fastapi import APIRouter
from pydantic import BaseModel
import numpy as np
import requests
import logging
import math
import os
import glob
import json as _json
from database import get_db, PredictionHistory
from sqlalchemy.orm import Session
from fastapi import Depends

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# NOTE: The AthenaCTGRU trained checkpoint is not yet loaded in this server.
# The /simulation endpoint uses a physics-informed heuristic derived from
# the same SHARP parameter correlations used in training.
# The /realtime endpoint fetches live NOAA GOES/SWPC data and applies the
# same heuristic on current solar conditions.
# When the model checkpoint is available, replace `heuristic_predict()` with
# a real `model.predict()` call.
# ─────────────────────────────────────────────────────────────────────────────

class SimulationInput(BaseModel):
    E_free: float
    Phi_HED: float
    J_total: float
    J_z: float
    h_total: float
    H_c: float
    h_signed: float
    alpha: float
    Psi: float
    grad_Bh: float
    S_HED: float
    Jolt: float
    kappa_frag: float
    hgc_x: float
    hgc_y: float
    cycle_phase: float

class PipelineRequest(BaseModel):
    history_hours: int = 36

def heuristic_predict(features: dict) -> dict:
    """
    Physics-informed heuristic based on known SHARP parameter importance
    rankings from literature (Bobra & Couvidat 2015, Mason & Hoeksema 2010).
    
    Feature importance order (descending):
    1. E_free (free magnetic energy) — highest predictor
    2. J_total (total current)
    3. grad_Bh (horizontal field gradient)
    4. Jolt (rapid field change)
    5. Phi_HED (helicity energy density)
    6. H_c (current helicity)
    7. kappa_frag (AR fragmentation)
    8. cycle_phase (position in solar cycle)
    9. hgc_x (disk position — limb flares are less geoeffective)
    """
    # Normalize E_free to logistic range (typical range: 1e21 to 1e25 J)
    e_free = features.get('E_free', 0)
    e_norm = 0.0
    if e_free > 0:
        log_e = math.log10(max(e_free, 1e20))
        e_norm = max(0, min(1, (log_e - 20) / 5.0))  # 0 at 1e20, 1 at 1e25

    j_total = features.get('J_total', 0)
    j_norm = max(0, min(1, j_total / 20.0))  # typical range 0–20

    grad_bh = features.get('grad_Bh', 0)
    grad_norm = max(0, min(1, abs(grad_bh) / 10.0))

    jolt = features.get('Jolt', 0)
    jolt_norm = max(0, min(1, abs(jolt) / 2.0))

    phi_hed = features.get('Phi_HED', 0)
    phi_norm = max(0, min(1, abs(phi_hed)))

    h_c = features.get('H_c', 0)
    hc_norm = max(0, min(1, abs(h_c)))

    kappa = features.get('kappa_frag', 0)
    kappa_norm = max(0, min(1, abs(kappa)))

    cycle_phase = features.get('cycle_phase', 0.5)
    # Solar max (phase ~0.5) gives higher baseline
    cycle_boost = 0.5 + 0.5 * math.sin(math.pi * cycle_phase)

    # Disk position penalty: flares at limb (|hgc_x| > 60°) are less detectable
    hgc_x = abs(features.get('hgc_x', 0))
    position_factor = max(0.5, 1.0 - (hgc_x / 90.0) * 0.5)

    # Weighted combination (weights sum to 1.0)
    raw_score = (
        0.30 * e_norm +
        0.20 * j_norm +
        0.15 * grad_norm +
        0.12 * jolt_norm +
        0.08 * phi_norm +
        0.07 * hc_norm +
        0.08 * kappa_norm
    )

    # Apply cycle phase and disk position corrections
    adjusted = raw_score * cycle_boost * position_factor

    # Sigmoid to get probability
    prob = 1.0 / (1.0 + math.exp(-10.0 * (adjusted - 0.35)))
    prob = max(0.01, min(0.99, prob))

    return {
        "probability_24h": round(prob, 4),
        "flagged": prob > 0.53,
        "e_free_norm": round(e_norm, 3),
        "j_total_norm": round(j_norm, 3),
        "cycle_phase": round(cycle_phase, 3),
        "raw_score": round(raw_score, 4),
    }

@router.post("/simulation")
def run_simulation(data: SimulationInput):
    features = data.dict()
    result = heuristic_predict(features)
    
    return {
        "status": "success",
        "probability_24h": result["probability_24h"],
        "flagged": result["flagged"],
        "model": "Physics-informed SHARP heuristic (AthenaCTGRU checkpoint pending)",
        "details": (
            f"Computed from 16 SHARP parameters. "
            f"Dominant contributors: E_free={result['e_free_norm']:.2f}, "
            f"J_total={result['j_total_norm']:.2f}, "
            f"cycle_phase={result['cycle_phase']:.2f}. "
            f"Raw score before sigmoid: {result['raw_score']:.4f}."
        )
    }

def fetch_noaa_active_regions():
    """
    Fetch live NOAA active region data from SWPC.
    Returns a list of active sunspot regions with associated risk.
    """
    try:
        # NOAA Active Region probabilities (updated daily)
        r = requests.get(
            "https://services.swpc.noaa.gov/json/solar_regions.json",
            timeout=6
        )
        regions = r.json()
        return regions[:10]  # Top 10 active regions
    except Exception as e:
        logger.warning(f"Failed to fetch solar_regions: {e}")
        return []

def fetch_current_xray():
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
            timeout=5
        )
        data = r.json()
        latest = next((d for d in reversed(data) if d.get("energy") == "0.05-0.4nm"), None)
        return float(latest["flux"]) if latest else 0.0
    except Exception as e:
        return 0.0

def fetch_current_kp():
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
            timeout=5
        )
        data = r.json()
        # Handle both old array format and new object format
        for row in reversed(data):
            if isinstance(row, dict) and row.get("Kp") is not None:
                val = row["Kp"]
                if val != "" and not isinstance(val, str):
                    return float(val)
            elif isinstance(row, list) and row[1] and row[1] != "":
                return float(row[1])
        return None
    except Exception as e:
        return None

@router.get("/realtime")
def get_realtime_prediction():
    """
    Returns pre-computed AthenaCTGRU predictions from live_predictions.json if available,
    with KP + X-ray fetched in parallel. Falls back to NOAA heuristic if no ML file exists.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _fast_kp():
        try:
            r = requests.get(
                "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
                timeout=3
            )
            data = r.json()
            for row in reversed(data):
                if isinstance(row, list) and len(row) >= 2 and row[1] and row[1] != "":
                    return float(row[1])
        except Exception:
            pass
        return None

    def _fast_xray():
        try:
            r = requests.get(
                "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
                timeout=3
            )
            data = r.json()
            latest = next((d for d in reversed(data) if d.get("energy") == "0.05-0.4nm"), None)
            return float(latest["flux"]) if latest else None
        except Exception:
            return None

    # Check if a live inference from AthenaCTGRU pipeline exists
    live_json_path = os.path.join(os.path.dirname(__file__), "live_predictions.json")
    if os.path.exists(live_json_path):
        try:
            with open(live_json_path, "r") as f:
                data = _json.load(f)

            res_data = data.get("results", {})
            probs = [r.get("probability_24h", 0.0) for r in res_data.values()]
            max_p = max(probs) if probs else 0.0
            gs = "QUIET"
            if max_p >= 0.85: gs = "STRONG"
            elif max_p >= 0.75: gs = "MODERATE"

            # Fetch KP + X-ray in parallel — max 3s each
            kp_val, xray_val = None, None
            with ThreadPoolExecutor(max_workers=2) as ex:
                fut_kp   = ex.submit(_fast_kp)
                fut_xray = ex.submit(_fast_xray)
                try: kp_val   = fut_kp.result(timeout=4)
                except Exception: pass
                try: xray_val = fut_xray.result(timeout=4)
                except Exception: pass

            history_hours = data.get("history_hours", 36)
            return {
                "status": "success",
                "global_status": gs,
                "global_score": round(max_p, 4),
                "note": f"AthenaCTGRU pre-computed inference · {history_hours}h SHARP magnetogram window.",
                "timestamp": data.get("timestamp"),
                "history_hours": history_hours,
                "kp_current": kp_val,
                "xray_flux": xray_val,
                "data": res_data
            }
        except Exception as e:
            logger.error(f"Failed to load live_predictions.json: {e}")


    # Fallback to heuristic
    xray_flux = fetch_current_xray()
    kp = fetch_current_kp()
    regions = fetch_noaa_active_regions()
    
    results = {}
    
    if regions:
        for region in regions:
            ar_num = str(region.get("region", "unknown"))
            
            # Extract what NOAA provides
            area = float(region.get("area", 0) or 0)
            num_spots = int(region.get("numspot", 0) or 0)
            z_class = region.get("zurich", "A")
            mag_class = region.get("magtype", "alpha")
            
            # Map Zurich class to proxy energy (simplified)
            zurich_energy = {"A": 0.05, "B": 0.1, "C": 0.2, "D": 0.4, "E": 0.6, "F": 0.75, "H": 0.35, "X": 0.8}
            z_norm = zurich_energy.get(z_class[0].upper() if z_class else "A", 0.1)
            
            # Map magnetic class to J_total proxy
            mag_proxy = {"alpha": 0.1, "beta": 0.3, "gamma": 0.6, "delta": 0.85, "betadelta": 0.75, "betaxgammadelta": 0.95}
            j_norm = mag_proxy.get(mag_class.lower() if mag_class else "alpha", 0.2)
            
            # Area proxy for grad_Bh
            area_norm = min(1.0, area / 500.0)
            
            # X-ray flux proxy for Jolt
            jolt_norm = 0.0
            if xray_flux > 0:
                log_x = math.log10(max(xray_flux, 1e-9))
                jolt_norm = max(0, min(1, (log_x + 9) / 5.0))  # 0 at 1e-9, 1 at 1e-4
            
            # Kp proxy for cycle phase
            kp_phase = min(1.0, (kp or 3.0) / 9.0)
            
            synthetic_features = {
                "E_free": 10 ** (20 + z_norm * 5),
                "Phi_HED": z_norm,
                "J_total": j_norm * 20,
                "J_z": j_norm * 10,
                "h_total": j_norm * 0.8,
                "H_c": z_norm * 0.5,
                "h_signed": -z_norm * 0.4,
                "alpha": j_norm * 0.3,
                "Psi": z_norm * 0.2,
                "grad_Bh": area_norm * 10,
                "S_HED": z_norm * 0.1,
                "Jolt": jolt_norm * 2,
                "kappa_frag": area_norm * 0.2,
                "hgc_x": float(region.get("location", "N00E00").replace("N", "").replace("S", "").split("E")[0].split("W")[0]) if region.get("location") else 0.0,
                "hgc_y": 0.0,
                "cycle_phase": kp_phase
            }
            
            pred = heuristic_predict(synthetic_features)
            results[ar_num] = {
                "probability_24h": pred["probability_24h"],
                "flagged": pred["flagged"],
                "zurich_class": z_class,
                "mag_class": mag_class,
                "area": area,
                "num_spots": num_spots,
                "mu": round(j_norm * 5, 2),
                "log_sigma": round(z_norm, 2),
            }
    
    # Calculate Global Risk
    probs = [r["probability_24h"] for r in results.values()]
    max_p = max(probs) if probs else 0.0
    global_status = "QUIET"
    if max_p > 0.7: global_status = "STRONG"
    elif max_p > 0.35: global_status = "MODERATE"

    return {
        "status": "success",
        "global_status": global_status,
        "global_score": round(max_p, 4),
        "note": "Predictions computed from live NOAA solar region data using physics-informed heuristic. AthenaCTGRU checkpoint will replace this when deployed.",
        "kp_current": kp,
        "xray_flux": xray_flux,
        "data": results
    }

@router.get("/history")
def get_prediction_history(db: Session = Depends(get_db)):
    """Fetch the last 30 days of prediction history for the dual-line chart.
    Falls back gracefully if window_hours column hasn't been migrated yet.
    """
    from sqlalchemy.exc import ProgrammingError as SAProgError
    try:
        records = db.query(PredictionHistory).order_by(
            PredictionHistory.timestamp.desc()
        ).limit(500).all()
        return [
            {
                "id": r.id,
                "harp_num": r.harp_num,
                "probability": r.probability,
                "actual_outcome": r.actual_outcome,
                "flagged": r.flagged,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "global_score": r.global_score,
                "window_hours": getattr(r, "window_hours", None),
            }
            for r in records
        ]
    except SAProgError as e:
        # window_hours column not yet migrated — fall back to raw SQL without it
        if "window_hours" in str(e):
            db.rollback()
            logger.warning("window_hours column missing — run scripts/migrate_add_window_hours.py")
            from sqlalchemy import text
            rows = db.execute(
                text(
                    "SELECT id, harp_num, probability, actual_outcome, flagged, "
                    "timestamp, global_score FROM prediction_history "
                    "ORDER BY timestamp DESC LIMIT 500"
                )
            ).fetchall()
            return [
                {
                    "id": r.id,
                    "harp_num": r.harp_num,
                    "probability": r.probability,
                    "actual_outcome": r.actual_outcome,
                    "flagged": r.flagged,
                    "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    "global_score": r.global_score,
                    "window_hours": None,
                }
                for r in rows
            ]
        raise

@router.post("/record")
def record_prediction(data: dict, db: Session = Depends(get_db)):
    """Internal endpoint to save a successful pipeline run to DB."""
    results = data.get("results", {})
    global_score = data.get("global_score", 0.0)
    window_hours = data.get("window_hours", None)
    for harp, info in results.items():
        record = PredictionHistory(
            harp_num=str(harp),
            probability=info.get("probability_24h", 0.0),
            flagged=info.get("flagged", False),
            global_score=global_score,
            window_hours=window_hours,
        )
        db.add(record)
    db.commit()
    return {"status": "saved"}

import subprocess
import threading
import sys
import time

def _get_log_file(history_hours: int):
    return os.path.join(os.path.dirname(__file__), f"pipeline_log_{history_hours}h.txt")

def _get_status_file(history_hours: int):
    return os.path.join(os.path.dirname(__file__), f"pipeline_status_{history_hours}h.json")

def _write_status(history_hours: int, status: str, progress: int, message: str):
    try:
        with open(_get_status_file(history_hours), "w") as f:
            _json.dump({"status": status, "progress": progress, "message": message}, f)
    except Exception:
        pass


def _append_log(history_hours: int, line: str):
    try:
        with open(_get_log_file(history_hours), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# Map known pipeline print patterns to progress percentages
_PROGRESS_HINTS = [
    ("Connecting to Stanford JSOC", 5, "Connecting to Stanford JSOC (drms)…"),
    ("MODE: LIVE", 8, "Polling currently active HARPs…"),
    ("MODE: TARGETED", 8, "Targeted historical mode active…"),
    ("Validating coverage", 10, "Validating HARP data coverage…"),
    ("Validated", 20, "HARP validated — sufficient frames found"),
    ("Requesting export manifest", 30, "Requesting FITS export from JSOC…"),
    ("files to download", 35, "Downloading SHARP magnetograms…"),
    ("downloaded", 45, "Magnetogram download in progress…"),
    ("Cleaned up", 48, "Pruning expired cache files…"),
    ("Extracting features", 70, "Extracting physical HED features…"),
    ("successful. Sequence shape", 80, "Feature extraction complete"),
    ("Applying normalization", 88, "Applying z-score normalization…"),
    ("Executing forward pass", 93, "Running AthenaCTGRU PyTorch inference…"),
    ("INFERENCE RESULTS", 97, "Inference complete — formatting results…"),
    ("Saved", 99, "Writing prediction JSON files…"),
    ("Recorded results", 100, "Pipeline finished successfully."),
]


def run_pipeline_thread(history_hours: int):
    """Run the_full_pipeline.py as a subprocess, stream stdout/stderr in real-time."""
    log_file = _get_log_file(history_hours)
    # Clear log from previous run
    try:
        with open(log_file, "w", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}] Pipeline started: {history_hours}h window\n")
            f.write("=" * 60 + "\n")
    except Exception:
        pass

    _write_status(history_hours, "running", 5, f"Starting {history_hours}h pipeline…")

    try:
        env = os.environ.copy()
        env["HISTORY_HOURS"] = str(history_hours)
        env["PYTHONUNBUFFERED"] = "1"  # Force unbuffered output
        script_path = os.path.join(os.path.dirname(__file__), "the_full_pipeline.py")

        proc = subprocess.Popen(
            [sys.executable, "-u", script_path],
            cwd=os.path.dirname(__file__),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Merge stderr into stdout
            text=True,
            bufsize=1,  # Line buffered
        )

        current_progress = 5
        for raw_line in iter(proc.stdout.readline, ""):
            line = raw_line.rstrip()
            if not line:
                continue

            _append_log(history_hours, line)

            # Match against known progress hints
            for hint_text, hint_progress, hint_msg in _PROGRESS_HINTS:
                if hint_text.lower() in line.lower():
                    current_progress = max(current_progress, hint_progress)
                    _write_status(history_hours, "running", current_progress, hint_msg)
                    break
            else:
                # No match — just update the message with the raw line (truncated)
                display = line[:120] if len(line) > 120 else line
                _write_status(history_hours, "running", current_progress, display)

        proc.wait()
        retcode = proc.returncode

        if retcode == 0:
            _append_log(history_hours, "\n" + "=" * 60)
            _append_log(history_hours, "Pipeline completed successfully.")
            _write_status(history_hours, "completed", 100, "Pipeline finished successfully.")
            logger.info(f"Pipeline ({history_hours}h) completed.")
        else:
            _append_log(history_hours, f"\nPipeline exited with code {retcode}")
            _write_status(history_hours, "error", current_progress, f"Pipeline exited with non-zero code: {retcode}")
            logger.error(f"Pipeline ({history_hours}h) failed with code {retcode}")

    except Exception as e:
        msg = f"Pipeline thread exception: {e}"
        logger.error(msg, exc_info=True)
        _append_log(history_hours, msg)
        _write_status(history_hours, "error", 0, msg)

@router.post("/run-pipeline")
def trigger_pipeline(req: PipelineRequest = None):
    """Triggers the_full_pipeline.py in the background — logs stream to pipeline_log.txt"""
    h_hours = req.history_hours if req else 36
    _write_status(h_hours, "starting", 0, f"Initializing {h_hours}h JSOC pipeline...")
    t = threading.Thread(target=run_pipeline_thread, args=(h_hours,), daemon=True)
    t.start()
    return {"status": "started", "history_hours": h_hours}

@router.post("/reset-pipeline")
def reset_pipeline(req: PipelineRequest = None):
    """Physically deletes the stuck status/log files for a given window."""
    h_hours = req.history_hours if req else 36
    try:
        status_file = _get_status_file(h_hours)
        if os.path.exists(status_file):
            os.remove(status_file)
        log_file = _get_log_file(h_hours)
        if os.path.exists(log_file):
            os.remove(log_file)
    except Exception as e:
        logger.error(f"Failed to reset pipeline {h_hours}h: {e}")
    return {"status": "reset", "history_hours": h_hours}

@router.post("/seed-history")
def seed_history():
    """Runs the seed_7day_history.py script to refresh the 7-day chart data from NOAA."""
    import subprocess, sys
    script_path = os.path.join(os.path.dirname(__file__), "../../scripts/seed_7day_history.py")
    script_path = os.path.normpath(script_path)
    try:
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, text=True, timeout=30
        )
        logger.info(f"Seeder output: {result.stdout}")
        if result.returncode != 0:
            logger.error(f"Seeder error: {result.stderr}")
            return {"status": "error", "detail": result.stderr}
        return {"status": "ok", "detail": result.stdout}
    except Exception as e:
        logger.error(f"Failed to run seeder: {e}")
        return {"status": "error", "detail": str(e)}

@router.get("/pipeline-status")
def get_pipeline_status(window_hours: int = 36):
    """Polls pipeline_status.json — called every 2s by frontend."""
    status_file = _get_status_file(window_hours)
    if not os.path.exists(status_file):
        return {"status": "idle", "progress": 0, "message": f"No pipeline has been run for {window_hours}h yet."}
    try:
        with open(status_file, "r") as f:
            return _json.load(f)
    except Exception:
        return {"status": "unknown", "progress": 0, "message": "Could not read status file."}


@router.get("/pipeline-logs")
def get_pipeline_logs(window_hours: int = 36, tail: int = 200):
    """
    Returns the last `tail` lines of pipeline_log.txt.
    Called by frontend every 2s during a running pipeline.
    """
    log_file = _get_log_file(window_hours)
    if not os.path.exists(log_file):
        return {"lines": [], "total_lines": 0}
    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        tail_lines = [l.rstrip() for l in all_lines[-tail:]]
        return {
            "lines": tail_lines,
            "total_lines": len(all_lines),
        }
    except Exception as e:
        return {"lines": [f"Error reading log: {e}"], "total_lines": 0}


@router.get("/snapshots")
def list_snapshots():
    """
    List all available per-window prediction JSONs.
    Returns metadata for each available window (12h, 24h, 36h, 48h).
    """
    predict_dir = os.path.dirname(__file__)
    pattern = os.path.join(predict_dir, "predictions_*h.json")
    snapshots = []
    for fpath in sorted(glob.glob(pattern)):
        try:
            with open(fpath, "r") as f:
                data = _json.load(f)
            fname = os.path.basename(fpath)
            hours = int(fname.replace("predictions_", "").replace("h.json", ""))
            probs = [r.get("probability_24h", 0) for r in data.get("results", {}).values()]
            max_p = max(probs) if probs else 0.0
            gs = "QUIET"
            if max_p >= 0.85: gs = "STRONG"
            elif max_p >= 0.75: gs = "MODERATE"
            snapshots.append({
                "filename": fname,
                "window_hours": hours,
                "timestamp": data.get("timestamp"),
                "global_score": round(max_p, 4),
                "global_status": gs,
                "ar_count": len(data.get("results", {})),
            })
        except Exception:
            continue
    # Sort by window_hours
    snapshots.sort(key=lambda x: x["window_hours"])
    return {"snapshots": snapshots, "count": len(snapshots)}


@router.get("/snapshot/{hours}")
def get_snapshot(hours: int):
    """
    Fetch the pre-computed prediction results for a specific lookback window.
    Returns 404-style dict if that window hasn't been computed yet.
    """
    predict_dir = os.path.dirname(__file__)
    fpath = os.path.join(predict_dir, f"predictions_{hours}h.json")
    if not os.path.exists(fpath):
        return {
            "status": "not_found",
            "window_hours": hours,
            "message": f"No pre-computed results for {hours}h window. Run the AthenaCTGRU pipeline with this window size to generate them.",
        }
    try:
        with open(fpath, "r") as f:
            data = _json.load(f)
        # Calculate summary stats
        results = data.get("results", {})
        probs = [r.get("probability_24h", 0) for r in results.values()]
        max_p = max(probs) if probs else 0.0
        gs = "QUIET"
        if max_p >= 0.85: gs = "STRONG"
        elif max_p >= 0.75: gs = "MODERATE"
        return {
            "status": "success",
            "window_hours": hours,
            "timestamp": data.get("timestamp"),
            "global_status": gs,
            "global_score": round(max_p, 4),
            "note": f"AthenaCTGRU inference computed over {hours}h SHARP magnetogram sequence.",
            "data": results,
        }
    except Exception as e:
        logger.error(f"Error reading snapshot {hours}h: {e}")
        return {"status": "error", "message": str(e)}
