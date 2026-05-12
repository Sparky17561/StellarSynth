import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import './PredictPage.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API = `${API_BASE}/api/predict`;

/* ─── Weighted global risk (area-weighted if area available, else prob-weighted) ─── */
function computeWeightedRisk(data) {
  if (!data || !Object.keys(data).length) return null;
  const entries = Object.values(data);

  // Try area-weighted first
  const totalArea = entries.reduce((s, v) => s + (parseFloat(v.area) || 0), 0);
  if (totalArea > 0) {
    const weighted = entries.reduce((s, v) => {
      const w = (parseFloat(v.area) || 1) / totalArea;
      return s + w * (v.probability_24h || 0);
    }, 0);
    return weighted;
  }

  // Fallback: plain average
  const sum = entries.reduce((s, v) => s + (v.probability_24h || 0), 0);
  return sum / entries.length;
}

/* ─── Ring gauge SVG ─── */
const RingGauge = ({ prob, color, size = 72 }) => {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(prob, 1));
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={7} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  );
};

/* ─── Probability helpers ─── */
const probMeta = (p) => {
  if (p >= 0.7) return { color: '#e53e3e', label: 'HIGH RISK', bg: '#fff5f5', badge: '#fed7d7', text: '#c53030' };
  if (p >= 0.53) return { color: '#dd6b20', label: 'ELEVATED', bg: '#fffbeb', badge: '#fbd38d', text: '#744210' };
  if (p >= 0.35) return { color: '#d97706', label: 'MODERATE', bg: '#fffbeb', badge: '#fde68a', text: '#92400e' };
  return { color: '#16a34a', label: 'QUIET', bg: '#f0fdf4', badge: '#bbf7d0', text: '#166534' };
};

/* ─── Custom tooltip ─── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '0.6rem 0.9rem', fontSize: '0.78rem', color: '#1a202c',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#64748b' }}>
        {new Date(label).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {(p.value * 100).toFixed(1)}%
        </div>
      ))}
    </div>
  );
};

const PredictPage = () => {
  const [autoResult, setAutoResult] = useState(null);
  const [autoLoading, setAutoLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [lookbackHours, setLookbackHours] = useState(36);
  const [pipelineOpen, setPipelineOpen] = useState(false);

  const fetchAuto = useCallback(async () => {
    setAutoLoading(true);
    try {
      const res = await fetch(`${API}/realtime`);
      const data = await res.json();
      setAutoResult(data);
    } catch (e) { console.error(e); }
    finally { setAutoLoading(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/history`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, []);

  const pollPipeline = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pipeline-status`);
      const data = await res.json();
      setPipelineStatus(data);
      if (data.status === 'starting' || data.status === 'running') {
        setTimeout(pollPipeline, 2000);
      } else if (data.status === 'completed') {
        fetchAuto();
        fetchHistory();
      }
    } catch (e) {
      setTimeout(pollPipeline, 5000);
    }
  }, [fetchAuto, fetchHistory]);

  const triggerPipeline = async () => {
    try {
      await fetch(`${API}/run-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_hours: lookbackHours }),
      });
      setPipelineStatus({ status: 'starting', progress: 0, message: `Initializing ${lookbackHours}h window…` });
      pollPipeline();
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchAuto();
    fetchHistory();
    pollPipeline();
  }, []);

  // Computed values
  const arData = autoResult?.data || {};
  const arEntries = Object.entries(arData).sort(
    ([, a], [, b]) => (b.probability_24h || 0) - (a.probability_24h || 0)
  );
  const weightedRisk = computeWeightedRisk(arData);
  const globalStatus = autoResult?.global_status || 'QUIET';
  const globalMeta = probMeta(weightedRisk ?? 0);

  // Chart data — only from DB history
  const chartData = [...history]
    .reverse()
    .slice(-60)
    .map(h => ({
      timestamp: h.timestamp,
      probability: h.probability ?? h.global_score ?? 0,
    }));
  const hasHistory = chartData.length > 1;

  const isPipelineRunning = pipelineStatus?.status === 'starting' || pipelineStatus?.status === 'running';

  return (
    <div className="predict-page">

      {/* ══ HERO: Weighted Global Risk ══ */}
      <div className="predict-hero-card" style={{ background: globalMeta.bg, borderColor: globalMeta.badge }}>
        <div className="predict-hero-left">
          <div className="predict-hero-label">Global Flare Risk · Area-Weighted</div>
          <div className="predict-hero-status" style={{ color: globalMeta.color }}>
            {globalStatus}
          </div>
          <div className="predict-hero-score" style={{ color: globalMeta.text }}>
            {weightedRisk != null ? `${(weightedRisk * 100).toFixed(1)}%` : '—'} weighted probability
          </div>
          <div className="predict-hero-sub">
            {arEntries.length} active region{arEntries.length !== 1 ? 's' : ''} tracked
            {autoResult?.note && (
              <span className="predict-source-pill">⚡ {autoResult.note.split('.')[0]}</span>
            )}
          </div>
        </div>
        <div className="predict-hero-ring">
          <RingGauge prob={weightedRisk ?? 0} color={globalMeta.color} size={96} />
          <div className="predict-ring-label" style={{ color: globalMeta.color }}>
            {weightedRisk != null ? `${(weightedRisk * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

      {/* ══ AR Cards ══ */}
      {autoLoading ? (
        <div className="predict-loading">
          <div className="predict-spinner" />
          <span>Fetching live predictions…</span>
        </div>
      ) : arEntries.length === 0 ? (
        <div className="predict-empty">
          <div className="predict-empty-icon">🔭</div>
          <p>No active regions in the prediction file.</p>
          <p>Run the pipeline to generate fresh results.</p>
        </div>
      ) : (
        <div className="ar-cards-grid">
          {arEntries.map(([ar, data], idx) => {
            const prob = data.probability_24h ?? 0;
            const meta = probMeta(prob);
            const pct = Math.round(prob * 100);
            return (
              <div key={ar} className="ar-card" style={{ borderTopColor: meta.color }}>
                <div className="ar-card-top">
                  <div className="ar-card-id-block">
                    <span className="ar-rank">#{idx + 1}</span>
                    <span className="ar-card-id">AR {ar}</span>
                  </div>
                  <span className="ar-card-badge" style={{ background: meta.bg, color: meta.text, borderColor: meta.badge }}>
                    {data.flagged ? '⚠️ Elevated' : '✅ ' + meta.label}
                  </span>
                </div>

                <div className="ar-card-body">
                  <div className="ar-gauge-col">
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RingGauge prob={prob} color={meta.color} size={80} />
                      <div className="ar-gauge-pct" style={{ color: meta.color }}>{pct}%</div>
                    </div>
                    <div className="ar-gauge-label">24h Flare Prob</div>
                  </div>

                  <div className="ar-meta-col">
                    {data.zurich_class && data.zurich_class !== '?' && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">Zurich</span>
                        <span className="ar-meta-val">{data.zurich_class}</span>
                      </div>
                    )}
                    {data.mag_class && data.mag_class !== '?' && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">Mag class</span>
                        <span className="ar-meta-val">{data.mag_class}</span>
                      </div>
                    )}
                    {data.area > 0 && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">Area</span>
                        <span className="ar-meta-val">{data.area} μhm</span>
                      </div>
                    )}
                    {data.num_spots > 0 && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">Spots</span>
                        <span className="ar-meta-val">{data.num_spots}</span>
                      </div>
                    )}
                    {data.mu != null && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">log-energy μ</span>
                        <span className="ar-meta-val" style={{ color: data.mu > 3 ? '#dd6b20' : undefined }}>
                          {data.mu.toFixed(2)} {data.mu > 3 ? '↑' : ''}
                        </span>
                      </div>
                    )}
                    {data.log_sigma != null && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">Uncertainty σ</span>
                        <span className="ar-meta-val" style={{ color: data.log_sigma > 0.5 ? '#dd6b20' : undefined }}>
                          {data.log_sigma.toFixed(2)} {data.log_sigma > 0.5 ? '↑' : ''}
                        </span>
                      </div>
                    )}
                    {data.location && (
                      <div className="ar-meta-row">
                        <span className="ar-meta-key">Location</span>
                        <span className="ar-meta-val">{data.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Probability bar */}
                <div className="ar-prob-track">
                  <div
                    className="ar-prob-fill"
                    style={{ width: `${pct}%`, background: meta.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ 30-Day History Chart (only if data exists) ══ */}
      {hasHistory && (
        <div className="predict-chart-wrap">
          <div className="predict-chart-header">
            <div>
              <h3 className="predict-chart-title">Prediction History</h3>
              <p className="predict-chart-sub">{chartData.length} records from pipeline runs</p>
            </div>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0066FF" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0066FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(s) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  stroke="#e2e8f0"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  stroke="#e2e8f0"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  width={38}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine
                  y={0.35}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'MODERATE', fill: '#92400e', fontSize: 9, position: 'insideTopRight' }}
                />
                <Area
                  type="monotone"
                  dataKey="probability"
                  name="Flare Probability"
                  stroke="#0066FF"
                  strokeWidth={2}
                  fill="url(#areaGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══ Pipeline control (collapsible) ══ */}
      <div className="pipeline-section">
        <button
          className="pipeline-toggle"
          onClick={() => setPipelineOpen(o => !o)}
        >
          <span>⚡ AthenaCTGRU Pipeline</span>
          <span className={`pipeline-toggle-arrow ${pipelineOpen ? 'open' : ''}`}>›</span>
        </button>

        {pipelineOpen && (
          <div className="pipeline-body">
            <p className="pipeline-desc">
              Downloads 36h SHARP magnetogram sequences from JSOC, extracts physical tensors, and runs PyTorch inference. Results update the cards above.
            </p>
            <div className="pipeline-controls">
              <div>
                <label className="pipeline-lbl">Lookback window</label>
                <select
                  value={lookbackHours}
                  onChange={(e) => setLookbackHours(parseInt(e.target.value))}
                  disabled={isPipelineRunning}
                  className="pipeline-select"
                >
                  <option value={12}>12 h · Fast Snapshot</option>
                  <option value={24}>24 h · Daily Standard</option>
                  <option value={32}>32 h · Extended Coverage</option>
                  <option value={36}>36 h · Deep Sequence</option>
                  <option value={48}>48 h · Full Dynamic Horizon</option>
                </select>
              </div>
              <button
                className="pipeline-run-btn"
                onClick={triggerPipeline}
                disabled={isPipelineRunning}
              >
                {isPipelineRunning ? 'Running…' : '▶ Run Pipeline'}
              </button>
            </div>

            {isPipelineRunning && (
              <div className="pipeline-progress">
                <div className="pipeline-progress-msg">{pipelineStatus.message}</div>
                <div className="pipeline-track">
                  <div
                    className="pipeline-fill"
                    style={{ width: `${pipelineStatus.progress}%` }}
                  />
                </div>
                <div className="pipeline-pct">{pipelineStatus.progress}%</div>
              </div>
            )}

            {pipelineStatus?.status === 'completed' && (
              <div className="pipeline-done">✅ Pipeline completed — results updated above.</div>
            )}
            {pipelineStatus?.status === 'error' && (
              <div className="pipeline-error">❌ {pipelineStatus.message}</div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default PredictPage;
