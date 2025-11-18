// Mock Authentication Service for Template
// Replace with your actual authentication service

interface MockAuthResult {
  success: boolean;
  idToken?: string;
  error?: string;
}

class MockAuthService {
  private isAuthenticated = false;

  async signIn(username: string, password: string): Promise<MockAuthResult> {
    // Simple mock authentication - replace with your actual auth logic
    if (username === 'testuser' && password === 'demo123') {
      this.isAuthenticated = true;
      // Generate a mock JWT token
      const mockToken = 'mock-jwt-token-' + Date.now();
      return {
        success: true,
        idToken: mockToken
      };
    }
    
    return {
      success: false,
      error: 'Invalid credentials. Use testuser/demo123'
    };
  }

  signOut(): void {
    this.isAuthenticated = false;
  }

  isSignedIn(): boolean {
    return this.isAuthenticated;
  }

  getCurrentUser() {
    if (this.isAuthenticated) {
      return {
        username: 'testuser',
        email: 'testuser@example.com'
      };
    }
    return null;
  }
}

export default new MockAuthService();