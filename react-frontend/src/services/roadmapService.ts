interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  category: 'therapy' | 'education' | 'daily_skills' | 'social' | 'communication' | 'behavioral';
  status: 'not_started' | 'in_progress' | 'completed';
  dueDate?: string;
  notes?: string[];
  createdAt?: string;
  updatedAt?: string;
  thumbsUpGiven?: boolean;
}

interface Roadmap {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  items: RoadmapItem[];
  createdAt: string;
  updatedAt: string;
}

class RoadmapService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.REACT_APP_API_URL || '';
  }

  /**
   * Get the current active roadmap for the user
   */
  async getCurrentRoadmap(): Promise<Roadmap | null> {
    try {
      const authToken = localStorage.getItem('auth_token');
      const userId = localStorage.getItem('user_id');

      if (!authToken || !userId) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/roadmap`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No items exist yet, return empty roadmap
          return {
            id: 'roadmap-current',
            userId: userId,
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            items: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        throw new Error('Failed to fetch roadmap');
      }

      const data = await response.json();

      // Transform backend response to frontend format
      const roadmap: Roadmap = {
        id: 'roadmap-current',
        userId: userId,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: (data.items || []).map((item: any) => ({
          id: item.itemId,
          title: item.title,
          description: item.description || '',
          category: item.category || 'daily_skills',
          status: item.status || 'not_started',
          dueDate: item.dueDate,
          notes: item.notes || [],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          thumbsUpGiven: item.thumbsUpGiven || false,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return roadmap;
    } catch (error) {
      console.error('Error fetching roadmap:', error);
      throw error;
    }
  }

  /**
   * Create a new roadmap for the user
   */
  async createRoadmap(items: Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Roadmap> {
    try {
      const authToken = localStorage.getItem('auth_token');
      const userId = localStorage.getItem('user_id');

      if (!authToken || !userId) {
        throw new Error('Not authenticated');
      }

      // Create each item individually
      const createdItems: RoadmapItem[] = [];
      for (const item of items) {
        const createdItem = await this.addRoadmapItem('roadmap-current', item);
        createdItems.push(createdItem);
      }

      // Return roadmap with all created items
      return {
        id: 'roadmap-current',
        userId: userId,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: createdItems,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error creating roadmap:', error);
      throw error;
    }
  }

  /**
   * Update an existing roadmap item
   */
  async updateRoadmapItem(
    roadmapId: string,
    itemId: string,
    updates: Partial<RoadmapItem>
  ): Promise<RoadmapItem> {
    try {
      const authToken = localStorage.getItem('auth_token');

      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/roadmap/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update roadmap item');
      }

      const data = await response.json();
      const item = data.item;

      return {
        id: item.itemId,
        title: item.title,
        description: item.description || '',
        category: item.category || 'daily_skills',
        status: item.status || 'not_started',
        dueDate: item.dueDate,
        notes: item.notes || [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        thumbsUpGiven: item.thumbsUpGiven || false,
      };
    } catch (error) {
      console.error('Error updating roadmap item:', error);
      throw error;
    }
  }

  /**
   * Add a new item to the current roadmap
   */
  async addRoadmapItem(
    roadmapId: string,
    item: Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RoadmapItem> {
    try {
      const authToken = localStorage.getItem('auth_token');

      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/roadmap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(item)
      });

      if (!response.ok) {
        throw new Error('Failed to add roadmap item');
      }

      const data = await response.json();
      const createdItem = data.item;

      return {
        id: createdItem.itemId,
        title: createdItem.title,
        description: createdItem.description || '',
        category: createdItem.category || 'daily_skills',
        status: createdItem.status || 'not_started',
        dueDate: createdItem.dueDate,
        notes: createdItem.notes || [],
        createdAt: createdItem.createdAt,
        updatedAt: createdItem.updatedAt,
        thumbsUpGiven: createdItem.thumbsUpGiven || false,
      };
    } catch (error) {
      console.error('Error adding roadmap item:', error);
      throw error;
    }
  }

  /**
   * Delete a roadmap item
   */
  async deleteRoadmapItem(roadmapId: string, itemId: string): Promise<void> {
    try {
      const authToken = localStorage.getItem('auth_token');

      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/roadmap/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete roadmap item');
      }
    } catch (error) {
      console.error('Error deleting roadmap item:', error);
      throw error;
    }
  }

  /**
   * Generate a single quick win recommendation based on profile
   */
  async generateQuickWin(profileData: any): Promise<Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'thumbsUpGiven'>> {
    try {
      const authToken = localStorage.getItem('auth_token');

      if (!authToken) {
        throw new Error('Not authenticated');
      }

      // Build comprehensive message from profile data
      const child = profileData.children?.[0] || {};
      const childName = child.name || 'your child';
      const age = child.age || '';
      const severity = child.autism_severity || '';
      const verbalStatus = child.verbal_status || '';
      const favoriteActivities = child.favorite_activities || [];
      const triggers = child.triggers || [];
      const currentTherapies = child.current_therapies || [];

      // Combine standard challenges with custom "other" text
      const challenges = profileData.biggest_challenges || [];
      const otherChallenges = profileData.other_challenge_texts || [];
      const allChallenges = [...challenges, ...otherChallenges].filter(Boolean);

      // Combine standard outcomes with custom "other" text
      const outcomes = profileData.desired_outcomes || [];
      const otherOutcomes = profileData.other_outcome_texts || [];
      const allOutcomes = [...outcomes, ...otherOutcomes].filter(Boolean);

      // Family context
      const maritalStatus = profileData.marital_status || '';
      const location = profileData.location || '';
      const supportSystems = profileData.support_system_type || [];

      // Build detailed prompt
      let message = `Generate a quick win recommendation for ${childName}, age ${age}, with ${severity} autism.`;

      if (verbalStatus) {
        message += ` Verbal status: ${verbalStatus}.`;
      }

      if (allChallenges.length > 0) {
        message += ` Challenges: ${allChallenges.join(', ')}.`;
      }

      if (allOutcomes.length > 0) {
        message += ` Goals: ${allOutcomes.join(', ')}.`;
      }

      if (favoriteActivities.length > 0) {
        message += ` Favorite activities: ${favoriteActivities.join(', ')}.`;
      }

      if (triggers.length > 0) {
        message += ` Known triggers: ${triggers.join(', ')}.`;
      }

      if (currentTherapies.length > 0) {
        const therapyList = currentTherapies.map((t: any) => t.type).join(', ');
        message += ` Current therapies: ${therapyList}.`;
      }

      if (supportSystems.length > 0) {
        message += ` Available support: ${supportSystems.join(', ')}.`;
      }

      if (maritalStatus) {
        message += ` Family structure: ${maritalStatus}.`;
      }

      // Call roadmap-transform endpoint
      const response = await fetch(`${this.apiUrl}roadmap-transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          message,
          mode: 'generate',
          existingRecommendations: [],
          source: 'quick_win'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate quick win recommendation');
      }

      const data = await response.json();
      const roadmapItem = data.roadmapItem || data;

      return {
        title: roadmapItem.title,
        description: roadmapItem.description,
        category: roadmapItem.category || 'daily_skills',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: []
      };
    } catch (error) {
      console.error('Error generating quick win:', error);
      throw error;
    }
  }

  /**
   * Generate a new roadmap using AI based on user profile and chat history
   */
  async generateRoadmap(): Promise<Roadmap> {
    try {
      const authToken = localStorage.getItem('auth_token');
      const userId = localStorage.getItem('user_id');

      if (!authToken || !userId) {
        throw new Error('Not authenticated');
      }

      // TODO: Call AI endpoint to generate roadmap
      // For now, return sample generated roadmap
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 90);

      const mockItems: Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
        {
          title: 'Establish consistent bedtime routine',
          description: 'Work on improving sleep schedule with visual timer and calming activities',
          category: 'daily_skills',
          status: 'not_started',
          dueDate: new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          notes: [
            'Start with 30 minutes before bed',
            'Use visual schedule',
            'Track progress in sleep diary',
          ],
        },
        {
          title: 'Practice requesting help appropriately',
          description: 'Teach and reinforce using "help please" in various situations',
          category: 'communication',
          status: 'not_started',
          dueDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          notes: ['Use visual cue card', 'Reward successful attempts', 'Practice in multiple settings'],
        },
        {
          title: 'Arrange playdate with peer',
          description: 'Set up structured playdate to work on social interaction skills',
          category: 'social',
          status: 'not_started',
          dueDate: new Date(startDate.getTime() + 21 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          notes: [
            'Choose familiar peer',
            'Plan structured activities',
            'Keep initial playdate short (30-45 mins)',
          ],
        },
      ];

      return await this.createRoadmap(mockItems);
    } catch (error) {
      console.error('Error generating roadmap:', error);
      throw error;
    }
  }
}

export default new RoadmapService();
export type { Roadmap, RoadmapItem };
