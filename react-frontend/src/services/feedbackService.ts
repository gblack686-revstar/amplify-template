/**
 * Feedback Service
 * Handles user feedback (thumbs up/down) for AI responses
 */

interface FeedbackRequest {
  messageId: string;
  sessionId: string;
  feedbackType: 'positive' | 'negative';
  comment?: string;
  objectType?: 'chat_message' | 'recommendation' | 'roadmap_item';
}

interface FeedbackResponse {
  feedbackId: string;
  messageId: string;
  feedbackType: string;
  timestamp: string;
  message?: string;
}

class FeedbackService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.REACT_APP_API_URL || '';
  }

  /**
   * Submit feedback for a message
   */
  async submitFeedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User ID not found');
      }

      const response = await fetch(`${this.apiUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          ...request,
          userId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit feedback');
      }

      return await response.json();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  /**
   * Get feedback for a specific message
   */
  async getFeedback(messageId: string): Promise<FeedbackResponse | null> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/feedback/${messageId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error('Failed to get feedback');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting feedback:', error);
      return null;
    }
  }

  /**
   * Update existing feedback
   */
  async updateFeedback(
    messageId: string,
    feedbackType: 'positive' | 'negative',
    comment?: string
  ): Promise<FeedbackResponse> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/feedback/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          feedbackType,
          comment
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update feedback');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating feedback:', error);
      throw error;
    }
  }

  /**
   * Delete feedback for a message
   */
  async deleteFeedback(messageId: string): Promise<void> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/feedback/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete feedback');
      }
    } catch (error) {
      console.error('Error deleting feedback:', error);
      throw error;
    }
  }
}

export default new FeedbackService();
export type { FeedbackRequest, FeedbackResponse };
