from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, Discussion, Comment, User
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()

# ─── Schemas ─────────────────────────────────────────────────────────────────

class CommentSchema(BaseModel):
    id: int
    content: str
    user_id: str
    created_at: datetime
    class Config:
        from_attributes = True

class DiscussionSchema(BaseModel):
    id: int
    title: str
    content: str
    user_id: str
    created_at: datetime
    upvotes: int
    comments: List[CommentSchema] = []
    class Config:
        from_attributes = True

class DiscussionCreate(BaseModel):
    title: str
    content: str
    user_id: str

class CommentCreate(BaseModel):
    content: str
    user_id: str

# ─── Helper ──────────────────────────────────────────────────────────────────

def ensure_user(db: Session, user_id: str):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id, email=f"{user_id}@stellarsynth.app")
        db.add(user)
        db.commit()
    return user

# ─── Discussions ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[DiscussionSchema])
def get_discussions(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    return db.query(Discussion).order_by(Discussion.created_at.desc()).offset(skip).limit(limit).all()

@router.post("/", response_model=DiscussionSchema)
def create_discussion(discussion: DiscussionCreate, db: Session = Depends(get_db)):
    ensure_user(db, discussion.user_id)
    db_disc = Discussion(**discussion.dict())
    db.add(db_disc)
    db.commit()
    db.refresh(db_disc)
    return db_disc

@router.delete("/{discussion_id}")
def delete_discussion(discussion_id: int, user_id: str, db: Session = Depends(get_db)):
    db_disc = db.query(Discussion).filter(Discussion.id == discussion_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Discussion not found")
    if db_disc.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(Comment).filter(Comment.discussion_id == discussion_id).delete()
    db.delete(db_disc)
    db.commit()
    return {"status": "ok"}

# ─── Upvotes (toggle) ────────────────────────────────────────────────────────

@router.post("/{discussion_id}/upvote")
def toggle_upvote(discussion_id: int, user_id: str, db: Session = Depends(get_db)):
    """
    Stateless toggle: body includes user_id and the current voted state.
    We track no separate votes table for now, so we just inc/dec by 1.
    The client sends voted=true meaning "I was voted, now remove", vice versa.
    """
    db_disc = db.query(Discussion).filter(Discussion.id == discussion_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Discussion not found")
    # We return the new upvote count; the frontend manages toggle state
    # To properly track this we'd need a votes table, for now increment only
    db_disc.upvotes += 1
    db.commit()
    return {"status": "ok", "upvotes": db_disc.upvotes}

@router.post("/{discussion_id}/downvote")
def downvote(discussion_id: int, db: Session = Depends(get_db)):
    db_disc = db.query(Discussion).filter(Discussion.id == discussion_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Discussion not found")
    db_disc.upvotes = max(0, db_disc.upvotes - 1)
    db.commit()
    return {"status": "ok", "upvotes": db_disc.upvotes}

# ─── Comments ────────────────────────────────────────────────────────────────

@router.post("/{discussion_id}/comments", response_model=CommentSchema)
def add_comment(discussion_id: int, comment: CommentCreate, db: Session = Depends(get_db)):
    db_disc = db.query(Discussion).filter(Discussion.id == discussion_id).first()
    if not db_disc:
        raise HTTPException(status_code=404, detail="Discussion not found")
    ensure_user(db, comment.user_id)
    db_comment = Comment(discussion_id=discussion_id, **comment.dict())
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, user_id: str, db: Session = Depends(get_db)):
    db_comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if db_comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(db_comment)
    db.commit()
    return {"status": "ok"}
