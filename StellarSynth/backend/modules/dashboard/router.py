from fastapi import APIRouter
from pydantic import BaseModel
import os
import logging
from groq import Groq
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
router = APIRouter()

# Initialize Groq client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

from modules.stella.router import build_noaa_context, fetch_kp_index

class DashboardData(BaseModel):
    pass # No longer needed, but keeping for backwards compatibility if needed

@router.get("/")
def get_dashboard():
    return {"message": "Dashboard endpoint"}

@router.post("/insight")
def get_ai_insight():
    try:
        # Fetch actual live telemetry using our existing Stella functions
        noaa_context = build_noaa_context()
        current_kp = fetch_kp_index() or "Unknown"

        prompt = f"""
        You are Stella, an advanced AI space weather analyst.
        Analyze this real-time NOAA telemetry:
        {noaa_context}
        
        Generate a highly IMPACTFUL, urgent 2-sentence alert. Focus heavily on consequences: radio blackouts, GPS degradation, satellite drag, or aurora visibility. Do not use generic summaries. Output plain text only.
        """
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.5,
            max_tokens=100,
        )
        
        logger.info(f"Generated AI insight successfully for Kp: {current_kp}")
        return {"insight": chat_completion.choices[0].message.content.strip()}
    except Exception as e:
        logger.error(f"Groq API Error: {e}", exc_info=True)
        return {"insight": "System alert: Groq AI service unavailable. Proceed with caution during high Kp periods."}
