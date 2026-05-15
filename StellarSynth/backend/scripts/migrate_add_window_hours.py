"""
migrate_add_window_hours.py
────────────────────────────
One-time migration: adds the window_hours column to prediction_history.
Safe to run multiple times (uses IF NOT EXISTS).

Usage (from backend/):
    python scripts/migrate_add_window_hours.py
"""

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import engine

def migrate():
    with engine.connect() as conn:
        # Add column if it doesn't exist (PostgreSQL syntax)
        conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE prediction_history ADD COLUMN IF NOT EXISTS window_hours INTEGER"
            )
        )
        conn.commit()
        print("✅ Migration complete: window_hours column added (or already existed).")

if __name__ == "__main__":
    migrate()
