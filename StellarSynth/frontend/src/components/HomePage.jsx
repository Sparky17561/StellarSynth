import React, { useState, useEffect, useCallback } from 'react';
import SolarPanel from './SolarPanel';
import './ChartCard.css';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const HomePage = () => {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInsight = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/dashboard/insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const d = await r.json();
      setInsight(d);
    } catch {
      setInsight({ insight: 'AI insight unavailable — backend may be offline.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInsight(); }, [fetchInsight]);

  const statusColor = {
    STRONG: '#e53e3e',
    MODERATE: '#dd6b20',
    QUIET: '#16a34a',
  }[insight?.global_status] || '#64748b';

  return (
    <div className="dash-page">
      <div className="dash-header-row">
        <h1>Nowcast Dashboard</h1>
        <p>Live space weather from NOAA — updates every 5 min</p>
      </div>

      <div className="ai-bar">
        <span className="ai-bar-icon">✨</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
            <strong className="ai-bar-label">Stella AI Insight</strong>
            {insight?.global_status && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem',
                borderRadius: '9999px', background: statusColor + '18',
                color: statusColor, border: `1px solid ${statusColor}44`,
              }}>
                {insight.global_status} {insight.global_score != null ? `· ${(insight.global_score * 100).toFixed(1)}%` : ''}
              </span>
            )}
          </div>
          {loading ? (
            <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Analyzing live telemetry…</span>
          ) : (
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, color: '#334155' }}>
              {insight?.insight}
            </p>
          )}
          {insight?.timestamp && (
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.35rem' }}>
              Kp {insight.kp?.toFixed(1)} · X-ray {insight.xray_class} · Updated {new Date(insight.timestamp.endsWith('Z') ? insight.timestamp : insight.timestamp + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        <button
          onClick={fetchInsight}
          disabled={loading}
          title="Refresh AI insight"
          style={{
            background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px',
            padding: '0.3rem 0.55rem', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem', color: '#64748b', alignSelf: 'flex-start',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          {loading ? '⋯' : '⟳'}
        </button>
      </div>

      <SolarPanel />
    </div>
  );
};

export default HomePage;