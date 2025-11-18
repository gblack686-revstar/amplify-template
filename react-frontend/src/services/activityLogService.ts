// Activity Log Service - Log user activities to backend

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com';

export type ActivityType =
  | 'goal_completed'
  | 'goal_added'
  | 'goal_removed'
  | 'mfa_enabled'
  | 'mfa_disabled';

interface ActivityLogRequest {
  activityType: ActivityType;
  metadata?: Record<string, any>;
}

export class ActivityLogService {
  private static getHeaders(): HeadersInit {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  /**
   * Log a user activity
   */
  static async logActivity(activityType: ActivityType, metadata: Record<string, any> = {}): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/activity-log`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          activityType,
          metadata
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to log activity: ${response.statusText}`);
      }

      console.log(`Activity logged: ${activityType}`, metadata);
    } catch (error: any) {
      // Don't fail the operation if logging fails
      console.error('Error logging activity:', error);
    }
  }

  /**
   * Log goal completion
   */
  static async logGoalCompleted(goalTitle: string, category?: string): Promise<void> {
    return this.logActivity('goal_completed', {
      goalTitle,
      category
    });
  }

  /**
   * Log goal added to roadmap
   */
  static async logGoalAdded(goalTitle: string, category?: string, source?: string): Promise<void> {
    return this.logActivity('goal_added', {
      goalTitle,
      category,
      source: source || 'manual'
    });
  }

  /**
   * Log goal removed from roadmap
   */
  static async logGoalRemoved(goalTitle: string): Promise<void> {
    return this.logActivity('goal_removed', {
      goalTitle
    });
  }

  /**
   * Log MFA enabled
   */
  static async logMFAEnabled(): Promise<void> {
    return this.logActivity('mfa_enabled', {});
  }

  /**
   * Log MFA disabled
   */
  static async logMFADisabled(): Promise<void> {
    return this.logActivity('mfa_disabled', {});
  }
}

export default ActivityLogService;
