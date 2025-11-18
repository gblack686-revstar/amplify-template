/**
 * API Service for SuccessPro Chatbot
 * Connects frontend to AWS API Gateway/Lambda backend
 */

import { config } from '../config/env';

export interface ChatRequest {
  query: string;
  user_context: {
    tenant_id: string;
    user_id?: string;
    session_id?: string;
    user_role?: string;
  };
}

export interface ChatResponse {
  success: boolean;
  request_id: string;
  answer: string;
  data_summary?: {
    rows_returned: number;
    execution_time_ms: number;
  };
  follow_up_suggestions?: string[];
  session_id?: string;
  processing_time_ms?: number;
  from_cache?: boolean;
  error?: string;
  generated_sql?: string;
  raw_data?: any[];
  // Legacy fields for backward compatibility
  response?: string;
  sql_query?: string;
  source?: string;
  confidence?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database?: 'healthy' | 'unhealthy';
    dynamodb?: 'healthy' | 'unhealthy';
    bedrock?: 'healthy' | 'unhealthy';
  };
  error?: string;
}

export interface TenantResponse {
  tenants: string[];
  count: number;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    // Use environment variable for API Gateway endpoint
    // Format: https://xxxxx.execute-api.region.amazonaws.com/prod
    this.baseUrl = config.apiUrl;

    // Note: For local development, you can use SAM local or direct Lambda invoke
    // For production, this should point to your API Gateway endpoint
  }

  /**
   * Send chat message to backend
   */
  async sendChatMessage(query: string, tenantId?: string, sessionId?: string): Promise<ChatResponse> {
    try {
      // Get user context from localStorage or auth provider
      const userContext = {
        tenant_id: tenantId || localStorage.getItem('tenant_id') || 'default-tenant',
        user_id: localStorage.getItem('user_id') || 'anonymous',
        session_id: sessionId || sessionStorage.getItem('session_id') || this.generateSessionId(),
        user_role: localStorage.getItem('user_role') || 'viewer'
      };

      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add Authorization header if using Cognito
          ...(localStorage.getItem('auth_token') && {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          })
        },
        body: JSON.stringify({
          query,
          user_context: userContext
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Use sessionStorage instead of localStorage for session data
      // This ensures sessions are cleared when browser is closed
      if (data.session_id) {
        sessionStorage.setItem('session_id', data.session_id);
      }

      // Map new response format to include legacy fields
      return {
        ...data,
        // Map new fields to legacy format for backward compatibility
        response: data.answer,
        sql_query: data.generated_sql,
        data: {
          tenant_id: userContext.tenant_id,
          query: query,
          row_count: data.data_summary?.rows_returned
        }
      };
    } catch (error) {
      console.error('API Error:', error);
      throw error instanceof Error ? error : new Error('Failed to send message to backend');
    }
  }

  /**
   * Get health status of backend
   */
  async getHealth(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Health Check Error:', error);
      // Return unhealthy status on error
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: 'unknown',
        checks: {},
        error: error instanceof Error ? error.message : 'Backend health check failed'
      };
    }
  }

  /**
   * Get available tenants
   */
  async getTenants(): Promise<TenantResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tenants`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Tenants Error:', error);
      throw new Error('Failed to fetch tenants');
    }
  }

  /**
   * Get sample queries for testing
   */
  async getSampleQueries(): Promise<{ queries: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sample-queries`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Sample Queries Error:', error);
      throw new Error('Failed to fetch sample queries');
    }
  }

  /**
   * Test backend connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.status === 'healthy';
    } catch (error) {
      console.error('Connection Test Error:', error);
      return false;
    }
  }

  /**
   * Generate a new session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear session data
   */
  clearSession(): void {
    localStorage.removeItem('session_id');
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_role');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('user_display_name');
    this.clearSession();
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService; 