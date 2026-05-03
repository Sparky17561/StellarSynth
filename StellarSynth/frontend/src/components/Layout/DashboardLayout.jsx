import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';
import { LayoutDashboard, Brain, Activity, MessageSquare, Newspaper, Key, Sun } from 'lucide-react';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const { user } = useUser();
  const location = useLocation();

  const getPageInfo = () => {
    switch (location.pathname) {
      case '/home': return { title: 'Dashboard', sub: 'Real-time space weather monitoring' };
      case '/stella': return { title: 'Stella AI', sub: 'Intelligent space weather assistant' };
      case '/predict': return { title: 'Prediction Models', sub: 'Solar flare forecasting and simulation' };
      case '/community': return { title: 'Community', sub: 'Discuss space weather events' };
      case '/news': return { title: 'News & Articles', sub: 'Latest updates in solar physics' };
      case '/api-access': return { title: 'API Access', sub: 'Manage your developer keys' };
      default: return { title: 'Overview', sub: '' };
    }
  };

  const { title, sub } = getPageInfo();

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Sun className="sidebar-logo" size={28} />
          <span className="sidebar-title">StellarSynth</span>
        </div>
        
        <nav className="sidebar-nav">
          <NavLink to="/home" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard className="nav-icon" />
            Dashboard
          </NavLink>
          <NavLink to="/stella" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Brain className="nav-icon" />
            Stella AI
          </NavLink>
          <NavLink to="/predict" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Activity className="nav-icon" />
            Predict
          </NavLink>
          <NavLink to="/community" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <MessageSquare className="nav-icon" />
            Community
          </NavLink>
          <NavLink to="/news" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Newspaper className="nav-icon" />
            News
          </NavLink>
          <NavLink to="/api-access" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Key className="nav-icon" />
            API Access
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} StellarSynth
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar">
          <UserButton afterSignOutUrl="/" />
        </header>

        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">{title}</h1>
            {sub && <p className="page-subtitle">{sub}</p>}
          </div>
          
          {/* This renders the current nested route component */}
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
