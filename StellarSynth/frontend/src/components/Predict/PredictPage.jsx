import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './PredictPage.css';

const API = 'http://localhost:8000/api/predict';

const FIELD_DEFS = [
  { key: 'E_free', label: 'Free Energy (E_free)', unit: 'J', placeholder: '1e24', description: 'Total free magnetic energy in the active region' },
  { key: 'Phi_HED', label: 'Helicity Energy Density (Φ_HED)', unit: '', placeholder: '0.5', description: 'Normalized helicity energy density' },
  { key: 'J_total', label: 'Total Current (J_total)', unit: 'A', placeholder: '5.0', description: 'Total vertical electric current' },
  { key: 'J_z', label: 'Net Current (J_z)', unit: 'A', placeholder: '2.0', description: 'Net vertical electric current' },
  { key: 'h_total', label: 'Total Helicity (h_total)', unit: '', placeholder: '0.8', description: 'Total relative helicity' },
  { key: 'H_c', label: 'Current Helicity (H_c)', unit: '', placeholder: '0.3', description: 'Current-carrying helicity' },
  { key: 'h_signed', label: 'Signed Helicity (h_signed)', unit: '', placeholder: '-0.4', description: 'Signed magnetic helicity' },
  { key: 'alpha', label: 'Alpha (α)', unit: '', placeholder: '0.1', description: 'Force-free field parameter' },
  { key: 'Psi', label: 'Twist Flux (Ψ)', unit: '', placeholder: '0.2', description: 'Magnetic flux twist parameter' },
  { key: 'grad_Bh', label: '∇Bh', unit: '', placeholder: '3.5', description: 'Horizontal field gradient' },
  { key: 'S_HED', label: 'Signed HED (S_HED)', unit: '', placeholder: '0.1', description: 'Signed helicity energy density' },
  { key: 'Jolt', label: 'Jolt', unit: '', placeholder: '0.5', description: 'Rapid photospheric field change' },
  { key: 'kappa_frag', label: 'Fragmentation (κ_frag)', unit: '', placeholder: '0.2', description: 'Active region fragmentation' },
  { key: 'hgc_x', label: 'HGC X Position', unit: 'deg', placeholder: '10.0', description: 'Heliographic Carrington longitude' },
  { key: 'hgc_y', label: 'HGC Y Position', unit: 'deg', placeholder: '-5.0', description: 'Heliographic Carrington latitude' },
  { key: 'cycle_phase', label: 'Solar Cycle Phase', unit: '', placeholder: '0.7', description: 'Phase in current solar cycle (0–1)' },
];

const DEFAULT_VALS = {
  E_free: 1e24, Phi_HED: 0.5, J_total: 5.0, J_z: 2.0, h_total: 0.8,
  H_c: 0.3, h_signed: -0.4, alpha: 0.1, Psi: 0.2, grad_Bh: 3.5,
  S_HED: 0.1, Jolt: 0.5, kappa_frag: 0.2, hgc_x: 10.0, hgc_y: -5.0, cycle_phase: 0.7
};

const ProbabilityBar = ({ prob }) => {
  const pct = Math.round(prob * 100);
  const color = prob > 0.7 ? '#ef4444' : prob > 0.53 ? '#f97316' : prob > 0.3 ? '#facc15' : '#22c55e';
  const label = prob > 0.7 ? 'HIGH RISK' : prob > 0.53 ? 'MODERATE' : prob > 0.3 ? 'LOW' : 'QUIET';
  return (
    <div className="prob-container">
      <div className="prob-header">
        <span className="prob-label">24h Flare Probability</span>
        <span className="prob-pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="prob-track">
        <div className="prob-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="prob-status" style={{ color }}>{label}</div>
    </div>
  );
};

const PredictPage = () => {
  const [tab, setTab] = useState('manual');
  const [fields, setFields] = useState(DEFAULT_VALS);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [autoResult, setAutoResult] = useState(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [lookbackHours, setLookbackHours] = useState(36);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API}/history`);
      const data = await res.json();
      setHistory(data);
    } catch (e) { console.error(e); }
  };

  const fetchAuto = async () => {
    setAutoLoading(true);
    try {
      const res = await fetch(`${API}/realtime`);
      const data = await res.json();
      setAutoResult(data);
    } catch (e) { console.error(e); }
    finally { setAutoLoading(false); }
  };

  const [pipelineStatus, setPipelineStatus] = useState(null);
  
  const pollPipeline = async () => {
    try {
      const res = await fetch(`${API}/pipeline-status`);
      const data = await res.json();
      setPipelineStatus(data);
      if (data.status === 'starting' || data.status === 'running') {
        setTimeout(pollPipeline, 2000);
      } else if (data.status === 'completed') {
        fetchAuto(); // Refresh real results when done
      }
    } catch (e) {
      console.error(e);
      setTimeout(pollPipeline, 5000);
    }
  };

  const triggerPipeline = async () => {
    try {
      await fetch(`${API}/run-pipeline`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_hours: lookbackHours })
      });
      setPipelineStatus({ status: 'starting', progress: 0, message: `Initializing ${lookbackHours}h window...` });
      pollPipeline();
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    pollPipeline();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (tab === 'auto') {
      fetchAuto();
      fetchHistory();
    }
  }, [tab]);

  const handleManual = async (e) => {
    e.preventDefault();
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      const data = await res.json();
      setResult(data);
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  };

  return (
    <div className="predict-page">
      <div className="predict-hero">
        <h1>Solar Flare Predictor</h1>
        <p>Physics-informed SHARP heuristic — AthenaCTGRU checkpoint integration pending</p>
        <div className="predict-tabs">
          <button className={`ptab${tab === 'manual' ? ' active' : ''}`} onClick={() => setTab('manual')}>
            Manual Input
          </button>
          <button className={`ptab${tab === 'auto' ? ' active' : ''}`} onClick={() => setTab('auto')}>
            Auto Prediction (Live)
          </button>
        </div>
      </div>

      {tab === 'manual' && (
        <div className="predict-manual">
          <form className="predict-form" onSubmit={handleManual}>
            <div className="predict-fields-grid">
              {FIELD_DEFS.map(f => (
                <div key={f.key} className="predict-field">
                  <label>{f.label} {f.unit && <span className="unit">{f.unit}</span>}</label>
                  <input
                    type="number"
                    step="any"
                    value={fields[f.key]}
                    onChange={e => setFields(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                    placeholder={f.placeholder}
                    title={f.description}
                  />
                  <p className="field-desc">{f.description}</p>
                </div>
              ))}
            </div>
            <button type="submit" className="predict-run-btn" disabled={running}>
              {running ? 'Running Model…' : '⚡ Run Prediction'}
            </button>
          </form>

          {result && (
            <div className="predict-result-card">
              <h3>Prediction Result</h3>
              <ProbabilityBar prob={result.probability_24h} />
              <div className="predict-result-row">
                <span>Flagged for X/M-class</span>
                <span className={result.flagged ? 'flag-yes' : 'flag-no'}>{result.flagged ? '⚠️ YES' : '✅ NO'}</span>
              </div>
              <div className="predict-model-note">
                <span>🔬 {result.model}</span>
              </div>
              <p className="predict-note">{result.details}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'auto' && (
        <div className="predict-auto">
          <div className="consciousness-banner" style={{ 
            background: autoResult?.global_status === 'STRONG' ? 'linear-gradient(90deg, #991b1b, #ef4444)' : 
                        autoResult?.global_status === 'MODERATE' ? 'linear-gradient(90deg, #92400e, #f59e0b)' : 
                        'linear-gradient(90deg, #064e3b, #10b981)',
            padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ fontSize: '2.5rem' }}>
              {autoResult?.global_status === 'STRONG' ? '🔴' : autoResult?.global_status === 'MODERATE' ? '🟠' : '🟢'}
            </div>
            <div>
              <h2 style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Solar Consciousness: {autoResult?.global_status || 'QUIET'}</h2>
              <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>Global Risk Score: {(autoResult?.global_score * 100).toFixed(1)}% | Aggregate of {Object.keys(autoResult?.data || {}).length} Active Regions</p>
            </div>
          </div>

          <div className="history-graph-panel" style={{ 
            background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)', 
            padding: '2rem', 
            borderRadius: '16px', 
            border: '1px solid rgba(59, 130, 246, 0.2)', 
            marginBottom: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 0 15px rgba(59, 130, 246, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.25rem', letterSpacing: '0.05em' }}>30-Day Intelligence Aura: Predicted vs Real</h3>
              <div style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '20px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                LIVE SATELLITE SYNC
              </div>
            </div>

            <div style={{ height: '350px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...history].reverse()}>
                  <defs>
                    <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
                    stroke="#475569" 
                    fontSize={10}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis stroke="#475569" domain={[0, 1]} tick={{ fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  
                  <Area 
                    type="monotone" 
                    dataKey="probability" 
                    name="AI Predicted Aura" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorProb)" 
                    filter="url(#glow)"
                  />
                  
                  <Area 
                    type="stepAfter" 
                    dataKey="actual_outcome" 
                    name="Real Event Pulse" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorReal)"
                    strokeDasharray="5 5"
                  />
                  
                  <ReferenceLine y={0.53} label={{ value: 'DANGER ZONE', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="auto-header">
            <div>
              <h2>Detailed Region Overview</h2>
              <p>Real-time physical extraction from HMI Magnetograms.</p>
            </div>
            <button className="btn-refresh-auto" onClick={fetchAuto} disabled={autoLoading}>
              {autoLoading ? 'Loading…' : '↺ Refresh Everything'}
            </button>
          </div>

          <div className="pipeline-panel" style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem', color: '#e2e8f0' }}>Full AthenaCTGRU Pipeline</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Downloads magnetograms from JSOC, extracts physical tensors, and runs PyTorch inference.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Lookback Window</label>
                  <select 
                    value={lookbackHours} 
                    onChange={(e) => setLookbackHours(parseInt(e.target.value))}
                    disabled={pipelineStatus?.status === 'starting' || pipelineStatus?.status === 'running'}
                    style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    <option value={12}>12 Hours (Fast)</option>
                    <option value={24}>24 Hours (Standard)</option>
                    <option value={36}>36 Hours (Deep)</option>
                  </select>
                </div>
                <button 
                  onClick={triggerPipeline} 
                  disabled={pipelineStatus?.status === 'starting' || pipelineStatus?.status === 'running'}
                  style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, alignSelf: 'flex-end' }}
                >
                  {pipelineStatus?.status === 'starting' || pipelineStatus?.status === 'running' ? 'Running...' : 'Run Pipeline'}
                </button>
              </div>
            </div>
            
            {(pipelineStatus?.status === 'starting' || pipelineStatus?.status === 'running') && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  <span>{pipelineStatus.message}</span>
                  <span>{pipelineStatus.progress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${pipelineStatus.progress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
            
            {pipelineStatus?.status === 'completed' && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#22c55e' }}>✅ Pipeline completed successfully. Results updated below.</div>
            )}
            
            {pipelineStatus?.status === 'error' && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#ef4444' }}>❌ {pipelineStatus.message}</div>
            )}
          </div>

          {!autoLoading && autoResult && autoResult.note && (
            <div className="predict-model-note" style={{ marginBottom: '1rem' }}>🔬 {autoResult.note}</div>
          )}
          {!autoLoading && autoResult && (
            <div className="auto-grid">
              {Object.entries(autoResult.data || autoResult)
                .filter(([k]) => k !== 'note')
                .map(([ar, data]) => (
                  <div key={ar} className="auto-card">
                    <div className="auto-card-header">
                      <span className="auto-ar-id">AR {ar}</span>
                      <span className={`auto-badge ${data.flagged ? 'flagged' : 'quiet'}`}>
                        {data.flagged ? '⚠️ Elevated' : '✅ Quiet'}
                      </span>
                    </div>
                    <ProbabilityBar prob={data.probability_24h} />
                    {data.zurich_class && data.zurich_class !== '—' && (
                      <div className="auto-meta-row">
                        <span>Zurich: <strong>{data.zurich_class}</strong></span>
                        <span>Mag: <strong>{data.mag_class}</strong></span>
                      </div>
                    )}
                    <div className="auto-meta-row">
                      {data.area > 0 && <span>Area: {data.area} μhm</span>}
                      {data.num_spots > 0 && <span>Spots: {data.num_spots}</span>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PredictPage;
