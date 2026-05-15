import os
import logging
import requests
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

# ─── Environment & Clients ───────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
logger = logging.getLogger("stella")

router = APIRouter()

@router.get("/status")
def get_stella_status():
    """Alias for /noaa-live to satisfy frontend polling"""
    sw = fetch_current_solar_wind()
    kp = fetch_kp_index()
    xray = fetch_xray_latest()
    return {
        "solar_wind": sw,
        "kp_index": kp,
        "xray_flux": xray,
        "xray_class": xray_class_label(xray if xray else 0),
        "prediction": {"global_status": "QUIET", "global_score": 0.1} # Placeholder for proactive trigger
    }

# In-memory session store (last 40 messages per session)
_chat_sessions = {}

# ─── Models ──────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    message: str
    history: List[dict] = []
    session_id: Optional[str] = None
    reply_context: Optional[str] = None

class ClearChatRequest(BaseModel):
    session_id: Optional[str] = None

# ─── Out of Scope Logic ──────────────────────────────────────────────────────
SCOPE_KEYWORDS = [
    "sun", "flare", "solar", "aurora", "geomagnetic", "kp", "wind", "x-ray", "proton",
    "satellite", "gps", "radio", "blackout", "sunspot", "active region", "ar", "space weather",
    "stellar", "athena", "predict", "forecast", "noaa", "goes", "magnetosphere", "ionosphere",
    "bz", "component", "density", "speed", "temperature", "plasma", "flux", "briefing", "report",
    "magnetic", "field", "energy", "activity", "feature", "science", "earth", "physics"
]

OUT_OF_SCOPE_REPLY = "I'm specialized in solar physics and space weather analytics. I can't help with that request, but I can certainly tell you about the current flare risk or active sunspots! ☀️"

def is_in_scope(query: str, context: Optional[str] = None, history: List[dict] = []) -> bool:
    q = query.lower().strip()
    
    # 1. BLOCK OBVIOUS NON-SPACE-WEATHER PATTERNS (Highest Priority)
    # Check for math operators with numbers
    import re
    if re.search(r'\d+\s*[\+\-\*/=]\s*\d+', q):
        return False
    
    # Block specific non-space-weather topics
    FORBIDDEN_TOPICS = ["recipe", "joke", "capital of", "who is", "weather in", "stock price", "crypto"]
    if any(f in q for f in FORBIDDEN_TOPICS):
        # Allow "who is" only if it's "who is Stella"
        if "who is stella" not in q:
            return False

    # 2. Dashboard context is a trusted signature (Second Priority)
    if context and any(c in context.lower() for c in ["chart", "region", "ar", "data"]):
        return True

    # 3. Check for PRIMARY space weather keywords
    has_primary_keyword = any(k in q for k in SCOPE_KEYWORDS)
    
    # 4. Handle follow-up phrases (only if history is relevant)
    FOLLOW_UP_PHRASES = ["try again", "go on", "explain", "more", "why", "how", "tell me more", "what does that mean"]
    is_follow_up = any(f in q for f in FOLLOW_UP_PHRASES)

    if has_primary_keyword:
        # Check for mixed queries like "What is Bz and 2+2"
        # If it has a primary keyword AND a math-like or trivia-like structure, block it to be safe
        if "?" in q and (" and " in q or "," in q):
            # Split by conjunctions and check if any part is suspicious
            parts = re.split(r'and|,|\?', q)
            for p in parts:
                p = p.strip()
                if p and not any(k in p for k in SCOPE_KEYWORDS + FOLLOW_UP_PHRASES + ["hi", "hello", "hey"]):
                    # This part looks unrelated
                    return False
        return True

    if is_follow_up:
        if history:
            # Only allow if the last assistant message was successful
            last_assistant = next((m for m in reversed(history) if m["role"] == "assistant"), None)
            if last_assistant and OUT_OF_SCOPE_REPLY not in last_assistant["content"]:
                return True

    # 5. Greetings
    if any(greet == q.rstrip('?!.') for greet in ["hi", "hello", "hey", "thanks", "thank you", "bye"]):
        return True
        
    return False

# ─── Helper Functions ────────────────────────────────────────────────────────
def xray_class_label(flux: Optional[float]) -> str:
    if flux is None: return "A"
    if flux >= 1e-4: return "X"
    if flux >= 1e-5: return "M"
    if flux >= 1e-6: return "C"
    if flux >= 1e-7: return "B"
    return "A"

def fetch_current_solar_wind():
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/plasma-7-day.json", timeout=5)
        if r.status_code == 200:
            data = r.json()
            latest = data[-1]
            return {
                "speed": latest.get("speed", 0),
                "density": latest.get("density", 0),
                "temperature": latest.get("temperature", 0)
            }
    except: pass
    return {"error": "unavailable"}

def fetch_kp_index():
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", timeout=5)
        if r.status_code == 200:
            return r.json()[-1].get("kp_index")
    except: pass
    return None

def fetch_xray_latest():
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/goes/primary/xray-1-minute.json", timeout=5)
        if r.status_code == 200:
            return r.json()[-1].get("flux")
    except: pass
    return None

def fetch_noaa_alerts():
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/alerts.json", timeout=5)
        if r.status_code == 200:
            return [a.get("message", "")[:200] for a in r.json()[:3]]
    except: pass
    return []

def fetch_flare_reports():
    results = {"flares": [], "solar_regions": [], "kp_forecast": []}
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json", timeout=5)
        if r.status_code == 200: results["flares"] = r.json()[:10]
        
        r2 = requests.get("https://services.swpc.noaa.gov/json/solar_regions.json", timeout=5)
        if r2.status_code == 200: results["solar_regions"] = r2.json()[:15]
        
        r3 = requests.get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json", timeout=5)
        if r3.status_code == 200:
            raw = r3.json()
            if len(raw) > 1:
                results["kp_forecast"] = [dict(zip(raw[0], row)) for row in raw[1:13]]
    except: pass
    return results

from modules.predict.router import get_realtime_prediction

def build_prediction_context():
    """
    Fetch live ML predictions from the AthenaCTGRU pipeline.
    """
    try:
        # Call the existing realtime prediction logic
        pred = get_realtime_prediction()
        if pred.get("status") == "success":
            return {
                "global_status": pred.get("global_status", "QUIET"),
                "global_score": pred.get("global_score", 0.1),
                "top_ars": [
                    {
                        "ar": ar_id,
                        "probability_24h": round(info.get("probability_24h", 0) * 100, 1),
                        "mag_class": info.get("mag_class", "N/A"),
                        "zurich_class": info.get("zurich_class", "N/A"),
                        "area": info.get("area", 0)
                    }
                    for ar_id, info in pred.get("data", {}).items()
                ],
                "source": pred.get("note", "AthenaCTGRU"),
                "timestamp": pred.get("timestamp")
            }
    except Exception as e:
        logger.error(f"Failed to fetch ML context for Stella: {e}")
    
    return {"global_status": "QUIET", "global_score": 0.1, "top_ars": []}

def prediction_context_to_text(pred: dict) -> str:
    lines = []
    gs = pred.get("global_status", "UNKNOWN")
    score = pred.get("global_score")
    if score is not None:
        lines.append(f"Current Global Flare Risk: {gs} ({score*100:.1f}%)")
    
    top = pred.get("top_ars", [])
    if top:
        lines.append("\nTop Active Regions:")
        for ar in top:
            lines.append(f"  • AR {ar.get('ar')}: {ar.get('probability_24h')}% risk, Class {ar.get('mag_class')}")
            
    return "\n".join(lines)

STELLA_BASE_SYSTEM = """You are Stella ✨ — StellarSynth's lead space weather analyst.
Your goal is to provide intelligent, conversational, and visually engaging space weather insights using Rich Markdown.

REPORTING PHILOSOPHY:
1. RICH MARKDOWN: You MUST use **bold text** for emphasis, - bullet points for lists, and ### headings for organization. Never return plain text.
2. CONVERSATIONAL FIRST: Talk like a human analyst. Answer directly and naturally, but keep the professional "mission control" formatting.
3. NO REDUNDANT HEADINGS: Only provide a full ## Solar Status report if the user explicitly asks for a "forecast," "status," "briefing," or "summary."
4. DATA GROUNDING: Use the actual 'Global Flare Risk' percentage (e.g. 39.7%) and AR numbers (e.g. AR 13526) to justify your analysis.
5. JARGON FILTER: Strictly avoid scientific notation (1e-07) or mu/sigma. Use terms like "Solar Gusts," "Magnetic Tension," and "Tech Glitches."

Example Formatting:
"It's a great question about **Bz**! 
- Think of it like a **magnetic doorway**.
- When it's 'negative,' that door is wide open for solar energy.
Your GPS should be **stable** today, but keep an eye out for those auroras!"
"""

def build_system_prompt(pred_ctx: dict, noaa_ctx: str) -> str:
    pred_text = prediction_context_to_text(pred_ctx)
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
    parts = []
    if "speed" in sw:
        parts.append(f"Solar Wind: {sw['speed']} km/s, Density: {sw['density']}")
    if kp is not None:
        parts.append(f"Kp Index: {kp}")
    if xray:
        parts.append(f"X-ray Flux: {xray:.2e}")
    return "\n".join(parts)

# ─── Smart Suggestions Logic ────────────────────────────────────────────────
def generate_smart_suggestions(message: str, reply: str, pred_ctx: dict) -> list:
    """Generate 3 context-aware follow-up questions for the user."""
    gs = pred_ctx.get("global_status", "QUIET")
    suggestions = []
    
    # 1. Base suggestions based on risk
    if gs in ["MODERATE", "STRONG"]:
        suggestions.append({ "label": "🚨 Prep for flare", "q": "What specific actions should I take to prepare for this risk level?" })
    else:
        suggestions.append({ "label": "☀️ Why is it quiet?", "q": "Why is the Sun so quiet right now? Are there any hidden sunspots?" })

    # 2. Contextual suggestions based on last message
    m_low = message.lower()
    if "ar" in m_low or "active region" in m_low:
        suggestions.append({ "label": "📍 Where is it?", "q": "Where is this region located on the Sun and is it facing Earth?" })
    elif any(x in m_low for x in ["gps", "tech", "satellite", "radio"]):
        suggestions.append({ "label": "📱 Signal stability", "q": "When will my GPS/Radio signals return to normal?" })
    else:
        suggestions.append({ "label": "🔮 48h Forecast", "q": "What does the space weather look like for the next 48 hours?" })

    # 3. Informational
    suggestions.append({ "label": "ⓘ Flare 101", "q": "Explain the difference between M-class and X-class flares in simple terms." })
    
    return suggestions[:3]

# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/flare-reports")
def get_flare_reports():
    return fetch_flare_reports()

@router.get("/noaa-live")
def get_noaa_live():
    sw = fetch_current_solar_wind()
    kp = fetch_kp_index()
    xray = fetch_xray_latest()
    return {
        "solar_wind": sw,
        "kp_index": kp,
        "xray_flux": xray,
        "xray_class": xray_class_label(xray if xray else 0)
    }

@router.post("/chat")
def chat_with_stella(data: ChatMessage):
    message = data.message.strip()
    session_id = data.session_id or "default"
    reply_context = getattr(data, "reply_context", None)
    
    # Check if this session already has valid history
    session_history = _chat_sessions.get(session_id, [])

    if not is_in_scope(message, reply_context, session_history):
        return {
            "reply": OUT_OF_SCOPE_REPLY,
            "source": "Stella (scope guard)",
            "suggest_window_followup": False,
            "window_chips": [],
        }

    try:
        pred_ctx = build_prediction_context()
        noaa_ctx = build_noaa_context()
        system_prompt = build_system_prompt(pred_ctx, noaa_ctx)

        # Build message history
        raw_history = data.history[-12:]
        sanitized_history = []
        for i, m in enumerate(raw_history):
            # If this was an assistant message giving the Out of Scope reply, skip it and the preceding user message
            if m["role"] == "assistant" and OUT_OF_SCOPE_REPLY in m["content"]:
                if sanitized_history and sanitized_history[-1]["role"] == "user":
                    sanitized_history.pop()
                continue
            sanitized_history.append({"role": m["role"], "content": m["content"]})

        messages = [{"role": "system", "content": system_prompt}] + sanitized_history + [{"role": "user", "content": message}]

        if not client:
            raise HTTPException(status_code=500, detail="Groq client not configured")

        resp = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.4,
            max_tokens=800,
        )
        reply = resp.choices[0].message.content.strip()

        # Update session memory
        if session_id not in _chat_sessions: _chat_sessions[session_id] = []
        _chat_sessions[session_id].append({"role": "user", "content": message})
        _chat_sessions[session_id].append({"role": "assistant", "content": reply})
        _chat_sessions[session_id] = _chat_sessions[session_id][-40:]

        smart_chips = generate_smart_suggestions(message, reply, pred_ctx)

        return {
            "reply": reply,
            "source": "Stella AI (Llama 3.3-70B)",
            "suggest_window_followup": True,
            "window_chips": smart_chips,
        }
    except Exception as e:
        logger.error(f"Stella Chat Error: {e}")
        return {
            "reply": "I'm experiencing a brief connection issue with my solar sensors. Please try again in a moment!",
            "source": "Stella (System)",
            "suggest_window_followup": False,
            "window_chips": []
        }

@router.post("/clear")
def clear_chat(data: ClearChatRequest):
    session_id = data.session_id or "default"
    _chat_sessions.pop(session_id, None)
    return {"status": "cleared", "session_id": session_id}

@router.get("/history/{session_id}")
def get_chat_history(session_id: str):
    return {"messages": _chat_sessions.get(session_id, [])}
