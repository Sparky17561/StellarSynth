// src/components/SignIn.jsx
import React from 'react';
import {
  SignedIn,
  SignedOut,
  SignIn as ClerkSignIn,
  RedirectToSignIn,
} from '@clerk/clerk-react';
import './SignIn.css';

// src/components/SignIn.jsx
import React from 'react';
import {
  SignedIn,
  SignedOut,
  SignIn as ClerkSignIn,
} from '@clerk/clerk-react';
import './SignIn.css';

export default function SignIn() {
  return (
    <div className="signin-page">
      <div className="signin-container">
        <div className="signin-left">
          <div className="signin-content">
            <div className="logo-section">
              <h1 className="logo-text">StellarSynth</h1>
              <p className="logo-subtitle">Space Weather Intelligence Platform</p>
            </div>

            <div className="clerk-placeholder">
              <div className="clerk-box">
                <SignedOut>
                  <ClerkSignIn
                    routing="path"
                    // Mount under a stable path distinct from your wrapper if you used one
                    path="/auth/signin"
                    signUpUrl="/signup"
                    // ⛔ afterSignInUrl is deprecated
                    // ✅ Use one of the new props:
                    // - forceRedirectUrl: always go here after sign-in
                    // - fallbackRedirectUrl: use this if Clerk can't resume an interrupted deep link
                    forceRedirectUrl="/home"
                    fallbackRedirectUrl="/home"
                  />
                </SignedOut>

                <SignedIn>
                  {/* If the user somehow opens /auth/signin while signed in */}
                  <p>You're already signed in. Redirecting…</p>
                </SignedIn>
              </div>
            </div>
          </div>
        </div>

        <div className="signin-right">
          {/* your visual cards remain unchanged */}
          <div className="visual-content">
            <div className="floating-card card-1">
              <div className="card-icon">📊</div>
              <h4>Solar Panel</h4>
              <p>Real-time monitoring</p>
            </div>
            <div className="floating-card card-2">
              <div className="card-icon">🤖</div>
              <h4>Stella AI</h4>
              <p>Intelligent assistant</p>
            </div>
            <div className="floating-card card-3">
              <div className="card-icon">⚡</div>
              <h4>Predictions</h4>
              <p>24–48h forecasts</p>
            </div>
            <div className="glow-effect"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
