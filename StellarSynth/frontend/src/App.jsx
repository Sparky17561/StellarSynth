// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  SignIn as ClerkSignIn,
  SignUp as ClerkSignUp,
} from '@clerk/clerk-react';

import './App.css';
import LandingPage from './components/LandingPage';
import SignInPage from './components/Auth/SignInPage';
import SignUpPage from './components/Auth/SignUpPage';
import DashboardLayout from './components/Layout/DashboardLayout';
import HomePage from './components/HomePage';
import Stella from './components/Stella';
import PredictPage from './components/Predict/PredictPage';
import CommunityPage from './components/Community/CommunityPage';
import NewsPage from './components/News/NewsPage';
import ApiAccessPage from './components/ApiAccess/ApiAccessPage';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function App() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/signin"
      signUpUrl="/signup"
      afterSignOutUrl="/"
    >
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />

          <Route
            path="/signin"
            element={
              <div className="auth-page-wrapper">
                <SignedIn>
                  <Navigate to="/home" replace />
                </SignedIn>
                <SignedOut>
                  <SignInPage />
                </SignedOut>
              </div>
            }
          />

          <Route
            path="/signup"
            element={
              <div className="auth-page-wrapper">
                <SignedIn>
                  <Navigate to="/home" replace />
                </SignedIn>
                <SignedOut>
                  <SignUpPage />
                </SignedOut>
              </div>
            }
          />

          {/* Protected Dashboard Routes */}
          <Route
            element={
              <>
                <SignedIn>
                  <DashboardLayout />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn signInUrl="/signin" />
                </SignedOut>
              </>
            }
          >
            <Route path="/home" element={<HomePage />} />
            <Route path="/stella" element={<Stella />} />
            <Route path="/predict" element={<PredictPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/api-access" element={<ApiAccessPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ClerkProvider>
  );
}
