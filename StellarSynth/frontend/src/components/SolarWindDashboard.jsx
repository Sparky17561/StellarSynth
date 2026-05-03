import React from 'react';
import { SolarWindProvider, useSolarWindData } from './SolarWindProvider';
import DashboardSelector from './DashboardSelector';
import TimeControls from './TimeControls';
import SolarWindSpeed from './SolarWindSpeed';
import SolarWindDensity from './SolarWindDensity';
import SolarWindTemperature from './SolarWindTemperature';
import MagneticField from './MagneticField';
import ProtonFlux from './ProtonFlux';
import XrayFlux from './XrayFlux';
import GeomagneticIndex from './GeomagneticIndex';
import './SolarWindDashboard.css';

const DashboardContent = () => {
  const { currentDashboard } = useSolarWindData();

  const renderCurrentDashboard = () => {
    switch (currentDashboard) {
      case 'speed':
        return <SolarWindSpeed />;
      case 'density':
        return <SolarWindDensity />;
      case 'temperature':
        return <SolarWindTemperature />;
      case 'magnetic':
        return <MagneticField />;
      case 'proton':
        return <ProtonFlux />;
      case 'xray':
        return <XrayFlux />;
      case 'kp':
        return <GeomagneticIndex />;
      default:
        return <SolarWindSpeed />;
    }
  };

  return (
    <div className="solar-wind-dashboard">
      <div className="dashboard-header">
        <h1 className="main-title">
          <span className="title-icon">☀️</span>
          Solar Wind Dashboard
        </h1>
        <p className="subtitle">Real-time solar wind and magnetic field data from NOAA Space Weather</p>
      </div>

      <DashboardSelector />
      <TimeControls />
      
      <div className="dashboard-content">
        {renderCurrentDashboard()}
      </div>
    </div>
  );
};

const SolarWindDashboard = () => {
  return (
    <SolarWindProvider>
      <DashboardContent />
    </SolarWindProvider>
  );
};

export default SolarWindDashboard;