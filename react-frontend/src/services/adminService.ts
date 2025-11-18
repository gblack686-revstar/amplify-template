// Admin Service - API calls for admin dashboard analytics

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  userName?: string;
  activityType: 'user_signup' | 'onboarding_complete' | 'document_upload' | 'chat_session_start' |
                'recommendation_approved' | 'recommendation_dismissed' | 'goal_added' | 'goal_completed' |
                'goal_generated' | 'goal_removed' | 'feedback_positive' | 'feedback_negative' |
                'mfa_enabled' | 'mfa_disabled';
  description: string;
  metadata?: Record<string, any>;
}

export interface AdminAnalytics {
  timestamp: string;
  time_filter_hours?: number | null;
  families: {
    total: number;
    with_documents: number;
  };
  children: {
    total: number;
    average_per_family: number;
  };
  documents: {
    total: number;
    by_type: Record<string, number>;
    average_per_family: number;
    families_with_docs: number;
  };
  conversations: {
    total_queries: number;
    unique_sessions: number;
    period_days: number;
  };
  feedback: {
    total_feedback: number;
    positive_count: number;
    negative_count: number;
    positive_percentage: number;
    negative_percentage: number;
    meets_80_percent_target: boolean;
  };
  onboarding: {
    total_completed: number;
  };
  time_to_first_win?: {
    average_hours: number;
    average_days: number;
    sample_size: number;
  };
  engagement_retention?: {
    total_active_users: number;
    returning_users: number;
    retention_rate: number;
    avg_sessions_per_user: number;
  };
  roadmap?: {
    total_items_created: number;
    total_items_completed: number;
    completion_rate: number;
    avg_recommendations_per_user: number;
    by_category: Record<string, number>;
    completions_by_category: Record<string, number>;
    note?: string;
  };
  weekly_active_families?: {
    total_families: number;
    active_families_last_7_days: number;
    active_percentage: number;
    inactive_families: number;
  };
}

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com';

export class AdminService {
  private static getHeaders(): HeadersInit {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  /**
   * Check if current user has admin role
   */
  static isAdmin(): boolean {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return false;

      // Decode JWT token (simple base64 decode of payload)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const groups = payload['cognito:groups'] || [];

      return groups.includes('admins');
    } catch (error) {
      console.error('Error checking admin role:', error);
      return false;
    }
  }

  /**
   * Get analytics data for admin dashboard
   */
  static async getAnalytics(userId?: string): Promise<AdminAnalytics> {
    try {
      const url = userId
        ? `${API_BASE_URL}/admin/analytics?userId=${encodeURIComponent(userId)}`
        : `${API_BASE_URL}/admin/analytics`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error fetching admin analytics:', error);
      throw error;
    }
  }

  /**
   * Get activity log with optional user filter
   */
  static async getActivityLog(limit: number = 50, userId?: string): Promise<ActivityLogEntry[]> {
    try {
      let url = `${API_BASE_URL}/admin/activity-log?limit=${limit}`;
      if (userId) {
        url += `&userId=${encodeURIComponent(userId)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error(`Failed to fetch activity log: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error fetching activity log:', error);

      // Return mock data for development/testing if backend not available
      if (error.message?.includes('Failed to fetch')) {
        return this.getMockActivityLog(limit, userId);
      }

      throw error;
    }
  }

  /**
   * Get list of all users for filter dropdown
   */
  static async getUsers(): Promise<Array<{userId: string, email: string, name?: string}>> {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error fetching users:', error);

      // Return mock data for development
      return this.getMockUsers();
    }
  }

  /**
   * Mock activity log data for development/testing
   */
  private static getMockActivityLog(limit: number, userId?: string): ActivityLogEntry[] {
    const now = new Date();
    const mockEntries: ActivityLogEntry[] = [
      {
        id: '1',
        timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
        userId: 'testuser@example.com',
        userEmail: 'testuser@example.com',
        userName: 'Sarah Johnson',
        activityType: 'document_upload',
        description: 'Uploaded document: IEP_2024.pdf',
        metadata: { fileName: 'IEP_2024.pdf', fileSize: 245760 }
      },
      {
        id: '2',
        timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        userId: 'testuser@example.com',
        userEmail: 'testuser@example.com',
        userName: 'Sarah Johnson',
        activityType: 'chat_session_start',
        description: 'Started new chat session',
        metadata: { sessionId: 'session-123' }
      },
      {
        id: '3',
        timestamp: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
        userId: 'parent2@example.com',
        userEmail: 'parent2@example.com',
        userName: 'Michael Chen',
        activityType: 'recommendation_approved',
        description: 'Approved recommendation: "Implement visual schedule"',
        metadata: { recommendationId: 'rec-456' }
      },
      {
        id: '4',
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        userId: 'parent2@example.com',
        userEmail: 'parent2@example.com',
        userName: 'Michael Chen',
        activityType: 'feedback_positive',
        description: 'Gave positive feedback on chat response',
        metadata: { messageId: 'msg-789' }
      },
      {
        id: '5',
        timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        userId: 'parent3@example.com',
        userEmail: 'parent3@example.com',
        userName: 'Emily Rodriguez',
        activityType: 'onboarding_complete',
        description: 'Completed onboarding flow',
        metadata: {}
      },
      {
        id: '6',
        timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        userId: 'parent3@example.com',
        userEmail: 'parent3@example.com',
        userName: 'Emily Rodriguez',
        activityType: 'user_signup',
        description: 'New user signup',
        metadata: {}
      },
      {
        id: '7',
        timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
        userId: 'testuser@example.com',
        userEmail: 'testuser@example.com',
        userName: 'Sarah Johnson',
        activityType: 'goal_added',
        description: 'Added goal to roadmap: "Practice social greetings"',
        metadata: { goalId: 'goal-321' }
      },
      {
        id: '8',
        timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        userId: 'parent2@example.com',
        userEmail: 'parent2@example.com',
        userName: 'Michael Chen',
        activityType: 'document_upload',
        description: 'Uploaded document: Therapy_Report_March.pdf',
        metadata: { fileName: 'Therapy_Report_March.pdf' }
      }
    ];

    // Filter by user if specified
    let filtered = userId
      ? mockEntries.filter(entry => entry.userId === userId)
      : mockEntries;

    return filtered.slice(0, limit);
  }

  /**
   * Delete a user and all their data (GDPR/CCPA compliance)
   */
  static async deleteUser(email: string): Promise<{message: string, report: any}> {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/delete-user`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({
          email: email,
          confirm: true
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Unauthorized: Admin access required');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete user: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Mock users data for development
   */
  private static getMockUsers(): Array<{userId: string, email: string, name?: string}> {
    return [
      { userId: 'testuser@example.com', email: 'testuser@example.com', name: 'Sarah Johnson' },
      { userId: 'parent2@example.com', email: 'parent2@example.com', name: 'Michael Chen' },
      { userId: 'parent3@example.com', email: 'parent3@example.com', name: 'Emily Rodriguez' }
    ];
  }
}

export default AdminService;
