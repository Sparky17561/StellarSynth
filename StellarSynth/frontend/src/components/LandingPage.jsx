import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import './LandingPage.css';

const LandingPage = () => {
  const { isSignedIn } = useAuth();

  return (
    <div className="landing-container">
      <div className="landing-bg">
        <div className="planet-glow"></div>
        <div className="grid-overlay"></div>
      </div>
      
      <nav className="landing-nav">
        <div className="nav-logo">
          <span className="logo-icon">✨</span>
          <span>StellarSynth</span>
        </div>
        <div className="nav-actions">
          {isSignedIn ? (
            <Link to="/home" className="btn-primary">Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/signin" className="btn-ghost">Log In</Link>
              <Link to="/signup" className="btn-primary">Get Started</Link>
            </>
          )}
        </div>
      </nav>

      <main className="landing-hero">
        <div className="hero-badge">Nowcast Space Weather</div>
        <h1 className="hero-title">Predict the Unpredictable.<br/><span className="text-gradient">Master the Solar Winds.</span></h1>
        <p className="hero-subtitle">
          Advanced AI-driven insights, live NOAA telemetry, and a thriving community of space enthusiasts. Stay ahead of geomagnetic storms and solar flares.
        </p>
        <div className="hero-cta">
          <Link to={isSignedIn ? "/home" : "/signup"} className="btn-glow">Enter the Platform</Link>
        </div>
      </main>

      <footer className="landing-footer">
        <h3>Built with passion by</h3>
        <ul className="team-list">
          <li>Dr. Vidyullata Devmane</li>
          <li>Jay Chedda</li>
          <li>Krishita Ravet</li>
          <li>Saiprasad Jamdar</li>
          <li>Tanish Shah</li>
        </ul>
      </footer>
    </div>
  );
};

export default LandingPage;
