import React from 'react';
import { useSolarWindData } from './SolarWindProvider';
import './TimeControls.css';

const TimeControls = () => {
  const { currentPeriod, setCurrentPeriod, refreshData, isLoading } = useSolarWindData();

  const periods = [
    { key: '6h', label: '6H' },
    { key: '12h', label: '12H' },
    { key: '24h', label: '24H' },
    { key: '3d', label: '3D' },
    { key: '7d', label: '7D' },
    { key: 'all', label: 'ALL' }
  ];

  return (
    <div className="time-controls">
      <div className="period-selector">
        <span className="control-label">📊 Zoom:</span>
        <div className="period-buttons">
          {periods.map((period) => (
            <button
              key={period.key}
              className={`period-button ${currentPeriod === period.key ? 'active' : ''}`}
              onClick={() => setCurrentPeriod(period.key)}
              disabled={isLoading}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>
      
      <button 
        className={`refresh-button ${isLoading ? 'loading' : ''}`}
        onClick={refreshData}
        disabled={isLoading}
      >
        <div className="refresh-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M4 4V8H8M20 20V16H16M18 12C18 16.4183 14.4183 20 10 20C5.58172 20 2 16.4183 2 12C2 7.58172 5.58172 4 10 4C12.2091 4 14.2091 4.89543 15.6569 6.34315L18 8.68629"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="refresh-text">
          {isLoading ? 'Updating...' : 'Refresh Data'}
        </span>
      </button>
    </div>
  );
};

export default TimeControls;