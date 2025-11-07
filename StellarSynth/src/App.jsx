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
import HomePage from './components/HomePage';
import SolarPanel from './components/SolarPanel';
import Stella from './components/Stella';

// Vite env. If CRA, use: const clerkPubKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
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
          {/* Landing */}
          <Route path="/" element={<LandingPage />} />

          {/* ✅ Sign-in page (render the Clerk widget directly, nothing fancy) */}
          <Route
            path="/signin"
            element={
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: '100vh',
                }}
              >
                {/* If already signed in, go home. Otherwise show widget. */}
                <SignedIn>
                  <Navigate to="/home" replace />
                </SignedIn>
                <SignedOut>
                  <ClerkSignIn
                    routing="path"
                    path="/signin"
                    signUpUrl="/signup"
                    // ⛔ afterSignInUrl deprecated
                    // ✅ Always go to /home after sign-in
                    forceRedirectUrl="/home"
                    fallbackRedirectUrl="/home"
                  />
                </SignedOut>
              </div>
            }
          />

          {/* (Optional) Sign-up page */}
          <Route
            path="/signup"
            element={
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: '100vh',
                }}
              >
                <ClerkSignUp
                  routing="path"
                  path="/signup"
                  signInUrl="/signin"
                  forceRedirectUrl="/home"
                  fallbackRedirectUrl="/home"
                />
              </div>
            }
          />

          {/* ✅ Protected routes */}
          <Route
            path="/home"
            element={
              <>
                <SignedIn>
                  <HomePage />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn signInUrl="/signin" />
                </SignedOut>
              </>
            }
          />

          <Route
            path="/solar-panel"
            element={
              <>
                <SignedIn>
                  <SolarPanel />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn signInUrl="/signin" />
                </SignedOut>
              </>
            }
          />

          <Route
            path="/stella"
            element={
              <>
                <SignedIn>
                  <Stella />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn signInUrl="/signin" />
                </SignedOut>
              </>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ClerkProvider>
  );
}
