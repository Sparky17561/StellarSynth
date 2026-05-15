from fastapi import APIRouter
from pydantic import BaseModel
import os
import logging
from groq import Groq
from dotenv import load_dotenv
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
router = APIRouter()

# Initialize Groq client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

from modules.stella.router import (
    build_noaa_context,
    build_prediction_context,
    prediction_context_to_text,
    fetch_kp_index,
    fetch_xray_latest,
    xray_class_label,
)

class DashboardData(BaseModel):
    pass # No longer needed, but keeping for backwards compatibility

@router.get("/")
def get_dashboard():
    return {"message": "Dashboard endpoint"}

@router.post("/insight")
def get_ai_insight():
    try:
        # ── Fetch all live data that the dashboard charts show ──
        noaa_context = build_noaa_context()
        pred_ctx = build_prediction_context()
        pred_text = prediction_context_to_text(pred_ctx)
        current_kp = fetch_kp_index() or 0.0
        xray_flux = fetch_xray_latest()
        xray_cls = xray_class_label(xray_flux)

        # ── Summarize active region risk ──
        top_ars = pred_ctx.get("top_ars", [])
        ar_summary = ""
        if top_ars:
            lead = top_ars[0]
            ar_summary = (
                f"The dominant active region is AR {lead['ar']} "
                f"with a {lead['probability_24h']}% 24h flare probability"
            )
            if lead.get('zurich_class') and lead['zurich_class'] not in ('?', 'None', ''):
                ar_summary += f" (Zurich {lead['zurich_class']}"
                if lead.get('mag_class') and lead['mag_class'] not in ('?', 'None', ''):
                    ar_summary += f", {lead['mag_class']} magnetic config"
                ar_summary += ")"
            ar_summary += "."
            if len(top_ars) > 1:
                second = top_ars[1]
                if second['probability_24h'] > 10:
                    ar_summary += (
                        f" AR {second['ar']} is a secondary contributor at {second['probability_24h']}%."
                    )

        global_status = pred_ctx.get("global_status", "QUIET")
        global_score = pred_ctx.get("global_score")
        score_str = f"{global_score*100:.1f}%" if global_score is not None else "unknown"
        ts = pred_ctx.get("timestamp") or datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        # ── Kp risk level label ──
        kp_level = (
            "Severe Storm" if current_kp >= 8 else
            "Major Storm" if current_kp >= 7 else
            "Storm" if current_kp >= 6 else
            "Active" if current_kp >= 4 else
            "Quiet"
        )

        xf_str = f"{xray_flux:.2e} W/m²" if xray_flux is not None else "Data unavailable"
        prompt = f"""You are Stella, StellarSynth's AI space weather analyst. Your task is to provide a simple, human-readable summary of the current space weather situation that anyone can understand. Summarize the status of all live telemetry (flares, geomagnetic activity, solar wind) in plain English.

LIVE DATA:
- Global flare prediction: {global_status} ({score_str} probability)
- Active Regions summary: {ar_summary}
- Current Kp index: {current_kp:.1f} ({kp_level})
- Current X-ray class: {xray_cls} ({xf_str})
- Additional NOAA telemetry:
{noaa_context}

RULES:
1. Write a 3-sentence paragraph in simple, human terms.
2. Sentence 1: Summarize the overall "vibe" of the space weather (e.g., "The Sun is relatively calm today" or "We're currently seeing a bit of solar excitement").
3. Sentence 2: Explain what this actually means for a normal person (e.g., "This might mean slightly prettier auroras up north but no major issues for your tech").
4. Sentence 3: Give one clear, concrete recommendation (e.g., "It's a great night for aurora hunting" or "No special precautions are needed right now").
5. Avoid technical jargon where possible.
6. Plain text only. No markdown, no bolding, no headers."""

        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.35,
            max_tokens=220,
        )

        insight_text = chat_completion.choices[0].message.content.strip()
        logger.info(f"Generated AI dashboard insight: status={global_status}, kp={current_kp}, ar_count={len(top_ars)}")

        return {
            "insight": insight_text,
            "global_status": global_status,
            "global_score": global_score,
            "kp": current_kp,
            "xray_class": xray_cls,
            "timestamp": ts,
        }
    except Exception as e:
        logger.error(f"Groq API Error: {e}", exc_info=True)
        return {
            "insight": "System alert: Groq AI service unavailable. Monitor NOAA SWPC directly for current space weather conditions.",
            "global_status": "UNKNOWN",
        }
