import React from 'react';
import { SolarWindProvider } from './SolarWindProvider';
import SolarWindSpeed from './SolarWindSpeed';
import SolarWindDensity from './SolarWindDensity';
import SolarWindTemperature from './SolarWindTemperature';
import MagneticField from './MagneticField';
import ProtonFlux from './ProtonFlux';
import XrayFlux from './XrayFlux';
import GeomagneticIndex from './GeomagneticIndex';
import './ChartCard.css';

const DashboardContent = () => (
  <div className="dash-grid">
    <SolarWindSpeed />
    <SolarWindDensity />
    <SolarWindTemperature />
    <MagneticField />
    <ProtonFlux />
    <XrayFlux />
    {/* Kp spans full width for the bar chart to breathe */}
    <div style={{ gridColumn: '1 / -1' }}>
      <GeomagneticIndex />
    </div>
  </div>
);

const SolarPanel = () => (
  <SolarWindProvider>
    <DashboardContent />
  </SolarWindProvider>
);

export default SolarPanel;
