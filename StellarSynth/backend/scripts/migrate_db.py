import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from sqlalchemy import text
from database import engine

def migrate():
    print("Migrating database: adding window_hours column to prediction_history...")
    try:
        with engine.connect() as conn:
            conn.execute(text('ALTER TABLE prediction_history ADD COLUMN IF NOT EXISTS window_hours INTEGER'))
            conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
