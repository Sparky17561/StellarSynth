import os
import sys
import math
import random
from datetime import datetime, timedelta, timezone
import requests

# Ensure we can import from backend
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database import SessionLocal, PredictionHistory

def fetch_noaa_7day_flux():
    """Fetch the real NOAA GOES X-ray flux for the last 7 days to seed the 'Actual' data."""
    try:
        r = requests.get("https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json", timeout=10)
        data = r.json()
        
        # We only want 0.05-0.4nm (long channel, traditionally used for classification)
        flux_data = [d for d in data if d.get('energy') == '0.05-0.4nm']
        
        # Group by 12h buckets
        buckets = {}
        for row in flux_data:
            dt = datetime.fromisoformat(row['time_tag'].replace("Z", "+00:00"))
            # Round to 12h bucket
            bucket_ts = dt.replace(hour=(dt.hour // 12) * 12, minute=0, second=0, microsecond=0)
            flux = float(row['flux'])
            # Normalize flux to an arbitrary "severity" percentage where 1e-4 (X-class) is 1.0
            # M-class (1e-5) is ~0.7, C-class (1e-6) is ~0.4, B-class (1e-7) is ~0.1
            log_flux = math.log10(max(flux, 1e-9))
            severity = max(0.0, min(1.0, (log_flux + 8) / 4.0)) # Maps 1e-8 -> 0, 1e-4 -> 1.0
            
            if bucket_ts not in buckets or severity > buckets[bucket_ts]:
                buckets[bucket_ts] = severity
                
        return buckets
    except Exception as e:
        print(f"Failed to fetch NOAA data: {e}")
        return {}

def seed_database():
    print("Fetching 7-day GOES X-ray flux history from NOAA (padding to 30 days)...")
    actuals = fetch_noaa_7day_flux()
    
    # Pad back to 30 days (60 buckets)
    now = datetime.now(timezone.utc)
    for i in range(60):
        dt = now - timedelta(hours=12 * i)
        bucket_ts = dt.replace(hour=(dt.hour // 12) * 12, minute=0, second=0, microsecond=0)
        if bucket_ts not in actuals:
            actuals[bucket_ts] = max(0.0, 0.3 + 0.4 * math.sin(i * 0.4) + random.gauss(0, 0.1))

    db = SessionLocal()
    
    try:
        # Clear existing history to make a clean chart
        db.query(PredictionHistory).delete()
        
        print("Generating mock predictions for 12h, 24h, 36h, 48h windows...")
        for bucket_ts, actual_severity in actuals.items():
            for w in [12, 24, 36, 48]:
                # Deep windows (48h) are slightly more accurate to the actual outcome than shallow (12h)
                noise_scale = 0.15 * (12.0 / w)
                
                # The prediction leads the actual outcome by a bit (shift phase)
                # But for the graph, we just plot them at the same bucket
                pred_prob = max(0.0, min(1.0, actual_severity + random.gauss(0, noise_scale)))
                
                record = PredictionHistory(
                    harp_num="13500", # Mock HARP
                    probability=pred_prob,
                    flagged=pred_prob > 0.75,
                    global_score=pred_prob,
                    actual_outcome=actual_severity,
                    timestamp=bucket_ts,
                    window_hours=w
                )
                db.add(record)
        
        db.commit()
        print("Successfully seeded database with 30-day historical chart data!")
    except Exception as e:
        db.rollback()
        print(f"Database error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
