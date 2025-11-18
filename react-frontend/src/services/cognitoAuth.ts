// Real Cognito Authentication Service
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from '../config/env';

interface AuthResult {
  success: boolean;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  requiresNewPassword?: boolean;
  cognitoUser?: CognitoUser;
}

class CognitoAuthService {
  private userPool: CognitoUserPool;
  private currentUser: CognitoUser | null = null;

  constructor() {
    const poolData = {
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
    };
    this.userPool = new CognitoUserPool(poolData);
  }

  async signIn(username: string, password: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const userData = {
        Username: username,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);
      this.currentUser = cognitoUser;

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          const idToken = session.getIdToken().getJwtToken();
          const accessToken = session.getAccessToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();

          // Store token in localStorage for API calls
          localStorage.setItem('auth_token', idToken);
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', refreshToken);

          // Store user info
          const userId = session.getIdToken().payload.sub;
          localStorage.setItem('user_id', userId);
          localStorage.setItem('username', username);

          console.log('Cognito authentication successful');
          resolve({
            success: true,
            idToken,
            accessToken,
            refreshToken,
          });
        },

        onFailure: (err) => {
          console.error('Cognito authentication failed:', err);
          resolve({
            success: false,
            error: err.message || 'Authentication failed',
          });
        },

        newPasswordRequired: (userAttributes) => {
          // Handle new password requirement - return success with flag
          console.log('New password required:', userAttributes);
          resolve({
            success: true,
            requiresNewPassword: true,
            cognitoUser: cognitoUser,
          });
        },

      });
    });
  }

  signOut(): void {
    const cognitoUser = this.userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }

    // Clear all auth-related localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');

    this.currentUser = null;
  }

  isSignedIn(): boolean {
    return !!localStorage.getItem('auth_token');
  }

  getCurrentUser(): CognitoUser | null {
    return this.userPool.getCurrentUser();
  }

  async getSession(): Promise<CognitoUserSession | null> {
    return new Promise((resolve) => {
      const cognitoUser = this.getCurrentUser();

      if (!cognitoUser) {
        resolve(null);
        return;
      }

      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err) {
          console.error('Error getting session:', err);
          resolve(null);
          return;
        }
        resolve(session);
      });
    });
  }

  async refreshSession(): Promise<boolean> {
    try {
      const session = await this.getSession();
      if (session && session.isValid()) {
        const idToken = session.getIdToken().getJwtToken();
        localStorage.setItem('auth_token', idToken);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return false;
    }
  }

  getIdToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  getUserId(): string | null {
    return localStorage.getItem('user_id');
  }

  /**
   * Sign up a new user with email
   * Uses Lambda-based registration that calls AdminCreateUser
   * This triggers an invitation email with a temporary password
   */
  async signUp(email: string): Promise<AuthResult> {
    try {
      const apiUrl = config.apiUrl;
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Signup successful:', data);
        return {
          success: true,
        };
      } else {
        console.error('Signup error:', data.error);
        return {
          success: false,
          error: data.error || 'Signup failed',
        };
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      return {
        success: false,
        error: err.message || 'An unexpected error occurred',
      };
    }
  }

  /**
   * Generate a temporary password that meets Cognito requirements
   */
  private generateTemporaryPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Ensure password has at least one of each required character type
    password += 'A'; // uppercase
    password += 'a'; // lowercase
    password += '1'; // digit
    password += '!'; // symbol

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Complete new password challenge for first-time login
   */
  async completeNewPasswordChallenge(newPassword: string, cognitoUser: CognitoUser): Promise<AuthResult> {
    return new Promise((resolve) => {
      cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: (session: CognitoUserSession) => {
          const idToken = session.getIdToken().getJwtToken();
          const accessToken = session.getAccessToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();

          // Store tokens
          localStorage.setItem('auth_token', idToken);
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', refreshToken);

          const userId = session.getIdToken().payload.sub;
          localStorage.setItem('user_id', userId);

          console.log('Password change successful');
          resolve({
            success: true,
            idToken,
            accessToken,
            refreshToken,
          });
        },
        onFailure: (err) => {
          console.error('Password change failed:', err);
          resolve({
            success: false,
            error: err.message || 'Failed to set new password',
          });
        },
      });
    });
  }

  /**
   * Initiate forgot password flow - sends verification code to email
   */
  async forgotPassword(email: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);

      cognitoUser.forgotPassword({
        onSuccess: () => {
          console.log('Password reset code sent');
          resolve({
            success: true,
          });
        },
        onFailure: (err) => {
          console.error('Forgot password error:', err);
          resolve({
            success: false,
            error: err.message || 'Failed to send password reset code',
          });
        },
      });
    });
  }

  /**
   * Confirm forgot password with verification code and new password
   */
  async confirmForgotPassword(
    email: string,
    verificationCode: string,
    newPassword: string
  ): Promise<AuthResult> {
    return new Promise((resolve) => {
      const userData = {
        Username: email,
        Pool: this.userPool,
      };

      const cognitoUser = new CognitoUser(userData);

      cognitoUser.confirmPassword(verificationCode, newPassword, {
        onSuccess: () => {
          console.log('Password reset successful');
          resolve({
            success: true,
          });
        },
        onFailure: (err) => {
          console.error('Password reset confirmation error:', err);
          resolve({
            success: false,
            error: err.message || 'Failed to reset password',
          });
        },
      });
    });
  }

}

export default new CognitoAuthService();
