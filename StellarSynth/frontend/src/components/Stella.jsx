import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Stella.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API = `${API_BASE}/api/stella`;

// Retrieve or create Session ID
const getSessionId = () => {
  let s = localStorage.getItem('stella_session_id');
  if (!s) {
    s = `stella_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('stella_session_id', s);
  }
  return s;
};

const QUICK_QUERIES = [
  { label: '🔮 Current flare risk', q: "What's the current flare risk based on the latest ML prediction?" },
  { label: '🔍 Why is risk elevated?', q: "Why is the current flare risk elevated? Walk me through the top signals." },
  { label: '📅 When will it flare?', q: "When will the next solar flare occur?" },
  { label: '🌋 Halloween 2003 storms', q: "What happened during the 2003 Halloween solar storms? Compare with current setup." },
  { label: '📡 Radio/GNSS impact?', q: "What's the current radio blackout and GNSS disruption risk?" },
  { label: '🛰️ Satellite operators', q: "What should satellite operators know about current space weather?" },
];

const RISK_COLORS = {
  STRONG:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.5)',  dot: '#f87171', text: '#fca5a5' },
  MODERATE: { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.4)', dot: '#fbbf24', text: '#fde68a' },
  QUIET:    { bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.35)',dot: '#4ade80', text: '#86efac' },
  UNKNOWN:  { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)',dot: '#64748b', text: '#94a3b8' },
};

const TypingDots = () => (
  <div className="typing-indicator">
    <span /><span /><span />
  </div>
);

// Renders Stella's response with bold section headers highlighted
const FormattedBubble = ({ text }) => {
  if (!text) return null;
  // Split on lines that start with ** ... **
  const lines = text.split('\n');
  return (
    <div className="stella-formatted">
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*(.*?)\*\*(.*)/);
        if (sectionMatch) {
          return (
            <div key={i} className="stella-section-line">
              <span className="stella-section-header">{sectionMatch[1]}</span>
              <span>{sectionMatch[2]}</span>
            </div>
          );
        }
        // Inline bold: **text**
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
      {msg.role === 'assistant' ? (
        <div className="stella-bubble-text">
          <FormattedBubble text={msg.content} />
          {msg.source_urls && msg.source_urls.length > 0 && (
            <div className="stella-source-links">
              {msg.source_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="stella-source-chip">
                  🔗 Source {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="stella-bubble-text">{msg.content}</div>
      )}
      <div className="stella-bubble-time">{msg.time}</div>
    </div>
  </div>
);

const PredictionBadge = ({ status, score, timestamp, topArs }) => {
  const col = RISK_COLORS[status] || RISK_COLORS.UNKNOWN;
  const pct = score != null ? `${(score * 100).toFixed(1)}%` : '—';
  const ts = timestamp
    ? new Date(timestamp.replace(' ', 'T') + 'Z').toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="pred-badge" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
      <div className="pred-badge-top">
        <span className="pred-dot" style={{ background: col.dot }} />
        <span className="pred-status" style={{ color: col.text }}>{status || 'UNKNOWN'}</span>
        <span className="pred-score">{pct}</span>
        {ts && <span className="pred-ts">as of {ts}</span>}
      </div>
      {topArs && topArs.length > 0 && (
        <div className="pred-ars">
          {topArs.map(ar => (
            <span key={ar.ar} className={`pred-ar-chip ${ar.flagged ? 'flagged' : ''}`}>
              AR {ar.ar} · {ar.probability_24h}%
              {ar.flagged && ' ⚠️'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const WindowChips = ({ chips, onSelect, loading }) => (
  <div className="window-chips">
    <span className="window-chips-label">📅 Select a prediction window:</span>
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
      "Hi, I'm Stella ✨ — StellarSynth's AI space weather analyst.\n\n" +
      "I pull **live ML predictions** from AthenaCTGRU and **real NOAA telemetry** — I never generate fake forecasts.\n\n" +
      "Ask me about current flare risk, active region analysis, historical solar events, or space weather impacts.",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [sessionId, setSessionId] = useState(getSessionId);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('stella_messages');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [initialMsg];
  });
  const [hasProactive, setHasProactive] = useState(localStorage.getItem('stella_proactive') === 'true');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [windowChips, setWindowChips] = useState([]);
  const chatBottomRef = useRef(null);
  const inputRef = useRef(null);

  // Persist messages to localStorage
  useEffect(() => {
    localStorage.setItem('stella_messages', JSON.stringify(messages));
  }, [messages]);

  // Proactive message on elevated risk
  useEffect(() => {
    if (status?.prediction && !hasProactive && messages.length <= 1) {
      const gs = status.prediction.global_status;
      if (gs === 'MODERATE' || gs === 'STRONG') {
        const score = status.prediction.global_score ? `${(status.prediction.global_score * 100).toFixed(1)}%` : '';
        const proactiveMsg = {
          role: 'assistant',
          content: `⚠️ I'm detecting elevated flare risk right now — **${gs}** at **${score}**.\n\nWould you like a breakdown of the active regions causing this?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, proactiveMsg]);
        setHasProactive(true);
        localStorage.setItem('stella_proactive', 'true');
        setWindowChips([
          { label: '🔍 Why is risk elevated?', q: "Why is the current flare risk elevated? Walk me through the top signals." },
          { label: '📅 When will it flare?', q: "When will the next solar flare occur?" }
        ]);
      }
    }
  }, [status, hasProactive, messages.length]);

  // Auto-scroll
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, windowChips]);

  // Periodic live status fetch (telemetry + prediction snapshot)
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      if (!res.ok) throw new Error('status failed');
      const data = await res.json();
      setStatus(data);
      setStatusError('');
    } catch {
      setStatusError('Live telemetry unavailable');
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
    setWindowChips([]); // clear any existing window chips

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { role: 'user', content: q, time: now };
    setMessages(prev => [...prev, userMsg]);
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

      // Show window follow-up chips if Stella suggests it
      if (data.suggest_window_followup && data.window_chips?.length) {
        setWindowChips(data.window_chips);
      }

      // Refresh the status panel after every reply
      fetchStatus();
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection error — please check if the backend is running and try again.',
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

    setMessages([{
      ...initialMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
    setWindowChips([]);
    setInput('');
  };

  // Prediction panel data
  const pred = status?.prediction;
  const col = RISK_COLORS[pred?.global_status] || RISK_COLORS.UNKNOWN;

  return (
    <div className="stella-page">
      {/* ── Top bar ── */}
      <div className="stella-topbar">
        <div className="stella-topbar-left">
          <div className="stella-orb">✨</div>
          <div>
            <h1>Stella AI</h1>
            <p>Powered by AthenaCTGRU ML · Llama 3.3-70B · Live NOAA</p>
          </div>
        </div>
        <div className="stella-topbar-right">
          <div className="stella-online-badge">
            <span className="stella-dot" />
            Online
          </div>
          <button id="stella-clear-btn" className="stella-clear-btn" onClick={clearChat} title="Clear chat">
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* ── Capability chips ── */}
      <div className="stella-caps">
        {['ML Prediction-First', 'Scope Guarded', 'Follow-up Windows', 'Chat Memory', 'NOAA Live'].map(c => (
          <span key={c} className="stella-cap">{c}</span>
        ))}
      </div>

      {/* ── Prediction panel ── */}
      <div className="stella-pred-panel" style={{ borderLeftColor: col.border }}>
        <div className="stella-pred-header">
          <span className="stella-pred-title">🔮 Latest ML Prediction</span>
          {pred?.timestamp && (
            <span className="stella-pred-ts">
              as of {pred.timestamp}
            </span>
          )}
        </div>
        <div className="stella-pred-body">
          {/* Global risk gauge */}
          <div className="stella-pred-risk" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
            <span className="pred-dot" style={{ background: col.dot }} />
            <span className="pred-status-text" style={{ color: col.text }}>
              {pred?.global_status || (statusError ? 'N/A' : '—')}
            </span>
            {pred?.global_score != null && (
              <span className="pred-pct" style={{ color: col.text }}>
                {(pred.global_score * 100).toFixed(1)}%
              </span>
            )}
          </div>

          {/* Live telemetry tiles */}
          <div className="stella-telem-grid">
            <div className="telem-tile">
              <span className="telem-label">Kp Index</span>
              <strong className="telem-val">
                {status?.kp_index != null ? status.kp_index.toFixed(1) : '—'}
              </strong>
            </div>
            <div className="telem-tile">
              <span className="telem-label">X-ray Class</span>
              <strong className="telem-val">{status?.xray_class || '—'}</strong>
            </div>
            <div className="telem-tile">
              <span className="telem-label">Solar Wind</span>
              <strong className="telem-val">
                {status?.solar_wind?.speed ? `${Math.round(status.solar_wind.speed)} km/s` : '—'}
              </strong>
            </div>
            <div className="telem-tile">
              <span className="telem-label">NOAA Alerts</span>
              <strong className="telem-val">{status?.alerts_count ?? '—'}</strong>
            </div>
          </div>
        </div>

        {/* Top ARs */}
        {pred?.top_ars?.length > 0 && (
          <div className="stella-top-ars">
            <span className="top-ars-label">Top Active Regions:</span>
            {pred.top_ars.map(ar => (
              <span
                key={ar.ar}
                className={`ar-chip ${ar.flagged ? 'ar-chip-flagged' : ''}`}
                title={`Zurich: ${ar.zurich_class || '?'} | Mag: ${ar.mag_class || '?'}`}
              >
                AR {ar.ar} · {ar.probability_24h}%{ar.flagged ? ' ⚠️' : ''}
              </span>
            ))}
          </div>
        )}

        {status?.refreshed_at && (
          <div className="stella-refresh-ts">
            Telemetry refreshed: {new Date(status.refreshed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {statusError && <div className="stella-telem-error">{statusError}</div>}
      </div>

      {/* ── Chat area ── */}
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
          <div ref={chatBottomRef} />
        </div>

        {/* Window follow-up chips */}
        {windowChips.length > 0 && !loading && (
          <WindowChips chips={windowChips} onSelect={sendMessage} loading={loading} />
        )}

        {/* Quick query buttons */}
        <div className="stella-quick-row">
          {QUICK_QUERIES.map(q => (
            <button
              key={q.label}
              id={`stella-quick-${q.label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`}
              className="stella-quick-btn"
              onClick={() => sendMessage(q.q)}
              disabled={loading}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="stella-input-row">
          <input
            id="stella-chat-input"
            ref={inputRef}
            className="stella-input"
            placeholder="Ask Stella about solar flare risk, active regions, or space weather…"
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
          >
            {loading ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Stella;