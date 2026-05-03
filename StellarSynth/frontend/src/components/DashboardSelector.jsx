import React from 'react';
import { useSolarWindData } from './SolarWindProvider';
import './DashboardSelector.css';

const DashboardSelector = () => {
  const { currentDashboard, setCurrentDashboard, setCurrentPeriod } = useSolarWindData();

  const dashboards = [
    { key: 'speed', label: 'Solar Wind Speed', icon: '🌪️' },
    { key: 'density', label: 'Solar Wind Density', icon: '⚪' },
    { key: 'temperature', label: 'Solar Wind Temperature', icon: '🌡️' },
    { key: 'magnetic', label: 'Magnetic Field Bz', icon: '🧲' },
    { key: 'proton', label: 'Proton Flux', icon: '⚛️' },
    { key: 'xray', label: 'X-ray Flux', icon: '☢️' },
    { key: 'kp', label: 'Geomagnetic Index', icon: '🌍' }
  ];

  const handleDashboardChange = (dashboard) => {
    setCurrentDashboard(dashboard);
    setCurrentPeriod('24h');
  };

  return (
    <div className="dashboard-selector">
      {dashboards.map((dashboard) => (
        <button
          key={dashboard.key}
          className={`dashboard-button ${currentDashboard === dashboard.key ? 'active' : ''}`}
          onClick={() => handleDashboardChange(dashboard.key)}
        >
          <span className="dashboard-icon">{dashboard.icon}</span>
          <span className="dashboard-label">{dashboard.label}</span>
        </button>
      ))}
    </div>
  );
};

export default DashboardSelector;