import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import CognitoAuthService from '../services/cognitoAuth';
import mockUserMappingService from '../services/mockUserMapping';
import { CognitoUser } from 'amazon-cognito-identity-js';
import PrivacyModal from './PrivacyModal';
import TermsModal from './TermsModal';

interface AuthProps {
  onLogin: (token: string) => void;
  onLogout: () => void;
  isAuthenticated: boolean;
}

const Auth: React.FC<AuthProps> = ({ onLogin, onLogout, isAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { isDarkMode } = useTheme();

  // Signup state
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [agreeToPrivacyPolicy, setAgreeToPrivacyPolicy] = useState(false);

  // Forgot password state
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'email' | 'verify'>('email');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  // New password required state (first-time login)
  const [requiresNewPassword, setRequiresNewPassword] = useState(false);
  const [tempCognitoUser, setTempCognitoUser] = useState<CognitoUser | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [confirmNewPasswordValue, setConfirmNewPasswordValue] = useState('');


  // Privacy Policy and Terms modals
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await CognitoAuthService.signIn(username, password);

      if (result.success) {
        if (result.requiresNewPassword && result.cognitoUser) {
          // First-time login - requires password change
          setRequiresNewPassword(true);
          setTempCognitoUser(result.cognitoUser);
          setIsLoading(false);
          return;
        }

        if (result.idToken) {
          // Normal login success
          const userInfo = mockUserMappingService.getUserInfo(username);
          localStorage.setItem('user_role', userInfo.role);
          localStorage.setItem('user_display_name', userInfo.displayName);

          console.log(`Cognito login successful for ${username}`);
          onLogin(result.idToken);
        }
      } else {
        setError(result.error || 'Authentication failed. Please check your credentials.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPasswordValue !== confirmNewPasswordValue) {
      setError('Passwords do not match');
      return;
    }

    if (!tempCognitoUser) {
      setError('Session expired. Please login again.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await CognitoAuthService.completeNewPasswordChallenge(
        newPasswordValue,
        tempCognitoUser
      );

      if (result.success && result.idToken) {
        const userInfo = mockUserMappingService.getUserInfo(username);
        localStorage.setItem('user_role', userInfo.role);
        localStorage.setItem('user_display_name', userInfo.displayName);

        console.log('Password changed successfully');
        setRequiresNewPassword(false);
        onLogin(result.idToken);
      } else {
        setError(result.error || 'Failed to set new password');
      }
    } catch (err) {
      console.error('Password change error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await CognitoAuthService.signUp(signupEmail);

      if (result.success) {
        setSuccess(
          'Account created successfully! Please check your email for your temporary password.'
        );
        setSignupEmail('');
        setAgreeToPrivacyPolicy(false);
        setTimeout(() => {
          setShowSignupModal(false);
          setSuccess('');
        }, 5000);
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSignupLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setError('');
    setSuccess('');

    try {
      if (forgotPasswordStep === 'email') {
        const result = await CognitoAuthService.forgotPassword(forgotPasswordEmail);

        if (result.success) {
          setSuccess('Verification code sent to your email!');
          setForgotPasswordStep('verify');
        } else {
          setError(result.error || 'Failed to send verification code');
        }
      } else {
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match');
          setForgotPasswordLoading(false);
          return;
        }

        const result = await CognitoAuthService.confirmForgotPassword(
          forgotPasswordEmail,
          verificationCode,
          newPassword
        );

        if (result.success) {
          setSuccess('Password reset successfully! You can now login with your new password.');
          setTimeout(() => {
            setShowForgotPasswordModal(false);
            setForgotPasswordStep('email');
            setForgotPasswordEmail('');
            setVerificationCode('');
            setNewPassword('');
            setConfirmPassword('');
            setSuccess('');
          }, 2000);
        } else {
          setError(result.error || 'Failed to reset password');
        }
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_display_name');

    CognitoAuthService.signOut();
    onLogout();
  };

  if (isAuthenticated) {
    const userInfo = mockUserMappingService.getCurrentUserInfo();
    const roleColor = userInfo?.role === 'admin' ? 'text-purple-600' :
                     userInfo?.role === 'analyst' ? 'text-blue-600' : 'text-green-600';

    return (
      <div className={`p-6 rounded-xl border transition-all duration-300 ${
        isDarkMode
          ? 'bg-gray-800 border-gray-600'
          : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-lg font-semibold transition-colors duration-300 ${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            }`}>
              Welcome to RevStar Wellness!
            </h3>
            <p className={`text-sm transition-colors duration-300 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {userInfo?.displayName} • <span className={roleColor}>{userInfo?.role}</span> access
            </p>
          </div>
          <button
            onClick={handleLogout}
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              isDarkMode
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // New Password Required Screen
  if (requiresNewPassword) {
    return (
      <div className={`p-6 rounded-xl border transition-all duration-300 ${
        isDarkMode
          ? 'bg-gray-800 border-gray-600'
          : 'bg-white border-gray-200'
      }`}>
        <div className="text-center mb-6">
          <h2 className={`text-2xl font-bold transition-colors duration-300 ${
            isDarkMode ? 'text-gray-100' : 'text-gray-900'
          }`}>
            Set New Password
          </h2>
          <p className={`text-sm mt-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>
            Please set a new password for your account
          </p>
        </div>

        <form onSubmit={handleCompleteNewPassword} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              New Password
            </label>
            <input
              type="password"
              value={newPasswordValue}
              onChange={(e) => setNewPasswordValue(e.target.value)}
              placeholder="Enter new password"
              className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
              }`}
              required
              minLength={8}
            />
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Min 8 characters, must include uppercase, lowercase, number, and symbol
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmNewPasswordValue}
              onChange={(e) => setConfirmNewPasswordValue(e.target.value)}
              placeholder="Confirm new password"
              className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
              }`}
              required
            />
          </div>

          {error && (
            <div className={`p-3 rounded-lg text-sm ${
              isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-50 text-red-700'
            }`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
              isLoading
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:scale-105'
            } ${
              isDarkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isLoading ? 'Setting Password...' : 'Set New Password'}
          </button>
        </form>
      </div>
    );
  }

  // Main Login Screen
  return (
    <div className={`p-6 rounded-xl border transition-all duration-300 ${
      isDarkMode
        ? 'bg-gray-800 border-gray-600'
        : 'bg-white border-gray-200'
    }`}>
      <div className="text-center mb-6">
        {/* RevStar Wellness Navigator Logo */}
        <div className="mb-4 flex justify-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
            isDarkMode
              ? 'bg-gradient-to-r from-slate-700 to-slate-800 shadow-slate-500/25'
              : 'bg-gradient-to-r from-slate-100 to-slate-200'
          }`}>
            <img
              src="/revstar-logo.jpg"
              alt="RevStar Wellness Navigator"
              className="w-16 h-16 object-cover rounded-full"
            />
          </div>
        </div>
        <h2 className={`text-2xl font-bold transition-colors duration-300 ${
          isDarkMode ? 'text-gray-100' : 'text-gray-900'
        }`}>
          Welcome to RevStar Wellness Navigator
        </h2>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium transition-colors duration-300 ${
            isDarkMode ? 'text-gray-300' : 'text-gray-700'
          }`}>
            Email
          </label>
          <input
            type="email"
            name="email"
            data-testid="email-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter email"
            className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
            }`}
            required
          />
        </div>

        <div>
          <label className={`block text-sm font-medium transition-colors duration-300 ${
            isDarkMode ? 'text-gray-300' : 'text-gray-700'
          }`}>
            Password
          </label>
          <input
            type="password"
            name="password"
            data-testid="password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
            }`}
            required
          />
          <div className="flex justify-end mt-1">
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(true)}
              className={`text-xs transition-colors duration-200 ${
                isDarkMode
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-blue-600 hover:text-blue-700'
              }`}
            >
              Forgot Password?
            </button>
          </div>
        </div>

        {error && (
          <div className={`p-3 rounded-lg text-sm ${
            isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-50 text-red-700'
          }`}>
            {error}
          </div>
        )}

        <button
          type="submit"
          data-testid="login-button"
          disabled={isLoading}
          className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
            isLoading
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:scale-105'
          } ${
            isDarkMode
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="relative my-6">
          <div className={`absolute inset-0 flex items-center ${isDarkMode ? '' : ''}`}>
            <div className={`w-full border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className={`px-2 ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'}`}>
              Don't have an account?
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSignupModal(true)}
          className={`w-full py-2 px-4 rounded-lg font-medium border transition-all duration-200 hover:scale-105 ${
            isDarkMode
              ? 'border-gray-600 bg-gray-700 hover:bg-gray-600 text-gray-100'
              : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-900'
          }`}
        >
          Sign Up
        </button>
      </form>

      {/* Signup Modal */}
      {showSignupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-xl shadow-2xl ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Create Account
              </h2>
              <button
                onClick={() => {
                  setShowSignupModal(false);
                  setSignupEmail('');
                  setAgreeToPrivacyPolicy(false);
                  setError('');
                  setSuccess('');
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSignup} className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="Enter your email"
                  className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                  }`}
                  required
                />
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  You'll receive a temporary password via email
                </p>
              </div>

              {/* Privacy Policy Section */}
              <div className={`p-4 rounded-lg border ${
                isDarkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
              }`}>
                <h3 className={`text-sm font-semibold mb-2 ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  Privacy Policy & Terms of Service
                </h3>
                <div className={`text-xs space-y-2 mb-3 max-h-40 overflow-y-auto ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <p>
                    By signing up for RevStar Wellness Navigator, you agree to our{' '}
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className={`font-medium underline hover:no-underline ${
                        isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                      }`}
                    >
                      privacy policy
                    </button>
                    {' '}and{' '}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className={`font-medium underline hover:no-underline ${
                        isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                      }`}
                    >
                      terms of service
                    </button>
                    .
                  </p>
                  <p>
                    We collect and store information about you and your wellness journey to provide personalized recommendations,
                    AI-powered guidance, and tailored resources for your wellness journey.
                  </p>
                  <p>
                    Your data is securely stored and will only be used to improve your experience with our platform.
                    We will never share your personal information with third parties without your explicit consent.
                  </p>
                  <p>
                    You have the right to access, modify, or delete your data at any time by contacting our support team.
                  </p>
                </div>

                {/* Privacy Policy Checkbox */}
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={agreeToPrivacyPolicy}
                    onChange={(e) => setAgreeToPrivacyPolicy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    required
                  />
                  <span className={`text-sm select-none ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    I agree to the Privacy Policy and Terms of Service
                  </span>
                </label>
              </div>

              {error && (
                <div className={`p-3 rounded-lg text-sm ${
                  isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-50 text-red-700'
                }`}>
                  {error}
                </div>
              )}

              {success && (
                <div className={`p-3 rounded-lg text-sm ${
                  isDarkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-50 text-green-700'
                }`}>
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={signupLoading || !agreeToPrivacyPolicy}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                  signupLoading || !agreeToPrivacyPolicy
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-105'
                } ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {signupLoading ? 'Creating Account...' : 'Sign Up'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-xl shadow-2xl ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Reset Password
              </h2>
              <button
                onClick={() => {
                  setShowForgotPasswordModal(false);
                  setForgotPasswordStep('email');
                  setForgotPasswordEmail('');
                  setVerificationCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setError('');
                  setSuccess('');
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="p-6 space-y-4">
              {forgotPasswordStep === 'email' ? (
                <>
                  <div>
                    <label className={`block text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      placeholder="Enter your email"
                      className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                      }`}
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={`block text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Verification Code
                    </label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="Enter code from email"
                      className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                      }`}
                      required
                      minLength={8}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className={`w-full px-3 py-2 mt-1 rounded-lg border transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                      }`}
                      required
                    />
                  </div>
                </>
              )}

              {error && (
                <div className={`p-3 rounded-lg text-sm ${
                  isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-50 text-red-700'
                }`}>
                  {error}
                </div>
              )}

              {success && (
                <div className={`p-3 rounded-lg text-sm ${
                  isDarkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-50 text-green-700'
                }`}>
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={forgotPasswordLoading}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                  forgotPasswordLoading
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-105'
                } ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {forgotPasswordLoading
                  ? 'Processing...'
                  : forgotPasswordStep === 'email'
                    ? 'Send Code'
                    : 'Reset Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      <PrivacyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* Terms of Service Modal */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </div>
  );
};

export default Auth;
