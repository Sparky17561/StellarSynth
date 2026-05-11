import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { MessageSquare, ThumbsUp, Trash2, Send, Plus, Search, ArrowLeft, ChevronRight } from 'lucide-react';
import './CommunityPage.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API = `${API_BASE}/api/community`;

// ─── Thread Detail View ──────────────────────────────────────────────────────

const ThreadDetail = ({ discussion, userId, onBack, onUpvote, onDelete, onComment, onDeleteComment, votedIds, popIds }) => {
  const [commentText, setCommentText] = useState('');

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    await onComment(discussion.id, commentText.trim());
    setCommentText('');
  };

  return (
    <div className="comm-detail">
      {/* Back button */}
      <button className="comm-back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Discussions
      </button>

      <div className="comm-detail-card">
        {/* Header */}
        <div className="comm-detail-header">
          <h1 className="comm-detail-title">{discussion.title}</h1>
          <div className="comm-detail-actions">
            <button
              className={`btn-upvote${votedIds.has(discussion.id) ? ' voted' : ''}${popIds.has(discussion.id) ? ' pop-anim' : ''}`}
              onClick={() => onUpvote(discussion.id)}
            >
              <ThumbsUp size={14} fill={votedIds.has(discussion.id) ? '#3b82f6' : 'none'} />
              {votedIds.has(discussion.id) ? 'Voted' : 'Upvote'} ({discussion.upvotes})
            </button>
            {discussion.user_id === userId && (
              <button className="btn-delete" onClick={() => { onDelete(discussion.id); onBack(); }}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="comm-detail-meta">
          <span>Posted by <strong>{discussion.user_id === userId ? 'You' : discussion.user_id.split('@')[0]}</strong></span>
          <span>·</span>
          <span>{new Date(discussion.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span>·</span>
          <span>{discussion.comments?.length || 0} comments</span>
        </div>

        {/* Body */}
        <div className="comm-detail-body">
          <p>{discussion.content}</p>
        </div>

        {/* Comments */}
        <div className="comm-detail-comments">
          <h3 className="comm-detail-comments-title">Comments · {discussion.comments?.length || 0}</h3>

          {(discussion.comments || []).length === 0 && (
            <div className="comm-no-comments">No comments yet. Be the first to reply!</div>
          )}

          <div className="comm-detail-comment-list">
            {(discussion.comments || []).map(c => (
              <div key={c.id} className="comm-comment-item">
                <div className="comm-comment-text">{c.content}</div>
                <div className="comm-comment-footer">
                  <span className="comm-comment-by">
                    {c.user_id === userId
                      ? <span className="comm-comment-mine">You</span>
                      : c.user_id.split('@')[0]}
                  </span>
                  {c.user_id === userId && (
                    <button className="btn-del-comment" onClick={() => onDeleteComment(c.id, discussion.id)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form className="comm-comment-form" onSubmit={handleComment}>
            <input
              className="comm-comment-input"
              type="text"
              placeholder="Add a comment…"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              autoFocus
            />
            <button type="submit" className="comm-send-btn" disabled={!commentText.trim()}>
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ─── Main Community Page ─────────────────────────────────────────────────────

const CommunityPage = () => {
  const { user } = useUser();
  const userId = user?.id || 'anonymous';
  const userEmail = user?.primaryEmailAddress?.emailAddress || 'anonymous@example.com';

  const [discussions, setDiscussions] = useState([]);
  const [activeDiscussion, setActiveDiscussion] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [votedIds, setVotedIds] = useState(new Set());
  const [popIds, setPopIds] = useState(new Set());

  const fetchDiscussions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/`);
      const data = await res.json();
      setDiscussions(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDiscussions(); }, [fetchDiscussions]);

  const filtered = discussions.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`${API}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), user_id: userId })
      });
      const created = await res.json();
      setDiscussions(prev => [created, ...prev]);
      setNewTitle(''); setNewContent(''); setShowForm(false);
    } catch (e) { console.error(e); }
    finally { setPosting(false); }
  };

  const handleUpvote = async (id) => {
    const hasVoted = votedIds.has(id);
    setDiscussions(prev => prev.map(d => d.id !== id ? d : { ...d, upvotes: hasVoted ? Math.max(0, d.upvotes - 1) : d.upvotes + 1 }));
    if (activeDiscussion?.id === id) setActiveDiscussion(prev => ({ ...prev, upvotes: hasVoted ? Math.max(0, prev.upvotes - 1) : prev.upvotes + 1 }));
    setVotedIds(prev => { const n = new Set(prev); hasVoted ? n.delete(id) : n.add(id); return n; });
    setPopIds(prev => new Set(prev).add(id));
    setTimeout(() => setPopIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 400);
    try {
      await fetch(`${API}/${id}/${hasVoted ? 'downvote' : 'upvote'}`, { method: 'POST' });
    } catch (e) { fetchDiscussions(); }
  };

  const handleDelete = async (id) => {
    setDiscussions(prev => prev.filter(d => d.id !== id));
    try { await fetch(`${API}/${id}?user_id=${userId}`, { method: 'DELETE' }); }
    catch (e) { fetchDiscussions(); }
  };

  const handleComment = async (discussionId, content) => {
    const tempComment = { id: Date.now(), content, user_id: userId, created_at: new Date().toISOString() };
    const update = (prev) => prev.map(d => d.id !== discussionId ? d : { ...d, comments: [...(d.comments || []), tempComment] });
    setDiscussions(update);
    if (activeDiscussion?.id === discussionId) setActiveDiscussion(prev => ({ ...prev, comments: [...(prev.comments || []), tempComment] }));
    try {
      await fetch(`${API}/${discussionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, user_id: userId })
      });
      fetchDiscussions().then(() => {
        if (activeDiscussion?.id === discussionId) {
          setDiscussions(curr => {
            const found = curr.find(d => d.id === discussionId);
            if (found) setActiveDiscussion(found);
            return curr;
          });
        }
      });
    } catch (e) { console.error(e); }
  };

  const handleDeleteComment = async (commentId, discussionId) => {
    const remove = (prev) => prev.map(d => d.id !== discussionId ? d : { ...d, comments: (d.comments || []).filter(c => c.id !== commentId) });
    setDiscussions(remove);
    if (activeDiscussion?.id === discussionId) setActiveDiscussion(prev => ({ ...prev, comments: (prev.comments || []).filter(c => c.id !== commentId) }));
    try { await fetch(`${API}/comments/${commentId}?user_id=${userId}`, { method: 'DELETE' }); }
    catch (e) { console.error(e); }
  };

  const openDiscussion = (d) => {
    // Sync latest state
    const latest = discussions.find(x => x.id === d.id) || d;
    setActiveDiscussion(latest);
  };

  if (loading) return <div className="comm-loading">Loading community…</div>;

  // ── Detail view ──
  if (activeDiscussion) {
    const latest = discussions.find(d => d.id === activeDiscussion.id) || activeDiscussion;
    return (
      <ThreadDetail
        discussion={latest}
        userId={userId}
        onBack={() => setActiveDiscussion(null)}
        onUpvote={handleUpvote}
        onDelete={handleDelete}
        onComment={handleComment}
        onDeleteComment={handleDeleteComment}
        votedIds={votedIds}
        popIds={popIds}
      />
    );
  }

  // ── List view ──
  return (
    <div className="comm-page">
      {/* Page hero */}
      <div className="comm-hero">
        <div>
          <h1>🌌 Community</h1>
          <p>Discuss solar flares, geomagnetic storms, and space weather with fellow enthusiasts.</p>
          <span className="comm-user-chip">
            <span className="comm-user-chip-dot" /> {userEmail}
          </span>
        </div>
        <button className="comm-new-btn" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> New Discussion
        </button>
      </div>

      {/* New post form (toggled) */}
      {showForm && (
        <form className="comm-inline-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            required
            autoFocus
          />
          <textarea
            placeholder="What's on your mind about space weather?"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            required
          />
          <div className="comm-inline-form-row">
            <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="comm-post-btn" disabled={posting}>{posting ? 'Posting…' : 'Post'}</button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="comm-search-bar">
        <Search size={16} className="comm-search-icon" />
        <input
          type="text"
          placeholder="Search discussions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Discussion list */}
      <div className="comm-list">
        {filtered.length === 0 && (
          <div className="comm-empty-state">
            <MessageSquare size={40} strokeWidth={1.2} />
            <h2>{search ? 'No results found' : 'No discussions yet'}</h2>
            <p>{search ? `Try a different search term.` : 'Start the first discussion!'}</p>
          </div>
        )}
        {filtered.map(d => (
          <div key={d.id} className="comm-list-item" onClick={() => openDiscussion(d)}>
            <div className="comm-list-item-body">
              <h3 className="comm-list-title">{d.title}</h3>
              <p className="comm-list-preview">{d.content.slice(0, 120)}{d.content.length > 120 ? '…' : ''}</p>
              <div className="comm-list-meta">
                <span className="comm-meta-pill"><ThumbsUp size={12} /> {d.upvotes}</span>
                <span className="comm-meta-pill"><MessageSquare size={12} /> {d.comments?.length || 0}</span>
                <span className="comm-list-author">By {d.user_id === userId ? 'You' : d.user_id.split('@')[0]}</span>
                <span className="comm-list-date">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
            <ChevronRight size={18} className="comm-list-chevron" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunityPage;
