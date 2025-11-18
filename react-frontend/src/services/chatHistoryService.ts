import { Session } from '../types';
import { config } from '../config/env';

class ChatHistoryService {
  private apiUrl: string;
  private localStorageKey: string = 'chat-sessions';

  constructor() {
    this.apiUrl = config.apiUrl;
  }

  /**
   * Get all chat sessions for the current user
   */
  async getSessions(): Promise<Session[]> {
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        return [];
      }

      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        console.warn('No auth token found, returning empty sessions');
        return [];
      }

      const response = await fetch(`${this.apiUrl}chat/sessions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch chat sessions:', response.status);
        // Fallback to localStorage if API fails
        const savedSessions = localStorage.getItem(`${this.localStorageKey}-${userId}`);
        if (savedSessions) {
          return JSON.parse(savedSessions);
        }
        return [];
      }

      const sessions = await response.json();

      // Map backend format (sessionId) to frontend format (id)
      return sessions.map((session: any) => ({
        id: session.sessionId,
        title: session.title,
        messages: session.messages || [],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      // Fallback to localStorage
      const userId = localStorage.getItem('user_id');
      if (userId) {
        const savedSessions = localStorage.getItem(`${this.localStorageKey}-${userId}`);
        if (savedSessions) {
          return JSON.parse(savedSessions);
        }
      }
      return [];
    }
  }

  /**
   * Update specific fields of a session (partial update)
   * This prevents race conditions by only sending the fields that changed
   */
  async updateSessionFields(sessionId: string, updates: Partial<Pick<Session, 'title' | 'messages'>>): Promise<void> {
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('No auth token found');
      }

      // Only send the fields that are being updated
      const backendUpdates: any = {};
      if (updates.title !== undefined) {
        backendUpdates.title = updates.title;
      }
      if (updates.messages !== undefined) {
        backendUpdates.messages = updates.messages;
      }

      const response = await fetch(`${this.apiUrl}chat/sessions/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        },
        body: JSON.stringify(backendUpdates)
      });

      if (!response.ok) {
        console.error('Failed to update chat session via API:', response.status);
        throw new Error(`Failed to update session: ${response.status}`);
      }

      // Update ONLY the changed fields in localStorage to avoid race conditions
      // Do NOT refetch from backend as it might return stale data
      const savedSessions = localStorage.getItem(`${this.localStorageKey}-${userId}`);
      if (savedSessions) {
        const sessions: Session[] = JSON.parse(savedSessions);
        const existingIndex = sessions.findIndex(s => s.id === sessionId);

        if (existingIndex >= 0) {
          // Only update the specific fields that changed, don't replace entire session
          if (updates.title !== undefined) {
            sessions[existingIndex].title = updates.title;
          }
          if (updates.messages !== undefined) {
            sessions[existingIndex].messages = updates.messages;
          }
          sessions[existingIndex].updatedAt = new Date().toISOString();

          localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(sessions));
        }
      }
    } catch (error) {
      console.error('Error updating chat session fields:', error);
      throw error;
    }
  }

  /**
   * Save a single session (full update)
   */
  async saveSession(session: Session): Promise<void> {
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('No auth token found');
      }

      // Map frontend format (id) to backend format (sessionId)
      const backendSession = {
        sessionId: session.id,
        title: session.title,
        messages: session.messages,
        createdAt: session.createdAt,
        updatedAt: new Date().toISOString()
      };

      const response = await fetch(`${this.apiUrl}chat/sessions/${session.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        },
        body: JSON.stringify(backendSession)
      });

      if (!response.ok) {
        console.error('Failed to save chat session via API:', response.status);
        // Fallback to localStorage
        const sessions = await this.getSessions();
        const existingIndex = sessions.findIndex(s => s.id === session.id);

        if (existingIndex >= 0) {
          sessions[existingIndex] = { ...session, updatedAt: new Date().toISOString() };
        } else {
          sessions.unshift({ ...session, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }

        localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(sessions));
        return;
      }

      // Also save to localStorage as backup
      const sessions = await this.getSessions();
      const existingIndex = sessions.findIndex(s => s.id === session.id);

      if (existingIndex >= 0) {
        sessions[existingIndex] = { ...session, updatedAt: new Date().toISOString() };
      } else {
        sessions.unshift({ ...session, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }

      localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving chat session:', error);
      throw error;
    }
  }

  /**
   * Save multiple sessions (batch update)
   */
  async saveSessions(sessions: Session[]): Promise<void> {
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Save each session individually to the backend
      // Note: We save all sessions to ensure consistency, but this could be optimized
      // to only save sessions that have changed
      const savePromises = sessions.map(session => this.saveSession(session));
      await Promise.all(savePromises);

      // Also save to localStorage as backup
      localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving chat sessions:', error);
      // Don't throw - allow localStorage backup to work even if API fails
      // throw error;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('No auth token found');
      }

      const response = await fetch(`${this.apiUrl}chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        }
      });

      if (!response.ok) {
        console.error('Failed to delete session via API:', response.status);
      }

      // Always delete from localStorage as well
      const sessions = await this.getSessions();
      const updatedSessions = sessions.filter(s => s.id !== sessionId);
      localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(updatedSessions));
    } catch (error) {
      console.error('Error deleting chat session:', error);
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async createSession(title: string = 'New Chat'): Promise<Session> {
    const userId = localStorage.getItem('user_id');
    const authToken = localStorage.getItem('auth_token');

    // Try to create on backend first if we have auth
    if (authToken && userId) {
      try {
        const response = await fetch(`${this.apiUrl}chat/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken
          },
          body: JSON.stringify({ title })
        });

        if (response.ok) {
          const createdSession = await response.json();
          // Map backend format to frontend format
          const newSession: Session = {
            id: createdSession.sessionId,
            title: createdSession.title,
            messages: createdSession.messages || [],
            createdAt: createdSession.createdAt,
            updatedAt: createdSession.updatedAt
          };

          // Save to localStorage as backup
          const savedSessions = localStorage.getItem(`${this.localStorageKey}-${userId}`);
          const existingSessions = savedSessions ? JSON.parse(savedSessions) : [];
          existingSessions.unshift(newSession);
          localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(existingSessions));

          return newSession;
        }
      } catch (error) {
        console.error('Error creating session on backend:', error);
      }
    }

    // Fallback: create local session if backend fails or no auth
    const newSession: Session = {
      id: Date.now().toString(),
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (userId) {
      const savedSessions = localStorage.getItem(`${this.localStorageKey}-${userId}`);
      const existingSessions = savedSessions ? JSON.parse(savedSessions) : [];
      existingSessions.unshift(newSession);
      localStorage.setItem(`${this.localStorageKey}-${userId}`, JSON.stringify(existingSessions));
    }

    return newSession;
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const sessions = await this.getSessions();
      return sessions.find(s => s.id === sessionId) || null;
    } catch (error) {
      console.error('Error getting chat session:', error);
      return null;
    }
  }

  /**
   * Clear all sessions (useful for logout)
   */
  clearLocalSessions(): void {
    const userId = localStorage.getItem('user_id');
    if (userId) {
      localStorage.removeItem(`${this.localStorageKey}-${userId}`);
    }
  }
}

export default new ChatHistoryService();
