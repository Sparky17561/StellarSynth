from fastapi import APIRouter
from pydantic import BaseModel
import os
import requests
import logging
from groq import Groq
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

class ChatMessage(BaseModel):
    message: str
    history: list = []

# ─── NOAA Data Fetchers ─────────────────────────────────────────────────────

def fetch_current_solar_wind():
    """Mirrors SolarWindProvider.jsx plasma-7-day fetch"""
    try:
        r = requests.get("https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json", timeout=5)
        data = r.json()
        # Skip header row (index 0), take last valid entry
        rows = [row for row in data[1:] if len(row) >= 4]
        if not rows:
            return {"error": "no data"}
        latest = rows[-1]
        return {
            "speed": float(latest[2]) if latest[2] else 0,
            "density": float(latest[1]) if latest[1] else 0,
            "temperature": float(latest[3]) if latest[3] else 0,
            "time": latest[0]
        }
    except Exception as e:
        return {"error": str(e)}

def fetch_kp_index():
    """Mirrors SolarWindProvider.jsx noaa-planetary-k-index fetch — handles both old array and new object format"""
    try:
        r = requests.get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", timeout=5)
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
    except Exception as e:
        return None

def fetch_xray_latest():
    """Mirrors SolarWindProvider.jsx xrays-7-day fetch (short wavelength band)"""
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json", timeout=5)
        data = r.json()
        # Same filter as SolarWindProvider: energy == "0.05-0.4nm"
        latest = next((d for d in reversed(data) if d.get("energy") == "0.05-0.4nm"), None)
        return float(latest["flux"]) if latest else None
    except Exception as e:
        return None

def fetch_noaa_alerts():
    try:
        r = requests.get("https://services.swpc.noaa.gov/products/alerts.json", timeout=5)
        return [a.get("message", "")[:300] for a in r.json()[:3]]
    except Exception as e:
        return []

def fetch_10yr_flare_data():
    """Fetch 7-day X-ray sample for historical context queries"""
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json", timeout=5)
        flares = r.json()
        x_class = [f for f in flares if float(f.get("flux", 0) or 0) >= 1e-4]
        m_class = [f for f in flares if 1e-5 <= float(f.get("flux", 0) or 0) < 1e-4]
        return len(x_class), len(m_class), len(flares)
    except Exception as e:
        return 0, 0, 0

def build_context(message: str) -> str:
    """Build NOAA data context to inject into prompts"""
    msg_lower = message.lower()
    ctx_parts = []

    # Always inject current conditions
    sw = fetch_current_solar_wind()
    kp = fetch_kp_index()
    xray = fetch_xray_latest()
    alerts = fetch_noaa_alerts()

    if "error" not in sw:
        ctx_parts.append(
            f"Current Solar Wind: Speed={sw['speed']:.0f} km/s, "
            f"Density={sw['density']:.1f} p/cm³, "
            f"Temperature={sw['temperature']:.0f} K"
        )
    if kp is not None:
        level = "Quiet" if kp < 4 else ("Active" if kp < 6 else ("Storm" if kp < 8 else "Severe Storm"))
        ctx_parts.append(f"Current Kp Index: {kp:.1f} ({level})")
    if xray:
        cls = "X" if xray >= 1e-4 else ("M" if xray >= 1e-5 else ("C" if xray >= 1e-6 else "B/A"))
        ctx_parts.append(f"Current X-ray Flux: {xray:.2e} W/m² (Class {cls})")
    if alerts:
        ctx_parts.append("Recent NOAA Alerts:\n" + "\n".join(alerts))
    if "10-year" in msg_lower or "historical" in msg_lower or "2020" in msg_lower or "decade" in msg_lower:
        x_cnt, total = fetch_10yr_flare_data()
        ctx_parts.append(f"7-day X-ray sample: {x_cnt} X-class level events out of {total} readings")

    return "\n".join(ctx_parts)

# ─── Chat Endpoint ────────────────────────────────────────────────────────────

@router.post("/chat")
def chat_with_stella(data: ChatMessage):
    try:
        noaa_context = build_context(data.message)
        system_prompt = f"""You are Stella, an advanced AI space weather scientist and analyst developed by the StellarSynth team.
You have direct access to live NOAA telemetry and space weather data.

Current NOAA Telemetry Data:
{noaa_context}

Your capabilities:
- Show current solar activity (solar wind speed, density, Kp index, X-ray flux)
- Analyze space weather trends and historical patterns
- Calculate flare risk based on current conditions
- Explain complex space weather phenomena clearly
- Provide actionable alerts for satellite operators, radio enthusiasts, and power grid managers

Guidelines:
- Be data-driven: reference the telemetry numbers above in your answers
- Be concise but precise — 2-4 sentences max for most answers
- Use technical terms but explain them briefly
- If the user asks about time ranges you don't have data for, acknowledge that and use current data as a proxy
- Always cite which data source (NOAA SWPC, GOES) you're referencing"""

        history = [{"role": h["role"], "content": h["content"]} for h in data.history[-8:]]
        messages = [{"role": "system", "content": system_prompt}] + history + [{"role": "user", "content": data.message}]

        resp = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.4,
            max_tokens=350,
        )
        reply = resp.choices[0].message.content.strip()
        logger.info(f"Stella chat: query='{data.message[:60]}', context_len={len(noaa_context)}")
        return {"reply": reply, "source": "Stella AI (NOAA + Llama 3.3-70B)", "context": noaa_context}
    except Exception as e:
        logger.error(f"Stella error: {e}", exc_info=True)
        return {"reply": f"I'm having trouble connecting right now. NOAA data suggests: Kp={fetch_kp_index() or 'N/A'}. Please try again shortly.", "source": "Fallback"}
