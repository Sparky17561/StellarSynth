// Shared compact chart card wrapper
import React from 'react';
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

export const ChartCard = ({ title, icon, currentPeriod, onPeriodChange, onRefresh, isLoading, stats, children }) => (
  <div className="chart-card">
    <div className="cc-header">
      <h3 className="cc-title">
        <span>{icon}</span>
        {title}
      </h3>
      <div className="cc-controls">
        {PERIODS.map(p => (
          <button
            key={p}
            className={`cc-period-btn${currentPeriod === p ? ' active' : ''}`}
            onClick={() => onPeriodChange(p)}
            disabled={isLoading}
          >
            {p.toUpperCase()}
          </button>
        ))}
        <button className={`cc-refresh-btn${isLoading ? ' spinning' : ''}`} onClick={onRefresh} disabled={isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64M3.51 15a9 9 0 0014.85 3.36"/>
          </svg>
          {isLoading ? '…' : '↺'}
        </button>
      </div>
    </div>
    <div className="cc-body">
      {isLoading && !stats ? (
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

export default ChartCard;
