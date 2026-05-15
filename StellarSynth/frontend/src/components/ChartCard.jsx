// Shared compact chart card wrapper
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ChartCard.css';

const PERIODS = ['6h', '12h', '24h', '3d', '7d', 'all'];

const SkeletonLoader = () => (
  <div className="cc-skeleton-wrap">
    <div className="cc-skeleton-bar" style={{ width: '90%', animationDelay: '0ms' }} />
    <div className="cc-skeleton-bar" style={{ width: '60%', animationDelay: '100ms' }} />
    <div className="cc-skeleton-bar" style={{ width: '75%', animationDelay: '200ms' }} />
    <div className="cc-skeleton-line" />
  </div>
);

export const ChartCard = ({ title, infoContent, currentPeriod, onPeriodChange, onRefresh, isLoading, stats, children }) => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [stellaPopup, setStellaPopup] = React.useState(null);
  const navigate = useNavigate();
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    setStellaPopup({ x: e.clientX, y: e.clientY });
  };

  const closePopup = () => setStellaPopup(null);

  const triggerStella = () => {
    navigate('/stella', { state: { query: `Analyze the recent ${title} data for me and explain what the current values mean.` } });
    closePopup();
  };

  const loading = isLoading || isRefreshing;

  return (
    <div className="chart-card" onDoubleClick={handleDoubleClick} title="Double-click for Ask Stella menu">
      {stellaPopup && (
        <div 
          className="ask-stella-popup-overlay" 
          onClick={closePopup}
          onContextMenu={(e) => { e.preventDefault(); closePopup(); }}
        >
          <button 
            className="ask-stella-popup-btn"
            style={{ left: stellaPopup.x, top: stellaPopup.y }}
            onClick={(e) => { e.stopPropagation(); triggerStella(); }}
          >
            Ask Stella ✨
          </button>
        </div>
      )}
      <div className="cc-header">
        <h3 className="cc-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {title}
          {infoContent && (
            <div className="cc-info-wrap">
              <span className="cc-info-icon">ⓘ</span>
              <div className="cc-info-tooltip">
                {infoContent.split(/\\n|\n/).map((line, idx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  if (trimmed.includes(':')) {
                    const [label, ...rest] = trimmed.split(':');
                    return (
                      <div key={idx} style={{ marginBottom: '8px' }}>
                        <strong style={{ color: '#60a5fa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '2px' }}>
                          {label}:
                        </strong>
                        <span style={{ display: 'block' }}>{rest.join(':').trim()}</span>
                      </div>
                    );
                  }
                  return <div key={idx} style={{ marginBottom: '8px' }}>{trimmed}</div>;
                })}
              </div>
            </div>
          )}
        </h3>
        <div className="cc-controls">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`cc-period-btn${currentPeriod === p ? ' active' : ''}`}
              onClick={() => onPeriodChange(p)}
              disabled={loading}
            >
              {p.toUpperCase()}
            </button>
          ))}
          <button className={`cc-refresh-btn${loading ? ' spinning' : ''}`} onClick={handleRefresh} disabled={loading} title="Reload Data">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64M3.51 15a9 9 0 0014.85 3.36"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="cc-body">
        {loading && !stats ? (
          <SkeletonLoader />
        ) : (
          <>
            {children}
            {stats && (
              <div className="cc-stats">
                {stats.map((s, i) => (
                  <div key={i} className="cc-stat">
                    <span className="cc-stat-label">{s.label}</span>
                    <span className="cc-stat-value" style={s.color ? { color: s.color } : {}}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChartCard;
