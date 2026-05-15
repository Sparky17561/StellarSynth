import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  { label: '🔮 Current flare risk', q: "What's the current flare risk based on the latest ML prediction?", desc: "Analyze latest AthenaCTGRU tensors" },
  { label: '🔍 Elevated risk drivers', q: "Why is the current flare risk elevated? Walk me through the top signals.", desc: "Physical breakdown of top active regions" },
  { label: '📅 Flare timing forecast', q: "When will the next solar flare occur?", desc: "24h window probabilities and uncertainty" },
  { label: '🛰️ Satellite operations', q: "What should satellite operators know about current space weather?", desc: "Actionable payload and drag advisories" },
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

// Smart message renderer — clean markdown with customized bold/section formatting
const FormattedBubble = ({ text }) => {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className="stella-formatted">
      {lines.map((line, i) => {
        // Detect section header like **🔴 Current Risk** — ...
        const sectionMatch = line.match(/^\*\*(.*?)\*\*(.*)/);
        if (sectionMatch) {
          const header = sectionMatch[1].trim();
          const rest = sectionMatch[2];
          return (
            <div key={i} className="stella-section-line">
              <span className="stella-section-header">{header}</span>
              <span>{rest}</span>
            </div>
          );
        }
        // Inline bold **text**
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className={line === '' ? 'stella-spacer' : ''}>
            {parts.map((part, j) =>
              j % 2 === 1 ? <strong key={j}>{part}</strong> : part
            )}
          </p>
        );
      })}
    </div>
  );
};

const MessageBubble = ({ msg }) => (
  <div className={`stella-msg ${msg.role}`}>
    {msg.role === 'assistant' && (
      <div className="stella-avatar-sm">✨</div>
    )}
    <div className="stella-bubble">
      <div className="stella-bubble-text">
        {msg.role === 'assistant' ? (
          <FormattedBubble text={msg.content} />
        ) : (
          <div>{msg.content}</div>
        )}
      </div>
      <div className="stella-bubble-time">{msg.time}</div>
    </div>
  </div>
);

const WindowChips = ({ chips, onSelect, loading }) => (
  <div className="window-chips">
    <span className="window-chips-label">📅 Suggested follow-up windows:</span>
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
      "Hello! I'm **Stella** ✨, your AI space weather analyst.\n\n" +
      "I interface directly with **AthenaCTGRU ML outputs** and **real-time NOAA telemetry** to deliver physics-grounded space weather intelligence.\n\n" +
      "How can I assist your operations today?",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [sessionId, setSessionId] = useState(getSessionId);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('stella_messages');
    if (saved) { try { return JSON.parse(saved); } catch (e) { console.error(e); } }
    return [initialMsg];
  });
  const [hasProactive, setHasProactive] = useState(localStorage.getItem('stella_proactive') === 'true');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [windowChips, setWindowChips] = useState([]);
  const [predExpanded, setPredExpanded] = useState(false);
  const chatBottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('stella_messages', JSON.stringify(messages));
  }, [messages]);

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

  const sendMessage = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    setWindowChips([]);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: 'user', content: q, time: now }]);
    setLoading(true);

    try {
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history, session_id: sessionId }),
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

  return (
    <div className="stella-page">
      {/* ── Sleek Minimal Topbar ── */}
      <div className="stella-topbar">
        <div className="stella-topbar-left">
          <div className="stella-orb">✨</div>
          <div>
            <h1>Stella AI</h1>
            <p className="stella-subtitle">AthenaCTGRU · Llama 3.3 · NOAA Live</p>
          </div>
        </div>
        <div className="stella-topbar-right">
          <div className="stella-online-badge">
            <span className="stella-dot" />
            <span>Connected</span>
          </div>
          <button className="stella-clear-btn" onClick={clearChat} title="Start new conversation">
            New Chat
          </button>
        </div>
      </div>

      {/* ── Expandable Compact Telemetry Bar (replaces stacked noise) ── */}
      <div className="stella-compact-status-bar" onClick={() => setPredExpanded(!predExpanded)}>
        <div className="stella-csb-left">
          <span className="stella-csb-icon">🔮</span>
          <span className="stella-csb-label">Global ML Prediction:</span>
          <span className="stella-csb-risk" style={{ color: col.text, backgroundColor: col.bg, borderColor: col.border }}>
            {pred?.global_status || 'QUIET'} {pred?.global_score != null ? `(${(pred.global_score * 100).toFixed(1)}%)` : ''}
          </span>
          {status?.kp_index != null && (
            <span className="stella-csb-item">· Kp: <strong>{status.kp_index.toFixed(1)}</strong></span>
          )}
          {status?.xray_class && (
            <span className="stella-csb-item">· X-ray: <strong>{status.xray_class}</strong></span>
          )}
        </div>
        <div className="stella-csb-right">
          <span className="stella-csb-toggle">{predExpanded ? 'Hide Details ▴' : 'View Telemetry ▾'}</span>
        </div>
      </div>

      {predExpanded && (
        <div className="stella-expanded-telemetry">
          <div className="stella-telem-grid">
            <div className="telem-tile">
              <span className="telem-label">Geomagnetic Kp</span>
              <strong className="telem-val">{status?.kp_index != null ? status.kp_index.toFixed(1) : '—'}</strong>
            </div>
            <div className="telem-tile">
              <span className="telem-label">GOES X-Ray Class</span>
              <strong className="telem-val">{status?.xray_class || '—'}</strong>
            </div>
            <div className="telem-tile">
              <span className="telem-label">Solar Wind Speed</span>
              <strong className="telem-val">{status?.solar_wind?.speed ? `${Math.round(status.solar_wind.speed)} km/s` : '—'}</strong>
            </div>
            <div className="telem-tile">
              <span className="telem-label">Active SWPC Alerts</span>
              <strong className="telem-val">{status?.alerts_count ?? '—'}</strong>
            </div>
          </div>
          {pred?.top_ars?.length > 0 && (
            <div className="stella-top-ars">
              <span className="top-ars-label">Tracked Active Regions:</span>
              {pred.top_ars.map(ar => (
                <span key={ar.ar} className={`ar-chip ${ar.flagged ? 'ar-chip-flagged' : ''}`}>
                  AR {ar.ar} · {ar.probability_24h}% {ar.flagged ? '⚠️' : ''}
                </span>
              ))}
            </div>
          )}
          {pred?.timestamp && <div className="stella-refresh-ts">Model timestamp: {pred.timestamp}</div>}
        </div>
      )}

      {/* ── Chat Content Area ── */}
      <div className="stella-chat-wrap">
        <div className="stella-messages">
          {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
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

        {/* Window follow-up chips */}
        {windowChips.length > 0 && !loading && (
          <div className="stella-chips-container">
            <WindowChips chips={windowChips} onSelect={sendMessage} loading={loading} />
          </div>
        )}

        {/* ── Clean Input Row ── */}
        <div className="stella-input-wrapper">
          <div className="stella-input-box">
            <input
              id="stella-chat-input"
              ref={inputRef}
              className="stella-input"
              placeholder="Ask Stella to analyze solar flare risks, active region physics, or operational impact…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading}
            />
            <button
              id="stella-send-btn"
              className="stella-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              title="Send message"
            >
              {loading ? '⋯' : '↑'}
            </button>
          </div>
          <div className="stella-input-footer">
            Stella AI interfaces directly with AthenaCTGRU tensors and live space weather data streams. Check predictions page for deeper analytics.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stella;