import React, { useState, useEffect } from 'react';
import SolarPanel from './SolarPanel';
import './ChartCard.css';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const HomePage = () => {
  const [insight, setInsight] = useState('Fetching AI insight…');

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch(`${API}/api/dashboard/insight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}) // Let backend fetch real NOAA data
        });
        const d = await r.json();
        setInsight(d.insight);
      } catch { setInsight('AI insight unavailable — backend may be offline.'); }
    };
    fetch_();
  }, []);

  return (
    <div className="dash-page">
      <div className="dash-header-row">
        <h1>Nowcast Dashboard</h1>
        <p>Live space weather from NOAA — updates every 5 min</p>
      </div>

      <div className="ai-bar">
        <span className="ai-bar-icon">✨</span>
        <div>
          <strong className="ai-bar-label">Stella AI Insight</strong>
          {insight}
        </div>
      </div>

      <SolarPanel />
    </div>
  );
};

export default HomePage;