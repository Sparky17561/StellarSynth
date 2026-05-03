import React, { useState, useRef, useEffect } from 'react';
import './Stella.css';

const API = 'http://localhost:8000/api/stella';

const QUICK_QUERIES = [
  { label: '☀️ Current solar activity', q: 'Show me the current solar activity — wind speed, Kp index, and X-ray flux.' },
  { label: '⚡ Flare risk today?', q: "What's the flare risk today based on current NOAA data?" },
  { label: '📈 Last week trends', q: "Analyze last week's space weather trends. Any significant events?" },
  { label: '🔍 X-class flares 2020–2024', q: "Tell me about X-class solar flares from 2020 to 2024 and what we know about them." },
  { label: '📡 Radio blackout risk?', q: "Is there a radio blackout risk right now? What frequencies are affected?" },
  { label: '🛰️ Satellite operators', q: "What should satellite operators know about current space weather conditions?" },
];

const TypingDots = () => (
  <div className="typing-indicator">
    <span /><span /><span />
  </div>
);

const MessageBubble = ({ msg }) => (
  <div className={`stella-msg ${msg.role}`}>
    {msg.role === 'assistant' && (
      <div className="stella-avatar-sm">✨</div>
    )}
    <div className="stella-bubble">
      <div className="stella-bubble-text">{msg.content}</div>
      <div className="stella-bubble-time">{msg.time}</div>
    </div>
  </div>
);

const Stella = () => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi, I'm Stella 🌟 — your AI space weather analyst. I have direct access to live NOAA telemetry. Ask me about solar activity, flare risk, geomagnetic conditions, or complex queries like \"Show me all X-class flares from 2020–2024\".",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: q, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build history for context (last 8 exchanges)
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history })
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        source: data.source,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error — please check if the backend is running and try again.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="stella-page">
      {/* Header */}
      <div className="stella-topbar">
        <div className="stella-topbar-left">
          <div className="stella-orb">✨</div>
          <div>
            <h1>Stella AI</h1>
            <p>Powered by Llama 3.3-70B · Live NOAA Telemetry</p>
          </div>
        </div>
        <div className="stella-online-badge">
          <span className="stella-dot" /> Online
        </div>
      </div>

      {/* Capabilities chips */}
      <div className="stella-caps">
        {['Live NOAA Data', '10-Year History', 'Flare Risk', 'Trend Analysis', 'Smart Queries'].map(c => (
          <span key={c} className="stella-cap">{c}</span>
        ))}
      </div>

      {/* Chat area */}
      <div className="stella-chat-wrap">
        <div className="stella-messages">
          {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
          {loading && (
            <div className="stella-msg assistant">
              <div className="stella-avatar-sm">✨</div>
              <div className="stella-bubble"><TypingDots /></div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick queries */}
        <div className="stella-quick-row">
          {QUICK_QUERIES.map(q => (
            <button key={q.label} className="stella-quick-btn" onClick={() => sendMessage(q.q)} disabled={loading}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="stella-input-row">
          <input
            ref={inputRef}
            className="stella-input"
            placeholder="Ask Stella anything about space weather…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={loading}
          />
          <button className="stella-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
            {loading ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Stella;