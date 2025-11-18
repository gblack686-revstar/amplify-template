import React, { createContext, useContext, useState, useEffect } from 'react';
import { config } from '../config/env';

interface User {
  email: string;
  userId: string;
  tenantId: string;
  role: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  getIdToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock Cognito configuration - replace with actual AWS Amplify Auth
const COGNITO_CONFIG = {
  userPoolId: config.userPoolId,
  clientId: config.clientId,
  region: config.region,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing session on mount
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      // Check localStorage for existing session
      const storedToken = localStorage.getItem('idToken');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken && storedUser) {
        // Verify token is not expired
        const tokenPayload = JSON.parse(atob(storedToken.split('.')[1]));
        const expirationTime = tokenPayload.exp * 1000;
        
        if (Date.now() < expirationTime) {
          setUser(JSON.parse(storedUser));
          setIdToken(storedToken);
        } else {
          // Token expired, clear storage
          localStorage.removeItem('idToken');
          localStorage.removeItem('user');
        }
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      
      // In production, this would call AWS Cognito
      // For now, simulate authentication
      
      // Mock authentication - replace with actual Cognito call
      const mockResponse = {
        idToken: 'mock-jwt-token-' + Date.now(),
        user: {
          email,
          userId: 'user-' + Math.random().toString(36).substr(2, 9),
          tenantId: 'a4060f2d-096d-4d18-9bfc-fad512f6706d', // Mock tenant ID
          role: 'analyst',
          name: email.split('@')[0],
        },
      };
      
      // Store in state and localStorage
      setUser(mockResponse.user);
      setIdToken(mockResponse.idToken);
      localStorage.setItem('idToken', mockResponse.idToken);
      localStorage.setItem('user', JSON.stringify(mockResponse.user));
      
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Failed to login. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      
      // Clear state
      setUser(null);
      setIdToken(null);
      
      // Clear localStorage
      localStorage.removeItem('idToken');
      localStorage.removeItem('user');
      localStorage.removeItem('chatSessions');
      
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshToken = async () => {
    try {
      // In production, this would refresh the Cognito token
      // For now, just check if token is still valid
      await checkAuthState();
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  };

  const getIdToken = () => {
    return idToken;
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshToken,
    getIdToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Protected Route Component
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <LoginPage />;
  }
  
  return <>{children}</>;
};

// Simple Login Page Component
const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuth();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">SuccessPro AI</h1>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder="user@company.com"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
              placeholder="••••••••"
            />
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Demo Mode: Use any email/password to login</p>
        </div>
      </div>
    </div>
  );
};