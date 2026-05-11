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
    """
    # Try realtime API first (covers both live ML and heuristic fallback)
    api_data = fetch_realtime_prediction_api()
    ml_file  = fetch_live_ml_predictions()

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
            ctx["top_ars"] = [
                {
                    "ar": k,
                    "probability_24h": round(v.get("probability_24h", 0) * 100, 1),
                    "flagged": v.get("flagged", False),
                    "zurich_class": v.get("zurich_class", "?"),
                    "mag_class": v.get("mag_class", "?"),
                    "area": v.get("area"),
                    "mu": v.get("mu"),
                }
                for k, v in sorted_ars[:5]
            ]

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
        ctx["top_ars"] = [
            {
                "ar": k,
                "probability_24h": round(v.get("probability_24h", 0) * 100, 1),
                "flagged": v.get("flagged", False),
                "mu": v.get("mu"),
                "log_sigma": v.get("log_sigma"),
                "cycle_phase": v.get("cycle_phase"),
            }
            for k, v in sorted_ars[:5]
        ]
        ctx["source"] = "AthenaCTGRU ML Pipeline (file)"
        ctx["timestamp"] = ml_file.get("timestamp")

    return ctx


# ─── NOAA Data Fetchers ──────────────────────────────────────────────────────

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
            z = ar.get("zurich_class", "")
            m = ar.get("mag_class", "")
            a = ar.get("area", 0)
            class_str = f" [Zurich: {z} / Mag: {m} / Area: {a}]" if z or m else ""
            
            mu = ar.get("mu")
            sig = ar.get("log_sigma")
            energy_str = ""
            if mu is not None and mu > 3: energy_str += " (High energy flux)"
            if sig is not None and sig > 0.5: energy_str += " (High uncertainty/volatility)"
            
            lines.append(
                f"  • AR {ar['ar']}{class_str}: {ar['probability_24h']}% 24h prob {flag}{energy_str}"
            )

    if pred.get("note"):
        lines.append(f"\nNote: {pred['note']}")
        
    lines.append("\nTOP 3 RISK DRIVERS (Use this to answer 'Why' questions):")
    lines.append("1. Active Regions with high probability, complex magnetic class, or high energy flux.")
    lines.append("2. Recent X-ray flux class (if M or X, risk is already elevated).")
    lines.append("3. Elevated Kp index (geomagnetic storming).")

    return "\n".join(lines)


# ─── System Prompt Builder ────────────────────────────────────────────────────

STELLA_BASE_SYSTEM = """You are Stella ✨ — StellarSynth's AI space weather analyst, built on real ML predictions from AthenaCTGRU and live NOAA telemetry.

STRICT RULES (never break these):
1. ALWAYS lead your response with the latest ML prediction timestamp and risk band (e.g., "As of [timestamp], the current flare risk is [Band]...").
2. NEVER generate or guess flare probabilities. Only quote numbers from the [ML Prediction] block above. If you have no prediction data, say so clearly.
3. For "Why" questions: Extract the top 3 contributing signals from the AR data (e.g., zurich_class, mag_class, probability, high energy flux) and telemetry.
4. If asked about a flare window (12h/24h/36h/48h), explain that the 24h probabilities are what the ML model outputs. You cannot give 12h or 36h numbers directly — use 24h as proxy.
5. Historical comparisons MUST use the provided reference table (Halloween 2003, March 1989, Carrington 1859, July 2012, September 2017). Never fabricate outcomes.
6. If a question is outside scope (cooking, code, general knowledge, etc.), politely redirect.

RESPONSE FORMAT (always follow this structure for solar/prediction questions):
**🔴 Current Risk** — [QUIET/MODERATE/STRONG] ([score]%) as of [timestamp]
**🔍 Why** — [Top 2-3 signals: e.g., AR 13467 (beta-gamma) at 43%, X-ray rising to M-class, Kp=4.2]
**📚 Historical Similarity** — [brief comparison to known events, only if clearly relevant]
**⚡ Action/Impact** — [one line: what this means for radio/GNSS/satellites/auroras]
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
