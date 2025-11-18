/**
 * AWS Cognito Authentication Service
 * Handles user authentication with AWS Cognito User Pool
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from '../config/env';

// Cognito configuration from CDK deployment outputs
const poolData = {
  UserPoolId: config.userPoolId,
  ClientId: config.clientId,
};

const userPool = new CognitoUserPool(poolData);

export interface AuthResult {
  success: boolean;
  message?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export class CognitoAuthService {
  /**
   * Sign in a user with username and password
   */
  static async signIn(username: string, password: string): Promise<AuthResult> {
    return new Promise((resolve) => {
      const userData = {
        Username: username,
        Pool: userPool,
      };

      const cognitoUser = new CognitoUser(userData);
      
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          // Store tokens in localStorage
          const idToken = session.getIdToken().getJwtToken();
          const accessToken = session.getAccessToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();

          localStorage.setItem('auth_token', idToken);
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', refreshToken);
          localStorage.setItem('user_id', username);

          resolve({
            success: true,
            message: 'Authentication successful',
            idToken,
            accessToken,
            refreshToken,
          });
        },
        onFailure: (err) => {
          console.error('Authentication failed:', err);
          resolve({
            success: false,
            error: err.message || 'Authentication failed',
          });
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          // Handle new password requirement
          console.log('New password required');
          resolve({
            success: false,
            error: 'New password required. Please contact administrator.',
          });
        },
      });
    });
  }

  /**
   * Sign out the current user
   */
  static signOut(): void {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
    
    // Clear all stored tokens and user data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('session_id');
    localStorage.removeItem('user_role');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('user_display_name');
  }

  /**
   * Get the current authenticated user
   */
  static getCurrentUser(): CognitoUser | null {
    return userPool.getCurrentUser();
  }

  /**
   * Check if a user is currently authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    return new Promise((resolve) => {
      const cognitoUser = userPool.getCurrentUser();
      
      if (!cognitoUser) {
        resolve(false);
        return;
      }

      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          resolve(false);
          return;
        }

        resolve(session.isValid());
      });
    });
  }

  /**
   * Get the current session
   */
  static async getSession(): Promise<CognitoUserSession | null> {
    return new Promise((resolve) => {
      const cognitoUser = userPool.getCurrentUser();
      
      if (!cognitoUser) {
        resolve(null);
        return;
      }

      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          resolve(null);
          return;
        }

        resolve(session);
      });
    });
  }

  /**
   * Refresh the current session tokens
   */
  static async refreshSession(): Promise<boolean> {
    const session = await this.getSession();
    
    if (!session) {
      return false;
    }

    return new Promise((resolve) => {
      const cognitoUser = userPool.getCurrentUser();
      
      if (!cognitoUser) {
        resolve(false);
        return;
      }

      const refreshToken = session.getRefreshToken();
      
      cognitoUser.refreshSession(refreshToken, (err, newSession) => {
        if (err) {
          console.error('Failed to refresh session:', err);
          resolve(false);
          return;
        }

        // Update stored tokens
        const idToken = newSession.getIdToken().getJwtToken();
        const accessToken = newSession.getAccessToken().getJwtToken();
        
        localStorage.setItem('auth_token', idToken);
        localStorage.setItem('access_token', accessToken);
        
        resolve(true);
      });
    });
  }
}

export default CognitoAuthService;