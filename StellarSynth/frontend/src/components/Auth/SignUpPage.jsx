import React from 'react';
import { SignUp } from '@clerk/clerk-react';
import './AuthPage.css';

const SignUpPage = () => {
  return (
    <div className="auth-container">
      <div className="auth-background">
        <div className="stars"></div>
        <div className="twinkling"></div>
      </div>
      <div className="auth-card-wrapper">
        <SignUp
          routing="path"
          path="/signup"
          signInUrl="/signin"
          forceRedirectUrl="/home"
          appearance={{
            elements: {
              card: "clerk-custom-card",
              headerTitle: "clerk-custom-title",
              headerSubtitle: "clerk-custom-subtitle",
              socialButtonsBlockButton: "clerk-social-btn",
              formButtonPrimary: "clerk-primary-btn"
            }
          }}
        />
      </div>
    </div>
  );
};

export default SignUpPage;
