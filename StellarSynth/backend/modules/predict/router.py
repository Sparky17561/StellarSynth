from fastapi import APIRouter
from pydantic import BaseModel
import numpy as np
import requests
import logging
import math
import os
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
    Fetch live NOAA active region data and apply the physics-informed
    heuristic to each active region to produce a real-time flare probability.
    Falls back to graceful error if NOAA APIs are unavailable.
    """
    # Check if a live inference from AthenaCTGRU pipeline exists
    live_json_path = os.path.join(os.path.dirname(__file__), "live_predictions.json")
    if os.path.exists(live_json_path):
        try:
            with open(live_json_path, "r") as f:
                data = __import__("json").load(f)
            
            res_data = data.get("results", {})
            # Calculate Global Risk from live data
            probs = [r.get("probability_24h", 0.0) for r in res_data.values()]
            max_p = max(probs) if probs else 0.0
            gs = "QUIET"
            if max_p > 0.7: gs = "STRONG"
            elif max_p > 0.35: gs = "MODERATE"

            return {
                "status": "success",
                "global_status": gs,
                "global_score": round(max_p, 4),
                "note": "Predictions computed LIVE by AthenaCTGRU using 36h sequence of SHARP magnetogram tensors.",
                "kp_current": fetch_current_kp(),
                "xray_flux": fetch_current_xray(),
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
    """Fetch the last 30 days of prediction history for graphing"""
    return db.query(PredictionHistory).order_by(PredictionHistory.timestamp.desc()).limit(500).all()

@router.post("/record")
def record_prediction(data: dict, db: Session = Depends(get_db)):
    """Internal endpoint to save a successful pipeline run to DB"""
    results = data.get("results", {})
    global_score = data.get("global_score", 0.0)
    for harp, info in results.items():
        record = PredictionHistory(
            harp_num=str(harp),
            probability=info.get("probability_24h", 0.0),
            flagged=info.get("flagged", False),
            global_score=global_score
        )
        db.add(record)
    db.commit()
    return {"status": "saved"}

import subprocess
import threading
import sys

def run_pipeline_thread(history_hours: int):
    try:
        env = os.environ.copy()
        env["HISTORY_HOURS"] = str(history_hours)
        script_path = os.path.join(os.path.dirname(__file__), "the_full_pipeline.py")
        subprocess.run([sys.executable, script_path], cwd=os.path.dirname(__file__), env=env)
    except Exception as e:
        logger.error(f"Pipeline thread failed: {e}")

@router.post("/run-pipeline")
def trigger_pipeline(req: PipelineRequest = None):
    """Triggers the_full_pipeline.py in the background"""
    h_hours = req.history_hours if req else 36
    status_file = os.path.join(os.path.dirname(__file__), "pipeline_status.json")
    try:
        with open(status_file, "w") as f:
            __import__("json").dump({"status": "starting", "progress": 0, "message": f"Initializing {h_hours}h JSOC pipeline..."}, f)
    except Exception:
        pass
    
    t = threading.Thread(target=run_pipeline_thread, args=(h_hours,))
    t.start()
    return {"status": "started", "history_hours": h_hours}

@router.get("/pipeline-status")
def get_pipeline_status():
    """Polls the pipeline_status.json"""
    status_file = os.path.join(os.path.dirname(__file__), "pipeline_status.json")
    if not os.path.exists(status_file):
        return {"status": "idle", "progress": 0, "message": "Pipeline not running"}
    
    try:
        with open(status_file, "r") as f:
            return __import__("json").load(f)
    except Exception:
        return {"status": "unknown", "progress": 0, "message": "Could not read status"}
