import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './Stella.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API = `${API_BASE}/api/stella`;

const getSessionId = () => {
  let s = localStorage.getItem('stella_session_id');
  if (!s) {
    s = `stella_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('stella_session_id', s);
  }
  return s;
};

const QUICK_QUERIES = [
  { label: '🔮 Current flare risk', q: "What's the current flare risk right now?", desc: "Check the latest solar flare prediction" },
  { label: '🔍 What is driving risk?', q: "Why is there a flare risk today? Explain in simple terms.", desc: "See which sunspots are active" },
  { label: '📅 When is the next flare?', q: "When is the next solar flare likely to happen?", desc: "Forecast for the next 24 hours" },
  { label: '🛰️ Tech & GPS impact', q: "Will space weather affect my GPS or phone today?", desc: "Real-world impacts for normal users" },
];

const RISK_LIGHT = {
  STRONG:   { bg: '#fff5f5', border: '#fc8181', dot: '#e53e3e', text: '#c53030' },
  MODERATE: { bg: '#fffbeb', border: '#fbd38d', dot: '#dd6b20', text: '#744210' },
  QUIET:    { bg: '#f0fdf4', border: '#86efac', dot: '#16a34a', text: '#166534' },
  UNKNOWN:  { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', text: '#64748b' },
};

const TypingDots = () => (
  <div className="typing-indicator">
    <span /><span /><span />
  </div>
);

// Smart message renderer — handles README-style markdown (headers, lists, blockquotes, etc.)
const FormattedBubble = ({ text }) => {
  if (!text) return null;

  return (
    <div className="stella-formatted">
      <ReactMarkdown
        components={{
          // Map markdown elements to our custom styled components
          h1: ({ node, ...props }) => <h1 {...props} />,
          h2: ({ node, ...props }) => <h2 {...props} />,
          h3: ({ node, ...props }) => <h3 {...props} />,
          blockquote: ({ node, ...props }) => <blockquote {...props} />,
          li: ({ node, ...props }) => <li {...props} />,
          p: ({ node, ...props }) => <p {...props} />,
          strong: ({ node, ...props }) => <strong {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

const MessageBubble = ({ msg, onReply }) => (
  <div 
    className={`stella-msg ${msg.role}`} 
    onDoubleClick={() => onReply(msg)}
    title="Double-click to reply"
  >
    {msg.role === 'assistant' && (
      <div className="stella-avatar-sm">✨</div>
    )}
    <div className="stella-bubble">
      {msg.replyTo && (
        <div className="stella-msg-reply-context">
          <span className="reply-arrow">⤴</span> {msg.replyTo.length > 60 ? msg.replyTo.slice(0, 60) + '...' : msg.replyTo}
        </div>
      )}
      <div className="stella-bubble-text">
        {msg.role === 'assistant' ? (
          <FormattedBubble text={msg.content} />
        ) : (
          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        )}
      </div>
      <div className="stella-bubble-time">{msg.time}</div>
    </div>
  </div>
);

const ReplyPreview = ({ context, onClear }) => (
  <div className="stella-reply-preview">
    <div className="reply-content">
      <span className="reply-label">Replying to:</span>
      <span className="reply-text">{context}</span>
    </div>
    <button className="reply-clear" onClick={onClear}>✕</button>
  </div>
);

const WindowChips = ({ chips, onSelect, loading }) => (
  <div className="window-chips">
    <div className="window-chips-row">
      {chips.map(c => (
        <button
          key={c.label}
          className="window-chip-btn"
          onClick={() => onSelect(c.q)}
          disabled={loading}
        >
          {c.label}
        </button>
      ))}
    </div>
  </div>
);

const Stella = () => {
  const initialMsg = {
    role: 'assistant',
    content:
      "Hello! I'm **Stella** ✨, your lead space weather analyst.\n\n" +
      "I'm here to provide intelligent briefings on solar activity and its impact on our technology.\n\n" +
      "How can I help you today?",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const location = useLocation();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(getSessionId);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('stella_messages');
    if (saved) { try { return JSON.parse(saved); } catch (e) { console.error(e); } }
    return [initialMsg];
  });
  const [replyTo, setReplyTo] = useState(null);
  const [windowChips, setWindowChips] = useState([
    { label: "📊 Today's Briefing", q: "Give me a full briefing on today's solar activity." },
    { label: "🚨 Critical Risks", q: "Are there any active sunspots I should be worried about right now?" },
    { label: "📅 48h Forecast", q: "What does the geomagnetic forecast look like for the next 2 days?" }
  ]);
  const [hasProactive, setHasProactive] = useState(localStorage.getItem('stella_proactive') === 'true');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [predExpanded, setPredExpanded] = useState(false);
  const chatBottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('stella_messages', JSON.stringify(messages));
  }, [messages]);

  // Handle incoming queries from other pages (Double-click feature)
  useEffect(() => {
    if (location.state?.query && !loading) {
      const q = location.state.query;
      const context = location.state.context || (q.includes('AR') ? 'Active Region' : 'Chart Data');
      
      // Clear location state to prevent re-triggering on refresh/back
      navigate(location.pathname, { replace: true, state: {} });
      
      setReplyTo(context);
      // Delay slightly to ensure component is fully ready
      setTimeout(() => sendMessage(q, context), 100);
    }
  }, [location.state, loading, navigate]);

  useEffect(() => {
    if (status?.prediction && !hasProactive && messages.length <= 1) {
      const gs = status.prediction.global_status;
      if (gs === 'MODERATE' || gs === 'STRONG') {
        const score = status.prediction.global_score
          ? `${(status.prediction.global_score * 100).toFixed(1)}%`
          : '';
        const proactiveMsg = {
          role: 'assistant',
          content: `⚠️ **Elevated Risk Advisory** — Global flare risk is currently **${gs}** (${score}).\n\nWould you like a physical breakdown of the specific active region magnetic structures driving this threat?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, proactiveMsg]);
        setHasProactive(true);
        localStorage.setItem('stella_proactive', 'true');
        setWindowChips([
          { label: '🔍 Top elevated signals', q: "Why is the current flare risk elevated? Walk me through the top signals." },
          { label: '📅 Forecast timing', q: "When will the next solar flare occur?" },
        ]);
      }
    }
  }, [status, hasProactive, messages.length]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, windowChips]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      if (!res.ok) throw new Error('status failed');
      const data = await res.json();
      setStatus(data);
      setStatusError('');
    } catch {
      setStatusError('Telemetry sync offline');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const sendMessage = async (text, contextOverride = null) => {
    const q = (text || input).trim();
    if (!q || loading) return;

    const currentReply = contextOverride || replyTo;
    setInput('');
    setReplyTo(null);
    setWindowChips([]);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: q, 
      time: now, 
      replyTo: currentReply 
    }]);
    setLoading(true);

    try {
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: q, 
          history, 
          session_id: sessionId,
          reply_context: currentReply
        }),
      });
      const data = await res.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          source: data.source,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      if (data.suggest_window_followup && data.window_chips?.length) {
        setWindowChips(data.window_chips);
      }

      fetchStatus();
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection error — unable to reach the inference engine. Please verify backend status.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = async () => {
    try {
      await fetch(`${API}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch { /* ignore */ }

    const newSession = `stella_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(newSession);
    localStorage.setItem('stella_session_id', newSession);
    localStorage.removeItem('stella_proactive');
    setHasProactive(false);
    setMessages([{ ...initialMsg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setWindowChips([]);
    setInput('');
  };

  const pred = status?.prediction;
  const col = RISK_LIGHT[pred?.global_status] || RISK_LIGHT.UNKNOWN;
  const isWelcomeState = messages.length === 1 || (messages.length === 2 && messages[1].role === 'assistant' && windowChips.length === 0);

  const handleReply = (msg) => {
    setReplyTo(msg.content);
    inputRef.current?.focus();
  };

  return (
    <div className="stella-page">
      {/* ── Minimal Header ── */}
      <div className="stella-header-minimal">
        <div className="stella-live-pulse">
          <span className="pulse-dot"></span>
          <span className="pulse-text">Live Monitoring Active</span>
        </div>
        <button className="stella-refresh-btn" onClick={clearChat} title="Clear conversation and refresh">
          Refresh
        </button>
      </div>

      {/* ── Chat Content Area ── */}
      <div className="stella-chat-wrap">
        <div className="stella-messages">
          {messages.map((m, i) => <MessageBubble key={i} msg={m} onReply={() => handleReply(m)} />)}
          {loading && (
            <div className="stella-msg assistant">
              <div className="stella-avatar-sm">✨</div>
              <div className="stella-bubble">
                <div className="stella-bubble-text"><TypingDots /></div>
              </div>
            </div>
          )}

          {/* ── ChatGPT style Suggestions Grid (Only visible on empty/new chat) ── */}
          {isWelcomeState && !loading && (
            <div className="stella-suggestions-wrapper">
              <div className="stella-suggestions-grid">
                {QUICK_QUERIES.map(q => (
                  <button
                    key={q.label}
                    className="stella-suggestion-card"
                    onClick={() => sendMessage(q.q)}
                  >
                    <div className="stella-sug-title">{q.label}</div>
                    <div className="stella-sug-desc">{q.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* ── Input Box ── */}
        <div className="stella-input-wrapper">
          {windowChips.length > 0 && !loading && (
            <div className="stella-chips-container">
              <WindowChips chips={windowChips} onSelect={sendMessage} loading={loading} />
            </div>
          )}
          
          {replyTo && <ReplyPreview context={replyTo} onClear={() => setReplyTo(null)} />}

          <div className="stella-input-box">
            <textarea
              ref={inputRef}
              className="stella-input"
              placeholder="Ask Stella anything about space weather..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
              rows={1}
            />
            <button
              className="stella-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              title="Send message"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="stella-input-footer">
            Stella can make mistakes. Verify important info.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stella;