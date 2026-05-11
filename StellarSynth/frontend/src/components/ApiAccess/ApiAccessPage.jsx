import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Key, Copy, Trash2, Play, ChevronRight, Code2, Zap, Terminal, BookOpen } from 'lucide-react';
import './ApiAccessPage.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const ENDPOINTS = [
  {
    id: 'insight',
    label: 'AI Insight',
    method: 'POST',
    path: '/api/dashboard/insight',
    description: 'Get Stella AI-powered space weather insights from live NOAA data.',
    payload: JSON.stringify({
      solar_activity: "Moderate",
      kp_index: 3.2,
      flare_risk: "15%",
      wind_speed: "425 km/s"
    }, null, 2),
    responseNote: 'Returns a natural language alert about space weather conditions.'
  },
  {
    id: 'news',
    label: 'Space News',
    method: 'GET',
    path: '/api/news/?limit=5',
    description: 'Scrape and fetch the latest curated solar flare and space weather news.',
    payload: null,
    responseNote: 'Returns an array of articles with title, description, URL, and image.'
  },
  {
    id: 'community',
    label: 'Community Feed',
    method: 'GET',
    path: '/api/community/',
    description: 'Fetch all community discussions and their comments.',
    payload: null,
    responseNote: 'Returns all discussions with comment threads.'
  },
];

const ApiAccessPage = () => {
  const { user } = useUser();
  const userId = user?.id || 'anonymous';

  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0]);
  const [payload, setPayload] = useState(ENDPOINTS[0].payload || '');
  const [response, setResponse] = useState('');
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState('');

  const fetchKeys = async () => {
    try {
      const res = await fetch(`${API}/api/apikeys/list/${userId}`);
      const data = await res.json();
      setKeys(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (userId !== 'anonymous') fetchKeys();
  }, [userId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/api/apikeys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      const data = await res.json();
      setNewKey(data.key);
      fetchKeys();
    } catch (e) { console.error(e); } finally { setGenerating(false); }
  };

  const handleRevoke = async (id) => {
    try {
      await fetch(`${API}/api/apikeys/revoke/${id}?user_id=${userId}`, { method: 'DELETE' });
      fetchKeys();
    } catch (e) { console.error(e); }
  };

  const handleRun = async () => {
    setRunning(true);
    setResponse('');
    try {
      const opts = { method: selectedEndpoint.method, headers: { 'Content-Type': 'application/json' } };
      if (selectedEndpoint.method === 'POST' && payload) opts.body = payload;
      const res = await fetch(`${API}${selectedEndpoint.path}`, opts);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (e) {
      setResponse(`Error: ${e.message}`);
    } finally { setRunning(false); }
  };

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };

  const selectEndpoint = (ep) => {
    setSelectedEndpoint(ep);
    setPayload(ep.payload || '');
    setResponse('');
  };

  return (
    <div className="api-page">
      {/* Header */}
      <div className="api-hero">
        <h1>API Access & Playground</h1>
        <p>Generate API keys, explore endpoints, and test live responses from StellarSynth APIs.</p>
      </div>

      <div className="api-layout">
        {/* ─── Keys Panel ─── */}
        <aside className="api-sidebar">
          <div className="api-card">
            <div className="api-card-header">
              <Key size={16} /> API Keys
            </div>
            <p className="api-card-sub">Keys are hashed on creation. Copy it immediately — it won't be shown again.</p>

            {newKey && (
              <div className="api-new-key-banner">
                <div className="api-new-key-label">New Key — copy now!</div>
                <code className="api-key-code">{newKey}</code>
                <button className="btn-copy" onClick={() => copyText(newKey, 'newkey')}>
                  <Copy size={13} /> {copied === 'newkey' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            <div className="api-keys-list">
              {keys.length === 0 && <p className="api-empty">No keys yet.</p>}
              {keys.map(k => (
                <div key={k.id} className={`api-key-row${k.is_active ? '' : ' revoked'}`}>
                  <div>
                    <span className="api-key-prefix"><Terminal size={12} /> {k.prefix}</span>
                    <span className={`api-key-badge ${k.is_active ? 'active' : 'inactive'}`}>
                      {k.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </div>
                  {k.is_active && (
                    <button className="btn-revoke" onClick={() => handleRevoke(k.id)} title="Revoke key">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button className="btn-generate" onClick={handleGenerate} disabled={generating}>
              <Zap size={15} /> {generating ? 'Generating…' : 'Generate New Key'}
            </button>
          </div>

          {/* Docs quick reference */}
          <div className="api-card">
            <div className="api-card-header"><BookOpen size={16} /> Quick Reference</div>
            <div className="api-docs-list">
              {ENDPOINTS.map(ep => (
                <button key={ep.id} className={`api-doc-item${selectedEndpoint.id === ep.id ? ' active' : ''}`} onClick={() => selectEndpoint(ep)}>
                  <span className={`method-badge ${ep.method}`}>{ep.method}</span>
                  <code className="api-doc-path">{ep.path.split('?')[0]}</code>
                  <ChevronRight size={13} style={{ marginLeft: 'auto' }} />
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ─── Playground ─── */}
        <main className="api-playground">
          <div className="api-card full">
            <div className="api-card-header"><Code2 size={16} /> Playground</div>

            {/* Endpoint row */}
            <div className="playground-ep-row">
              <span className={`method-badge ${selectedEndpoint.method}`}>{selectedEndpoint.method}</span>
              <code className="playground-ep-path">{API}{selectedEndpoint.path}</code>
            </div>
            <p className="playground-desc">{selectedEndpoint.description}</p>

            <div className="playground-grid">
              {/* Request */}
              <div className="playground-pane">
                <div className="pane-label">Request Body</div>
                {selectedEndpoint.payload ? (
                  <textarea
                    className="code-area"
                    value={payload}
                    onChange={e => setPayload(e.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <div className="code-area muted">No body required for GET requests.</div>
                )}
                <button className="btn-run" onClick={handleRun} disabled={running}>
                  <Play size={14} /> {running ? 'Running…' : 'Run Request'}
                </button>
              </div>

              {/* Response */}
              <div className="playground-pane">
                <div className="pane-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Response
                  {response && (
                    <button className="btn-copy-sm" onClick={() => copyText(response, 'response')}>
                      <Copy size={11} /> {copied === 'response' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <pre className={`code-area response-area${!response ? ' muted' : ''}`}>
                  {response || '// Response will appear here after running the request…'}
                </pre>
                {response && (
                  <div className="response-note">{selectedEndpoint.responseNote}</div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ApiAccessPage;
