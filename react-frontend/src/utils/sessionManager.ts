/**
 * Session Manager for SuccessPro
 * Handles session lifecycle and prevents cache persistence issues
 */

export class SessionManager {
  private static instance: SessionManager;
  private sessionStartTime: Date;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes

  private constructor() {
    this.sessionStartTime = new Date();
    this.initializeSession();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Initialize a new session
   */
  private initializeSession(): void {
    // Clear any existing session data
    this.clearSessionData();
    
    // Set up session timeout
    this.setupSessionTimeout();
    
    // Mark session as active
    sessionStorage.setItem('session_active', 'true');
    sessionStorage.setItem('session_start', this.sessionStartTime.toISOString());
  }

  /**
   * Clear all session-related data
   */
  clearSessionData(): void {
    // Clear session storage
    const keysToKeep = ['tenant_id', 'user_id', 'user_role']; // Keep auth data
    const sessionKeys = Object.keys(sessionStorage);
    
    sessionKeys.forEach(key => {
      if (!keysToKeep.includes(key)) {
        sessionStorage.removeItem(key);
      }
    });

    // Clear conversation-specific localStorage items
    const conversationKeys = ['session_id', 'last_query', 'last_response'];
    conversationKeys.forEach(key => {
      localStorage.removeItem(key);
    });
  }

  /**
   * Set up automatic session timeout
   */
  private setupSessionTimeout(): void {
    // Clear any existing timeout
    const existingTimeout = sessionStorage.getItem('timeout_id');
    if (existingTimeout) {
      clearTimeout(parseInt(existingTimeout));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      this.handleSessionTimeout();
    }, this.sessionTimeout);

    sessionStorage.setItem('timeout_id', timeoutId.toString());
  }

  /**
   * Handle session timeout
   */
  private handleSessionTimeout(): void {
    console.log('Session timed out');
    this.clearSessionData();
    
    // Optionally show notification to user
    if (window.confirm('Your session has expired. Would you like to start a new session?')) {
      this.startNewSession();
    }
  }

  /**
   * Start a new session
   */
  startNewSession(): void {
    this.sessionStartTime = new Date();
    this.initializeSession();
    
    // Trigger UI refresh
    window.dispatchEvent(new Event('sessionReset'));
  }

  /**
   * Extend current session
   */
  extendSession(): void {
    this.setupSessionTimeout();
    sessionStorage.setItem('session_last_activity', new Date().toISOString());
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    const sessionActive = sessionStorage.getItem('session_active');
    const sessionStart = sessionStorage.getItem('session_start');
    
    if (!sessionActive || !sessionStart) {
      return false;
    }

    const startTime = new Date(sessionStart);
    const now = new Date();
    const elapsed = now.getTime() - startTime.getTime();
    
    return elapsed < this.sessionTimeout;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return sessionStorage.getItem('session_id');
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    sessionStorage.setItem('session_id', sessionId);
  }
}

export default SessionManager.getInstance();