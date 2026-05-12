from fastapi import APIRouter
from pydantic import BaseModel
import os
import json
import requests
import logging
from groq import Groq
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# ─── In-memory chat sessions (session_id -> list of messages) ────────────────
_chat_sessions: dict[str, list] = {}

# ─── Pydantic Models ─────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str
    history: list = []
    session_id: str = "default"

class ClearChatRequest(BaseModel):
    session_id: str = "default"

# ─── ML Prediction Reader ────────────────────────────────────────────────────

def fetch_live_ml_predictions() -> dict:
    """
    Read the live_predictions.json written by the AthenaCTGRU pipeline.
    Returns parsed dict or empty if unavailable.
    """
    pred_path = os.path.join(
        os.path.dirname(__file__), "..", "predict", "live_predictions.json"
    )
    pred_path = os.path.normpath(pred_path)
    try:
        if os.path.exists(pred_path):
            with open(pred_path, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"Could not read live_predictions.json: {e}")
    return {}


def fetch_realtime_prediction_api() -> dict:
    """
    Hit the /api/predict/realtime endpoint locally to get latest prediction.
    This is the authoritative ML result. Falls back to live_predictions.json.
    """
    try:
        r = requests.get("http://localhost:8000/api/predict/realtime", timeout=6)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"Could not hit /api/predict/realtime: {e}")
    return {}


def build_prediction_context() -> dict:
    """
    Aggregate the ML prediction outputs and return a structured dict:
    - timestamp
    - global_status / global_score
    - top_ars: sorted list of (ar_num, probability, flagged, ...)
    - kp_current, xray_flux
    - source: 'AthenaCTGRU' or 'heuristic'
    Always enriches ARs with live NOAA solar region metadata (Zurich class,
    mag class, area, location, num_spots) for accurate 'Why' explanations.
    """
    # Try realtime API first (covers both live ML and heuristic fallback)
    api_data = fetch_realtime_prediction_api()
    ml_file  = fetch_live_ml_predictions()

    # Fetch live NOAA solar region metadata for enrichment
    noaa_regions = fetch_noaa_solar_regions()
    # Build lookup: region number (str) -> region metadata dict
    noaa_region_map: dict = {}
    for reg in noaa_regions:
        num = str(reg.get("region", "")).strip()
        if num:
            noaa_region_map[num] = reg

    def enrich_ar(ar_num: str, ar_data: dict) -> dict:
        """
        Merge ML prediction data with live NOAA solar region metadata.
        NOAA keys: zurich, magtype, area, location, numspot, extent.
        """
        noaa = noaa_region_map.get(ar_num.lstrip("0"), {})
        # Also try zero-padded match
        if not noaa:
            noaa = noaa_region_map.get(ar_num, {})
        zurich   = noaa.get("zurich") or ar_data.get("zurich_class") or "?"
        magtype  = noaa.get("magtype") or ar_data.get("mag_class") or "?"
        area     = noaa.get("area") or ar_data.get("area")
        location = noaa.get("location", "")
        numspot  = noaa.get("numspot") or ar_data.get("num_spots")
        return {
            "ar": ar_num,
            "probability_24h": round(ar_data.get("probability_24h", 0) * 100, 1)
                               if ar_data.get("probability_24h", 0) <= 1
                               else round(ar_data.get("probability_24h", 0), 1),
            "flagged":      ar_data.get("flagged", False),
            "zurich_class": zurich,
            "mag_class":    magtype,
            "area":         area,
            "location":     location,
            "num_spots":    numspot,
            "mu":           ar_data.get("mu"),
            "log_sigma":    ar_data.get("log_sigma"),
            "cycle_phase":  ar_data.get("cycle_phase"),
            "noaa_matched": bool(noaa),
        }

    ctx = {
        "timestamp": None,
        "global_status": "UNKNOWN",
        "global_score": None,
        "top_ars": [],
        "kp_current": None,
        "xray_flux": None,
        "source": "unknown",
        "note": "",
    }

    # Prefer API data (most up-to-date, includes NOAA fallback)
    if api_data.get("status") == "success":
        ctx["global_status"] = api_data.get("global_status", "UNKNOWN")
        ctx["global_score"]  = api_data.get("global_score")
        ctx["kp_current"]    = api_data.get("kp_current")
        ctx["xray_flux"]     = api_data.get("xray_flux")
        ctx["note"]          = api_data.get("note", "")

        raw = api_data.get("data", {})
        if raw:
            sorted_ars = sorted(
                raw.items(),
                key=lambda kv: kv[1].get("probability_24h", 0),
                reverse=True
            )
            ctx["top_ars"] = [enrich_ar(k, v) for k, v in sorted_ars[:5]]

        # Determine source label
        note_lower = ctx["note"].lower()
        if "athenactgru" in note_lower and "heuristic" not in note_lower:
            ctx["source"] = "AthenaCTGRU ML Pipeline"
        else:
            ctx["source"] = "Physics-informed heuristic (NOAA SHARP proxy)"

    # Supplement timestamp from file if available
    if ml_file.get("timestamp"):
        ctx["timestamp"] = ml_file["timestamp"]

    # If API gave no AR data but file has it, layer it in
    if not ctx["top_ars"] and ml_file.get("results"):
        sorted_ars = sorted(
            ml_file["results"].items(),
            key=lambda kv: kv[1].get("probability_24h", 0),
            reverse=True
        )
        ctx["top_ars"] = [enrich_ar(k, v) for k, v in sorted_ars[:5]]
        ctx["source"] = "AthenaCTGRU ML Pipeline (file)"
        ctx["timestamp"] = ml_file.get("timestamp")

    return ctx


# ─── NOAA Data Fetchers ──────────────────────────────────────────────────────

def fetch_noaa_solar_regions() -> list:
    """
    Fetch live NOAA solar region summary.
    Returns list of dicts with region, zurich, magtype, area, location, numspot fields.
    """
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/json/solar_regions.json",
            timeout=6,
        )
        if r.status_code == 200:
            return r.json()[:15]
    except Exception as e:
        logger.warning(f"Could not fetch solar_regions for enrichment: {e}")
    return []


def fetch_current_solar_wind():
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json",
            timeout=5
        )
        data = r.json()
        rows = [row for row in data[1:] if len(row) >= 4]
        if not rows:
            return {"error": "no data"}
        latest = rows[-1]
        return {
            "speed": float(latest[2]) if latest[2] else 0,
            "density": float(latest[1]) if latest[1] else 0,
            "temperature": float(latest[3]) if latest[3] else 0,
            "time": latest[0],
        }
    except Exception as e:
        return {"error": str(e)}


def fetch_kp_index():
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
            timeout=5
        )
        data = r.json()
        for row in reversed(data):
            if isinstance(row, dict):
                val = row.get("Kp")
                if val is not None and val != "" and str(val).strip() != "":
                    return float(val)
            elif isinstance(row, list) and len(row) >= 2:
                val = row[1]
                if val and val != "" and str(val).strip() != "":
                    return float(val)
        return None
    except Exception:
        return None


def fetch_xray_latest():
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
            timeout=5
        )
        data = r.json()
        latest = next(
            (d for d in reversed(data) if d.get("energy") == "0.05-0.4nm"), None
        )
        return float(latest["flux"]) if latest else None
    except Exception:
        return None


def fetch_noaa_alerts():
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/products/alerts.json", timeout=5
        )
        return [a.get("message", "")[:300] for a in r.json()[:3]]
    except Exception:
        return []


def xray_class_label(flux) -> str:
    if flux is None:
        return "Unknown"
    if flux >= 1e-4:
        return "X"
    if flux >= 1e-5:
        return "M"
    if flux >= 1e-6:
        return "C"
    return "B/A"


# ─── Scope Guard ─────────────────────────────────────────────────────────────

SCOPE_KEYWORDS = [
    "solar", "flare", "xray", "x-ray", "kp", "space weather", "magnetogram",
    "active region", "sunspot", "coronal", "geomagnetic", "goes", "noaa",
    "nasa", "esa", "aurora", "bz", "proton", "electron", "solar wind",
    "carrington", "halloween", "storm", "cme", "prediction", "forecast",
    "helicity", "harp", "sharp", "athenactgru", "stellarsynth", "why",
    "probability", "risk", "trend", "rising", "falling", "flux", "window",
    "12h", "24h", "36h", "48h", "hour", "when", "occur", "happen",
    "radio blackout", "satellite", "gnss", "power grid", "hf radio",
    "2003", "2012", "2024", "1989", "historical", "compare",
]

OUT_OF_SCOPE_REPLY = (
    "I'm Stella — a solar flare & space weather analyst. "
    "That question is outside my scope. I can help with:\n"
    "• Current flare risk & ML predictions\n"
    "• Space weather trends (Kp, X-ray, solar wind)\n"
    "• Historical solar events (Halloween 2003, Carrington-type)\n"
    "• Impact on radio, GNSS, satellites, power grids\n\n"
    "Try: \"What's the current flare risk?\" or \"Why is AR 13467 flagged?\""
)


def is_in_scope(message: str) -> bool:
    msg = message.lower()
    return any(kw in msg for kw in SCOPE_KEYWORDS)


# ─── Follow-up Window Detection ──────────────────────────────────────────────

WINDOW_FOLLOWUP_TRIGGERS = [
    "when will", "when is", "when does", "when would", "will it flare",
    "flare occur", "flare happen", "time of flare", "next flare",
    "predict when", "tell me when", "so tell me when",
]

WINDOW_CHIPS = [
    {"label": "⏱️ Next 12 hrs", "q": "What is the flare probability in the next 12 hours?"},
    {"label": "📅 Next 24 hrs", "q": "What is the flare probability in the next 24 hours?"},
    {"label": "🗓️ Next 36 hrs", "q": "What is the flare probability in the next 36 hours?"},
    {"label": "📆 Next 48 hrs", "q": "What is the flare probability in the next 48 hours?"},
]


def needs_window_followup(message: str) -> bool:
    msg = message.lower()
    return any(trigger in msg for trigger in WINDOW_FOLLOWUP_TRIGGERS)


# ─── Prediction → Text Summary ───────────────────────────────────────────────

def prediction_context_to_text(pred: dict) -> str:
    lines = []
    ts = pred.get("timestamp") or datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    lines.append(f"[ML Prediction — as of {ts}]")
    lines.append(f"Source: {pred.get('source', 'unknown')}")

    gs = pred.get("global_status", "UNKNOWN")
    score = pred.get("global_score")
    if score is not None:
        lines.append(f"Global Risk: {gs} ({score*100:.1f}%)")
    else:
        lines.append(f"Global Risk: {gs}")

    kp = pred.get("kp_current")
    if kp is not None:
        kp_label = (
            "Quiet" if kp < 4 else
            "Active" if kp < 6 else
            "Storm" if kp < 8 else "Severe Storm"
        )
        lines.append(f"Current Kp: {kp:.1f} ({kp_label})")

    xf = pred.get("xray_flux")
    if xf:
        lines.append(
            f"Current X-ray Flux: {xf:.2e} W/m² (Class {xray_class_label(xf)})"
        )

    top = pred.get("top_ars", [])
    if top:
        lines.append("\nTop Active Regions (by ML probability):")
        for ar in top:
            flag = "⚠️ FLAGGED" if ar.get("flagged") else ""
            z = ar.get("zurich_class", "") or ""
            m = ar.get("mag_class", "") or ""
            a = ar.get("area") or ""
            loc = ar.get("location", "") or ""
            ns = ar.get("num_spots") or ""

            # Build classification string — only show fields that are actually known
            class_parts = []
            if z and z not in ("?", "None", ""): class_parts.append(f"Zurich: {z}")
            if m and m not in ("?", "None", ""): class_parts.append(f"Mag: {m}")
            if a: class_parts.append(f"Area: {a} μhm")
            if loc: class_parts.append(f"Loc: {loc}")
            if ns: class_parts.append(f"Spots: {ns}")
            class_str = (" [" + " / ".join(class_parts) + "]") if class_parts else ""

            # Model internal signals
            mu = ar.get("mu")
            sig = ar.get("log_sigma")
            cp  = ar.get("cycle_phase")
            signal_parts = []
            if mu is not None and mu > 3:
                signal_parts.append(f"μ={mu:.2f} → High log-energy flux")
            if sig is not None and sig > 0.5:
                signal_parts.append(f"σ={sig:.2f} → High prediction uncertainty/volatility")
            if cp is not None:
                pct = round(cp * 100, 1)
                signal_parts.append(f"cycle_phase={pct}% (Solar cycle position)")
            ml_signals = ("  ML signals: " + "; ".join(signal_parts)) if signal_parts else ""

            lines.append(
                f"  • AR {ar['ar']}{class_str}: {ar['probability_24h']}% 24h flare prob {flag}"
            )
            if ml_signals:
                lines.append(f"    {ml_signals}")

    if pred.get("note"):
        lines.append(f"\nNote: {pred['note']}")

    # ── Dynamic 'Why' context — generated from actual data, not hardcoded ──
    lines.append("\nACTUAL RISK DRIVERS (answer 'Why' questions ONLY from these — do NOT use generic statements):")
    risk_drivers = []

    # Driver 1: Lead AR with ML probability and physical class
    if top:
        lead = top[0]
        ar_id   = lead["ar"]
        prob    = lead["probability_24h"]
        z_str   = lead.get("zurich_class", "")
        m_str   = lead.get("mag_class", "")
        a_val   = lead.get("area") or ""
        mu_val  = lead.get("mu")
        matched = lead.get("noaa_matched", False)
        noaa_tag = " (NOAA-confirmed)" if matched else " (ML-inferred)"
        driver = f"AR {ar_id}{noaa_tag} is the dominant risk contributor at {prob}% 24h probability"
        physical = []
        if z_str and z_str not in ("?", "None", ""):
            physical.append(f"Zurich class {z_str}")
        if m_str and m_str not in ("?", "None", ""):
            physical.append(f"magnetic configuration {m_str}")
        if a_val:
            physical.append(f"area {a_val} μhm")
        if mu_val is not None and mu_val > 3:
            physical.append(f"high log-energy flux (μ={mu_val:.2f})")
        if physical:
            driver += " — physical signals: " + ", ".join(physical)
        risk_drivers.append(driver + ".")

    # Driver 2: X-ray flux
    xf = pred.get("xray_flux")
    if xf:
        cls = xray_class_label(xf)
        if cls in ("X", "M"):
            risk_drivers.append(
                f"X-ray flux is elevated at {xf:.2e} W/m² (Class {cls}) — this independently elevates risk."
            )
        elif cls == "C":
            risk_drivers.append(
                f"X-ray flux is Class C ({xf:.2e} W/m²) — moderate background activity observed."
            )
        else:
            risk_drivers.append(
                f"X-ray flux is low at {xf:.2e} W/m² (Class {cls}) — background activity quiet."
            )
    else:
        risk_drivers.append("X-ray flux data unavailable from GOES at this time.")

    # Driver 3: Kp index
    kp = pred.get("kp_current")
    if kp is not None:
        if kp >= 6:
            risk_drivers.append(
                f"Kp index is {kp:.1f} — active geomagnetic storm conditions, compounding flare risk."
            )
        elif kp >= 4:
            risk_drivers.append(
                f"Kp index is {kp:.1f} — active conditions, elevated geomagnetic background."
            )
        else:
            risk_drivers.append(
                f"Kp index is {kp:.1f} — geomagnetically quiet, not amplifying flare risk."
            )
    else:
        risk_drivers.append("Kp index data unavailable from NOAA at this time.")

    # Driver 4: Secondary ARs if meaningful
    if len(top) > 1:
        secondary = top[1]
        s_prob = secondary["probability_24h"]
        s_id   = secondary["ar"]
        if s_prob > 10:
            risk_drivers.append(
                f"Secondary region AR {s_id} also contributes at {s_prob}% 24h probability — multi-region activity."
            )

    for i, d in enumerate(risk_drivers, 1):
        lines.append(f"{i}. {d}")

    # ── Historical reference table (for comparison questions) ──
    lines.append("\nHISTORICAL REFERENCE TABLE (use ONLY these for comparisons):")
    lines.append("  - Halloween 2003: X17/X10, Kp=9, severe HF blackout, power grid impact in Sweden.")
    lines.append("  - March 1989: X15, Kp=9, Quebec blackout (9h), auroras to Cuba.")
    lines.append("  - July 2012: X1.4 (missed Earth), estimated Kp=9+ if geoeffective, extreme GNSS impact.")
    lines.append("  - September 2017: X9.3+X8.2, HF blackout, GNSS errors up to 50m.")
    lines.append("  - Carrington 1859: Estimated X45+, telegraphs failed worldwide, Kp off-scale.")

    return "\n".join(lines)


# ─── System Prompt Builder ────────────────────────────────────────────────────

STELLA_BASE_SYSTEM = """You are Stella ✨ — StellarSynth's AI space weather analyst, built on real ML predictions from AthenaCTGRU and live NOAA telemetry.

STRICT RULES (never break these):
1. ALWAYS lead your response with the latest ML prediction timestamp and risk band (e.g., "As of [timestamp], the current flare risk is [Band]...").
2. NEVER generate or guess flare probabilities. Only quote numbers from the [ML Prediction] block above. If you have no prediction data, say so clearly.
3. For "Why" questions: MANDATORY — use ONLY the numbered points in the "ACTUAL RISK DRIVERS" section below. Do NOT write generic boilerplate like "top signals include active regions and X-ray flux". Instead, name specific AR numbers, exact probabilities, and their measured physical signals (log-energy flux mu, prediction uncertainty sigma, solar cycle phase, Zurich class, magnetic configuration). If a region is marked "(ML-inferred)", explain that the AthenaCTGRU model detected this AR in its 36h SHARP magnetogram window, but it is no longer listed in NOAA's current active region catalog.
4. If asked about a flare window (12h/24h/36h/48h), explain that the 24h probabilities are what the ML model outputs. You cannot give 12h or 36h numbers directly — use 24h as proxy.
5. Historical comparisons MUST use ONLY the entries in the "HISTORICAL REFERENCE TABLE" section below. Never fabricate outcomes or invent X-class/Kp values.
6. If a question is outside scope (cooking, code, general knowledge, etc.), politely redirect.

RESPONSE FORMAT (always follow this structure for solar/prediction questions):
**🔴 Current Risk** — [QUIET/MODERATE/STRONG] ([score]%) as of [timestamp]
**🔍 Why** — [Cite specific AR numbers, exact probabilities, and measured signals from ACTUAL RISK DRIVERS — NO generic text]
**📚 Historical Similarity** — [Only if a matching event exists in HISTORICAL REFERENCE TABLE; otherwise say "No close historical analog at this risk level"]
**⚡ Action/Impact** — [Specific impact tied to the current Kp and X-ray class: radio blackout band, GNSS accuracy loss, aurora latitude]
**📡 Sources** — StellarSynth AthenaCTGRU · NOAA SWPC · GOES

For simple factual or historical questions, you may use a shorter format — but always ground answers in the prediction data when available.
"""


def build_system_prompt(pred_ctx: dict, noaa_ctx: str) -> str:
    pred_text = prediction_context_to_text(pred_ctx) if pred_ctx.get("global_score") is not None else "[No ML prediction currently available — pipeline may not have run yet]"
    return f"""{STELLA_BASE_SYSTEM}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE DATA INJECTED BY STELLARSYNTH:
{pred_text}

Live NOAA Telemetry:
{noaa_ctx}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""


def build_noaa_context() -> str:
    sw = fetch_current_solar_wind()
    kp = fetch_kp_index()
    xray = fetch_xray_latest()
    alerts = fetch_noaa_alerts()

    parts = []
    if "error" not in sw:
        parts.append(
            f"Solar Wind: Speed={sw['speed']:.0f} km/s, "
            f"Density={sw['density']:.1f} p/cm³, "
            f"Temperature={sw['temperature']:.0f} K"
        )
    if kp is not None:
        level = (
            "Quiet" if kp < 4 else
            "Active" if kp < 6 else
            "Storm" if kp < 8 else "Severe Storm"
        )
        parts.append(f"Kp Index: {kp:.1f} ({level})")
    if xray:
        cls = xray_class_label(xray)
        parts.append(f"X-ray Flux: {xray:.2e} W/m² (Class {cls})")
    if alerts:
        parts.append("Recent NOAA Alerts:\n" + "\n".join(alerts))

    return "\n".join(parts) if parts else "NOAA telemetry temporarily unavailable."


# ─── NOAA Flare Report Fetcher ───────────────────────────────────────────────

def fetch_flare_reports() -> list:
    """
    Fetch the latest solar flare events from NOAA SWPC.
    Returns a list of flare event dicts (pure JSON, no ML inference).
    """
    urls = [
        "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json",
        "https://services.swpc.noaa.gov/json/solar_regions.json",
    ]
    results = {}
    # Flare events
    try:
        r = requests.get(
            "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json",
            timeout=6,
        )
        if r.status_code == 200:
            flares = r.json()
            results["flares"] = flares[:20]  # last 20 events
        else:
            results["flares"] = []
    except Exception as e:
        logger.warning(f"Could not fetch flare events: {e}")
        results["flares"] = []

    # Solar region summary (active regions)
    try:
        r2 = requests.get(
            "https://services.swpc.noaa.gov/json/solar_regions.json",
            timeout=6,
        )
        if r2.status_code == 200:
            regions = r2.json()
            results["solar_regions"] = regions[:15]
        else:
            results["solar_regions"] = []
    except Exception as e:
        logger.warning(f"Could not fetch solar regions: {e}")
        results["solar_regions"] = []

    # Geomagnetic storm forecast
    try:
        r3 = requests.get(
            "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
            timeout=6,
        )
        if r3.status_code == 200:
            kp_forecast_raw = r3.json()
            # First row is header
            header = kp_forecast_raw[0] if kp_forecast_raw else []
            rows = kp_forecast_raw[1:] if len(kp_forecast_raw) > 1 else []
            results["kp_forecast"] = [dict(zip(header, row)) for row in rows[:24]]
        else:
            results["kp_forecast"] = []
    except Exception as e:
        logger.warning(f"Could not fetch Kp forecast: {e}")
        results["kp_forecast"] = []

    return results


# ─── Status Endpoint ─────────────────────────────────────────────────────────

@router.get("/status")
def stella_status():
    sw = fetch_current_solar_wind()
    kp = fetch_kp_index()
    xray = fetch_xray_latest()
    alerts = fetch_noaa_alerts()
    pred = build_prediction_context()

    return {
        "solar_wind": sw,
        "kp_index": kp,
        "xray_flux": xray,
        "xray_class": xray_class_label(xray),
        "alerts_count": len(alerts),
        "prediction": {
            "global_status": pred.get("global_status"),
            "global_score": pred.get("global_score"),
            "timestamp": pred.get("timestamp"),
            "source": pred.get("source"),
            "top_ars": pred.get("top_ars", []),
        },
        "refreshed_at": datetime.utcnow().isoformat() + "Z",
    }


# ─── Flare Reports Endpoint (pure NOAA JSON, no ML) ─────────────────────────

@router.get("/flare-reports")
def get_flare_reports():
    """
    Returns raw NOAA flare events, active solar regions, and Kp forecast.
    No ML prediction — data is fetched directly from NOAA SWPC JSON feeds.
    """
    data = fetch_flare_reports()
    return {
        "flares": data.get("flares", []),
        "solar_regions": data.get("solar_regions", []),
        "kp_forecast": data.get("kp_forecast", []),
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "source": "NOAA SWPC (live JSON feeds)",
    }


# ─── NOAA Live Telemetry Endpoint (pure JSON, no ML) ────────────────────────

@router.get("/noaa-live")
def get_noaa_live():
    """
    Returns current solar wind, Kp index, X-ray flux, and NOAA alerts.
    Purely fetched from NOAA — no ML inference involved.
    """
    sw = fetch_current_solar_wind()
    kp = fetch_kp_index()
    xray = fetch_xray_latest()
    alerts = fetch_noaa_alerts()
    return {
        "solar_wind": sw,
        "kp_index": kp,
        "xray_flux": xray,
        "xray_class": xray_class_label(xray),
        "alerts": alerts,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "source": "NOAA SWPC (live JSON feeds)",
    }


# ─── Chat Endpoint ────────────────────────────────────────────────────────────

@router.post("/chat")
def chat_with_stella(data: ChatMessage):
    message = data.message.strip()
    session_id = data.session_id or "default"

    # Scope guard
    if not is_in_scope(message):
        return {
            "reply": OUT_OF_SCOPE_REPLY,
            "source": "Stella (scope guard)",
            "suggest_window_followup": False,
            "window_chips": [],
        }

    try:
        # Fetch live prediction + NOAA telemetry
        pred_ctx  = build_prediction_context()
        noaa_ctx  = build_noaa_context()
        system_prompt = build_system_prompt(pred_ctx, noaa_ctx)

        # Build message list from client history (last 10 turns), prefer server memory if exists
        server_history = _chat_sessions.get(session_id, [])
        if server_history:
            history = server_history[-10:]
        else:
            history = [
                {"role": h["role"], "content": h["content"]}
                for h in data.history[-10:]
            ]
        messages = (
            [{"role": "system", "content": system_prompt}]
            + history
            + [{"role": "user", "content": message}]
        )

        resp = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=600,
        )
        reply = resp.choices[0].message.content.strip()

        # Persist in server-side session memory
        if session_id not in _chat_sessions:
            _chat_sessions[session_id] = []
        _chat_sessions[session_id].append({"role": "user", "content": message})
        _chat_sessions[session_id].append({"role": "assistant", "content": reply})
        # Keep last 40 turns in memory
        _chat_sessions[session_id] = _chat_sessions[session_id][-40:]

        # Detect if follow-up window chips should be shown
        show_window = needs_window_followup(message) or pred_ctx.get("global_status") in ["MODERATE", "STRONG"]

        logger.info(
            f"Stella chat: session={session_id}, "
            f"query='{message[:60]}', "
            f"pred_status={pred_ctx.get('global_status')}"
        )

        return {
            "reply": reply,
            "source": f"Stella AI ({pred_ctx.get('source', 'N/A')} · Llama 3.3-70B)",
            "prediction_snapshot": {
                "global_status": pred_ctx.get("global_status"),
                "global_score": pred_ctx.get("global_score"),
                "timestamp": pred_ctx.get("timestamp"),
                "top_ars": pred_ctx.get("top_ars", [])[:3],
            },
            "suggest_window_followup": show_window,
            "window_chips": WINDOW_CHIPS if show_window else [],
        }

    except Exception as e:
        logger.error(f"Stella error: {e}", exc_info=True)
        kp = fetch_kp_index()
        return {
            "reply": (
                f"I'm having trouble right now. "
                f"Live data: Kp={kp or 'N/A'}. Please try again shortly."
            ),
            "source": "Fallback",
            "suggest_window_followup": False,
            "window_chips": [],
        }


# ─── Clear Chat ───────────────────────────────────────────────────────────────

@router.post("/clear")
def clear_chat(data: ClearChatRequest):
    session_id = data.session_id or "default"
    _chat_sessions.pop(session_id, None)
    return {"status": "cleared", "session_id": session_id}


# ─── Session History ──────────────────────────────────────────────────────────

@router.get("/history/{session_id}")
def get_chat_history(session_id: str):
    return {
        "session_id": session_id,
        "messages": _chat_sessions.get(session_id, []),
    }
