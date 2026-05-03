from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, ApiKey, User
from pydantic import BaseModel
from typing import List
from datetime import datetime
import secrets
import hashlib

router = APIRouter()

class ApiKeyCreate(BaseModel):
    user_id: str

class ApiKeyOut(BaseModel):
    id: int
    prefix: str
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True

def ensure_user(db: Session, user_id: str):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id, email=f"{user_id}@stellarsynth.app")
        db.add(user)
        db.commit()
    return user

@router.post("/generate")
def generate_api_key(body: ApiKeyCreate, db: Session = Depends(get_db)):
    ensure_user(db, body.user_id)
    # Generate a secure random key
    raw_key = f"ss-{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    prefix = raw_key[:12]  # Show only prefix in UI
    
    db_key = ApiKey(user_id=body.user_id, api_key_hash=key_hash, is_active=True)
    db.add(db_key)
    db.commit()
    db.refresh(db_key)
    
    # Return the full key ONCE — it won't be retrievable again
    return {"id": db_key.id, "key": raw_key, "prefix": prefix, "created_at": db_key.created_at}

@router.get("/list/{user_id}")
def list_keys(user_id: str, db: Session = Depends(get_db)):
    keys = db.query(ApiKey).filter(ApiKey.user_id == user_id).all()
    result = []
    for k in keys:
        result.append({
            "id": k.id,
            "prefix": f"ss-{k.api_key_hash[:8]}…",
            "created_at": k.created_at,
            "is_active": k.is_active
        })
    return result

@router.delete("/revoke/{key_id}")
def revoke_key(key_id: int, user_id: str, db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    key.is_active = False
    db.commit()
    return {"status": "revoked"}
