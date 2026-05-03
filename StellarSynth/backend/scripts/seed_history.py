import sys
import os
import random
from datetime import datetime, timedelta

# Ensure we can import from the parent directory (backend)
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal, PredictionHistory, engine, Base

def seed():
    PredictionHistory.__table__.drop(engine, checkfirst=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    print("Seeding 30 days of historical solar data into database...")
    
    # We will simulate 3 active regions: 13467 (High Risk), 13472 (Quiet), 13475 (Moderate)
    harps = ["13467", "13472", "13475"]
    
    # 30 days of data, 1 prediction every 12 hours (60 data points per region)
    now = datetime.utcnow()
    count = 0
    
    # Clear existing history first for a clean demo
    db.query(PredictionHistory).delete()
    
    for day in range(30):
        for half_day in [0, 12]:
            ts = now - timedelta(days=day, hours=half_day)
            
            # Calculate a realistic global score for this timestamp
            day_variance = math.sin(day / 5.0) * 0.2 # Slow oscillation over days
            
            for harp in harps:
                # Assign distinct personalities to the regions
                if harp == "13467":
                    base = 0.65 + day_variance
                elif harp == "13472":
                    base = 0.15 + day_variance / 2
                else:
                    base = 0.35 - day_variance
                
                prob = min(0.98, max(0.02, base + random.uniform(-0.1, 0.1)))
                
                # GROUND TRUTH: If probability was > 0.7, let's say a flare actually happened 80% of the time
                actual = 0.0
                if prob > 0.7 and random.random() > 0.2:
                    actual = 0.8 + random.uniform(0, 0.15) # Strong Flare
                elif prob < 0.3 and random.random() > 0.95:
                    actual = 0.7 # Surprise flare (False Negative)
                elif prob > 0.8 and random.random() > 0.9:
                    actual = 0.1 # Model was wrong (False Positive)
                else:
                    actual = prob * 0.5 # Normal noise
                
                record = PredictionHistory(
                    harp_num=harp,
                    probability=round(prob, 4),
                    flagged=prob > 0.53,
                    timestamp=ts,
                    global_score=0.0,
                    actual_outcome=round(actual, 4)
                )
                db.add(record)
                count += 1
    
    db.commit()
    db.close()
    print(f"Successfully seeded {count} records. Your 30-day graph is ready!")

if __name__ == "__main__":
    import math
    seed()
