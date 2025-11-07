// src/components/LandingPage.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './LandingPage.css';

// Navbar
const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-logo">
          <span className="logo-text">StellarSynth</span>
        </div>

        <div className={`nav-menu ${isOpen ? 'active' : ''}`}>
          <a href="#features" className="nav-link">Features</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <a href="#about" className="nav-link">About</a>
          <button className="nav-btn-secondary" onClick={() => navigate('/signin')}>
            Sign In
          </button>
        </div>

        <div className="nav-toggle" onClick={() => setIsOpen(!isOpen)}>
          <span></span><span></span><span></span>
        </div>
      </div>
    </nav>
  );
};

// Hero
const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="hero">
      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-badge">
            <span>🚀 Predict Solar Flares with AI</span>
          </div>
          <h1 className="hero-title">
            Monitor Space Weather in
            <span className="gradient-text"> Real-Time</span>
          </h1>
          <p className="hero-description">
            StellarSynth combines advanced deep learning with comprehensive space weather data to predict solar flares 24–48 hours in advance. Join our community of space enthusiasts and researchers.
          </p>
          <div className="hero-buttons">
            <button className="cta-primary" onClick={() => navigate('/signin')}>
              Get Early Access
            </button>
            <button
              className="cta-secondary"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Learn More
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <h3>24–48h</h3>
              <p>Prediction Window</p>
            </div>
            <div className="stat">
              <h3>7+</h3>
              <p>Data Metrics</p>
            </div>
            <div className="stat">
              <h3>AI-Powered</h3>
              <p>Deep Learning</p>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="video-placeholder">
            <div className="video-container">
              <div className="play-icon">▶</div>
              <p>Your Spline Animation Video Here</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Features
const Features = () => {
  const features = [
    { icon: '📊', title: 'Real-Time Dashboard', description: 'Monitor solar wind speed, temperature, density, magnetic field, proton flux, X-ray flux, and Kp index in real-time.' },
    { icon: '🤖', title: 'AI Solar Flare Prediction', description: 'Our deep learning model analyzes patterns and predicts solar flares within a 24–48 hour sliding window with high accuracy.' },
    { icon: '👥', title: 'Space Community', description: 'Connect with fellow space enthusiasts, share insights through blogs, and engage in meaningful discussions.' },
    { icon: '💬', title: 'Intelligent Chatbot', description: 'Query historical data, get insights on current conditions, and access 10+ years of solar flare records for research.' },
    { icon: '📰', title: 'News & Articles', description: 'Stay updated with the latest space weather news and access curated articles related to solar activities.' },
    { icon: '🔌', title: 'API Access', description: 'Integrate our data and predictions into your applications with our powerful API (Pro feature coming soon).' },
  ];

  return (
    <section id="features" className="features">
      <div className="features-container">
        <div className="section-header">
          <h2 className="section-title">Powerful Features</h2>
          <p className="section-subtitle">Everything you need to monitor and predict space weather</p>
        </div>

        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-description">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Pricing
const Pricing = () => {
  const navigate = useNavigate();

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: [
        'Access to Solar Panel dashboard',
        'Real-time space weather data',
        'Community access',
        'Basic solar flare alerts',
        'Limited historical data',
      ],
      cta: 'Get Started',
      popular: false,
    },
    {
      name: 'Pro',
      price: '$19',
      period: 'per month',
      features: [
        'Everything in Free',
        'AI Chatbot access',
        'API access for integrations',
        'Extended chat capabilities',
        'Insider email alerts',
        '24h flare prediction verdict',
        '10+ years historical data',
        'Priority support',
      ],
      cta: 'Start Pro Trial',
      popular: true,
    },
  ];

  return (
    <section id="pricing" className="pricing">
      <div className="pricing-container">
        <div className="section-header">
          <h2 className="section-title">Choose Your Plan</h2>
          <p className="section-subtitle">Join the waitlist now and get Pro membership free for 1 year when we launch! 🎉</p>
        </div>

        <div className="pricing-grid">
          {plans.map((plan, i) => (
            <div key={i} className={`pricing-card ${plan.popular ? 'popular' : ''}`}>
              {plan.popular && <div className="popular-badge">Most Popular</div>}
              <h3 className="plan-name">{plan.name}</h3>
              <div className="plan-price">
                <span className="price">{plan.price}</span>
                <span className="period">/{plan.period}</span>
              </div>
              <ul className="plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="checkmark">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={plan.popular ? 'plan-cta primary' : 'plan-cta secondary'}
                onClick={() => navigate('/signin')}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Footer
const Footer = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = () => {
    if (email && email.includes('@')) {
      setSubscribed(true);
      setTimeout(() => {
        setEmail('');
        setSubscribed(false);
      }, 3000);
    }
  };

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h3 className="footer-logo">StellarSynth</h3>
            <p className="footer-description">
              Predicting space weather with artificial intelligence. Join the future of solar monitoring.
            </p>
          </div>

          <div className="footer-section">
            <h4>Product</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><Link to="/solar-panel">Solar Panel</Link></li>
              <li><Link to="/stella">Stella AI</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>Company</h4>
            <ul>
              <li><a href="#about">About</a></li>
              <li><a href="#community">Community</a></li>
              <li><a href="#blog">Blog</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>

          <div className="footer-section waitlist">
            <h4>Join the Waitlist</h4>
            <p className="waitlist-notice">
              🎁 Subscribe now and get <strong>Pro membership FREE for 1 year</strong> when we launch!
            </p>
            <div className="waitlist-form">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="waitlist-input"
              />
              <button onClick={handleSubmit} className="waitlist-btn">
                {subscribed ? '✓ Subscribed!' : 'Join Waitlist'}
              </button>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; 2025 StellarSynth. All rights reserved.</p>
          <div className="footer-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

// Page
export default function LandingPage() {
  return (
    <div className="app">
      <Navbar />
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </div>
  );
}
