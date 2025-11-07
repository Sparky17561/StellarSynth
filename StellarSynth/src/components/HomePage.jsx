import React from 'react';
import './HomePage.css';

const HomePage = () => {
  return (
    <div className="home-page">
      <div className="home-container">
        <div className="welcome-section">
          <h1 className="welcome-title">Welcome to <span className="gradient-text">StellarSynth</span></h1>
          <p className="welcome-subtitle">Your Space Weather Command Center</p>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card solar-panel">
            <div className="card-icon">📊</div>
            <h2>Solar Panel</h2>
            <p>Monitor real-time space weather data and solar activity</p>
            <button className="card-btn" onClick={() => window.location.href = '/solar-panel'}>
              View Dashboard
            </button>
          </div>

          <div className="dashboard-card stella-ai">
            <div className="card-icon">🤖</div>
            <h2>Stella AI Assistant</h2>
            <p>Chat with our intelligent AI for space weather insights</p>
            <button className="card-btn" onClick={() => window.location.href = '/stella'}>
              Start Chat
            </button>
          </div>

          <div className="dashboard-card community">
            <div className="card-icon">👥</div>
            <h2>Community</h2>
            <p>Connect with space enthusiasts and share knowledge</p>
            <button className="card-btn" onClick={() => window.location.href = '/community'}>
              Join Discussion
            </button>
          </div>

          <div className="dashboard-card alerts">
            <div className="card-icon">⚠️</div>
            <h2>Solar Flare Alerts</h2>
            <p>Stay updated with AI-powered predictions</p>
            <button className="card-btn" onClick={() => window.location.href = '/alerts'}>
              View Alerts
            </button>
          </div>
        </div>

        <div className="quick-stats">
          <h2 className="stats-title">Current Status</h2>
          <div className="stats-grid">
            <div className="stat-box">
              <h3>Solar Activity</h3>
              <p className="stat-value">Moderate</p>
              <span className="stat-indicator moderate"></span>
            </div>
            <div className="stat-box">
              <h3>Kp Index</h3>
              <p className="stat-value">3.2</p>
              <span className="stat-indicator low"></span>
            </div>
            <div className="stat-box">
              <h3>Flare Risk (24h)</h3>
              <p className="stat-value">15%</p>
              <span className="stat-indicator low"></span>
            </div>
            <div className="stat-box">
              <h3>Solar Wind Speed</h3>
              <p className="stat-value">425 km/s</p>
              <span className="stat-indicator moderate"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;