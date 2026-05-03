import React from 'react';
import { SignIn } from '@clerk/clerk-react';
import './AuthPage.css';

const SignInPage = () => {
  return (
    <div className="auth-container">
      <div className="auth-background">
        <div className="stars"></div>
        <div className="twinkling"></div>
      </div>
      <div className="auth-card-wrapper">
        <SignIn
          routing="path"
          path="/signin"
          signUpUrl="/signup"
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

export default SignInPage;
