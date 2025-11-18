import React, { useState, useEffect } from 'react';
import { Target, Calendar, Check, ChevronRight, Sparkles, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import RoadmapService, { Roadmap as RoadmapData, RoadmapItem } from '../services/roadmapService';
import FeedbackService from '../services/feedbackService';
import { formatLabel } from '../utils/labelMappings';

interface RoadmapProps {
  onClose: () => void;
  onOpenChat: () => void;
}

const Roadmap: React.FC<RoadmapProps> = ({ onClose, onOpenChat }) => {
  const { isDarkMode } = useTheme();
  const { getChildName, profile, loading: profileLoading, refreshProfile } = useProfile();
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generatingRecommendations, setGeneratingRecommendations] = useState<boolean>(false);
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [generatingCustom, setGeneratingCustom] = useState<boolean>(false);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);

  // Refresh profile on mount to ensure goals/challenges are loaded
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRoadmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track when profile with goals/challenges data becomes available
  useEffect(() => {
    console.log('[ROADMAP DEBUG] Profile state changed:', {
      profileExists: !!profile,
      profileLoading,
      profile: profile,
      hasChallenges: profile?.biggest_challenges && profile.biggest_challenges.length > 0,
      hasOutcomes: profile?.desired_outcomes && profile.desired_outcomes.length > 0,
      challenges: profile?.biggest_challenges,
      outcomes: profile?.desired_outcomes
    });

    const hasChallenges = profile?.biggest_challenges && profile.biggest_challenges.length > 0;
    const hasOutcomes = profile?.desired_outcomes && profile.desired_outcomes.length > 0;

    if ((hasChallenges || hasOutcomes) && !profileLoaded) {
      console.log('[ROADMAP] Profile with goals/challenges loaded, triggering re-render', {
        hasChallenges,
        hasOutcomes,
        challenges: profile?.biggest_challenges,
        outcomes: profile?.desired_outcomes
      });
      setProfileLoaded(true);
    }
  }, [profile, profileLoaded, profileLoading]);

  const loadRoadmap = async () => {
    console.log(`[LOAD ROADMAP] Starting loadRoadmap, generatingRecommendations state: ${generatingRecommendations}`);
    setLoading(true);
    setError(null);
    try {
      const fetchedRoadmap = await RoadmapService.getCurrentRoadmap();

      if (fetchedRoadmap) {
        setRoadmap(fetchedRoadmap);

        // Sort items: active on top, completed on bottom
        const sortedItems = [...fetchedRoadmap.items].sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1;
          if (a.status !== 'completed' && b.status === 'completed') return -1;
          // Within same status group, sort by creation date (newest first)
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        setRoadmapItems(sortedItems);

        // Calculate period and days remaining
        const endDate = new Date(fetchedRoadmap.endDate);
        const startDate = new Date(fetchedRoadmap.startDate);
        const today = new Date();
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        setDaysRemaining(Math.max(0, diffDays));
        setCurrentPeriod(
          `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
        );

        // Auto-generate if less than 3 unfinished recommendations
        const unfinishedCount = sortedItems.filter(item => item.status !== 'completed').length;

        console.log(`[ROADMAP AUTO-GEN CHECK] Total items: ${sortedItems.length}, Unfinished: ${unfinishedCount}, Currently generating: ${generatingRecommendations}`);

        // NOTE: Starter recommendations are now created during onboarding, so we no longer
        // need to create them here for new users with 0 items

        // Only auto-generate if user has < 3 unfinished items AND at least 1 unfinished item exists
        // (Don't auto-gen when everything is completed - user needs to manually request more)
        if (unfinishedCount > 0 && unfinishedCount < 3 && !generatingRecommendations) {
          console.log(`[AUTO-GEN] ✓ Triggering generateRecommendations (unfinished count: ${unfinishedCount} < 3)`);
          setTimeout(() => generateRecommendations(), 500);
        } else if (unfinishedCount < 3 && unfinishedCount > 0 && generatingRecommendations) {
          console.log(`[AUTO-GEN] ✗ BLOCKED - Would trigger auto-gen but generatingRecommendations is TRUE`);
        } else {
          console.log(`[AUTO-GEN] ℹ No trigger needed (unfinished: ${unfinishedCount}, total: ${sortedItems.length})`);
        }
      }
    } catch (error) {
      console.error('Error loading roadmap:', error);
      setError('Failed to load roadmap. Please try again.');
    } finally {
      setLoading(false);
    }
  }; // Removed useCallback to avoid stale closure issues with generateRecommendations

  const getCategoryColor = (category: string) => {
    const colors = {
      therapy: isDarkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800',
      education: isDarkMode ? 'bg-purple-900/50 text-purple-200' : 'bg-purple-100 text-purple-800',
      daily_skills: isDarkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-800',
      social: isDarkMode ? 'bg-pink-900/50 text-pink-200' : 'bg-pink-100 text-pink-800',
      communication: isDarkMode ? 'bg-yellow-900/50 text-yellow-200' : 'bg-yellow-100 text-yellow-800',
      behavioral: isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-100 text-red-800',
    };
    return colors[category as keyof typeof colors] || colors.therapy;
  };

  const getCategoryLabel = (category: string) => {
    return category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') {
      return <Check className="w-5 h-5 text-green-500" />;
    }
    return <div className={`w-5 h-5 rounded-full border-2 ${
      status === 'in_progress'
        ? 'border-blue-500 bg-blue-500/20'
        : isDarkMode ? 'border-gray-600' : 'border-gray-300'
    }`} />;
  };

  const toggleItemStatus = async (itemId: string) => {
    if (!roadmap) return;

    const item = roadmapItems.find(i => i.id === itemId);
    if (!item) return;

    // Toggle between not_started and completed
    const nextStatus = item.status === 'completed' ? 'not_started' : 'completed';

    try {
      console.log(`[TOGGLE STATUS] Changing item ${itemId} from ${item.status} to ${nextStatus}`);

      // Optimistically update UI immediately
      setRoadmapItems(prev => {
        const updated = prev.map(i =>
          i.id === itemId ? { ...i, status: nextStatus as 'not_started' | 'in_progress' | 'completed' } : i
        );
        // Re-sort: active on top, completed on bottom
        return updated.sort((a, b) => {
          if (a.status === 'completed' && b.status !== 'completed') return 1;
          if (a.status !== 'completed' && b.status === 'completed') return -1;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
      });

      // Also update selectedItem if it's open
      if (selectedItem?.id === itemId) {
        setSelectedItem({ ...selectedItem, status: nextStatus as 'not_started' | 'in_progress' | 'completed' });
      }

      // Update backend
      await RoadmapService.updateRoadmapItem(roadmap.id, itemId, { status: nextStatus });
      console.log(`[TOGGLE STATUS] Backend updated successfully, now reloading roadmap`);

      // After successful status change, reload to check if we need to auto-generate
      await loadRoadmap();
    } catch (error) {
      console.error('Failed to update item status:', error);
      setError('Failed to update recommendation status. Please try again.');
      // Revert optimistic update on error
      await loadRoadmap();
    }
  };

  const handleThumbsUp = async (itemId: string) => {
    // Thumbs up keeps the recommendation and marks it as accepted
    if (!roadmap) return;

    // Check if already thumbs upped
    const item = roadmapItems.find(i => i.id === itemId);
    if (item?.thumbsUpGiven) {
      // Already thumbs upped, do nothing
      return;
    }

    try {
      // Optimistically update UI immediately
      setRoadmapItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, thumbsUpGiven: true, status: 'not_started' as const } : i
      ));

      // Also update selectedItem if it's open
      if (selectedItem?.id === itemId) {
        setSelectedItem({ ...selectedItem, thumbsUpGiven: true, status: 'not_started' });
      }

      // Submit feedback to backend for admin dashboard tracking
      try {
        await FeedbackService.submitFeedback({
          messageId: itemId,
          sessionId: roadmap.id,
          feedbackType: 'positive',
          objectType: 'recommendation'
        });
      } catch (feedbackError) {
        console.error('Failed to submit feedback (non-blocking):', feedbackError);
        // Don't block the UX if feedback fails
      }

      // Mark as accepted and set thumbsUpGiven flag in backend
      await RoadmapService.updateRoadmapItem(roadmap.id, itemId, {
        status: 'not_started',
        thumbsUpGiven: true
      });
    } catch (error) {
      console.error('Failed to accept recommendation:', error);
      setError('Failed to accept recommendation. Please try again.');
      // Revert optimistic update on error
      await loadRoadmap();
    }
  };

  const handleThumbsDown = async (itemId: string) => {
    // Thumbs down removes the recommendation and generates a replacement
    if (!roadmap) return;

    try {
      // Submit negative feedback to backend for admin dashboard tracking
      try {
        await FeedbackService.submitFeedback({
          messageId: itemId,
          sessionId: roadmap.id,
          feedbackType: 'negative',
          objectType: 'recommendation'
        });
      } catch (feedbackError) {
        console.error('Failed to submit feedback (non-blocking):', feedbackError);
        // Don't block the UX if feedback fails
      }

      await RoadmapService.deleteRoadmapItem(roadmap.id, itemId);
      // loadRoadmap() will auto-generate if < 3 unfinished items
      await loadRoadmap();
    } catch (error) {
      console.error('Failed to remove recommendation:', error);
      setError('Failed to remove recommendation. Please try again.');
    }
  };

  const openDetailModal = (item: RoadmapItem) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const getProgressPercentage = () => {
    const completed = roadmapItems.filter(item => item.status === 'completed').length;
    // Each completed recommendation = 20% progress, capped at 100%
    return Math.min(completed * 20, 100);
  };

  const createStarterRecommendationsWithRoadmap = async (roadmapToUse: typeof roadmap) => {
    if (!roadmapToUse) {
      console.error('Cannot create starter recommendations: roadmap is null');
      return;
    }

    setGeneratingRecommendations(true);
    setError(null);

    try {
      console.log('Creating 3 starter recommendations for roadmap:', roadmapToUse.id);

      // Create 3 default starter recommendations
      const starterRecommendations = [
        {
          title: 'Establish consistent daily routine',
          description: 'Work on creating a predictable schedule with visual supports like picture schedules or timers. Start with morning and bedtime routines, using consistent cues and rewards for following the routine.',
          category: 'daily_skills' as const,
          status: 'not_started' as const,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: []
        },
        {
          title: 'Practice requesting help appropriately',
          description: 'Teach and reinforce using "help please" or alternative communication methods in various situations. Use visual cue cards, model the behavior, and reward successful attempts.',
          category: 'communication' as const,
          status: 'not_started' as const,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: []
        },
        {
          title: 'Arrange structured playdate with peer',
          description: 'Set up a short, structured playdate to work on social interaction skills. Choose a familiar peer, plan activities in advance, and keep the initial playdate brief (30-45 minutes).',
          category: 'social' as const,
          status: 'not_started' as const,
          dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: []
        }
      ];

      // Create each recommendation
      let successCount = 0;
      for (const rec of starterRecommendations) {
        try {
          console.log(`Adding starter recommendation: ${rec.title}`);
          await RoadmapService.addRoadmapItem(roadmapToUse.id, rec);
          successCount++;
          console.log(`Successfully added: ${rec.title}`);
        } catch (itemError) {
          console.error(`Failed to add recommendation "${rec.title}":`, itemError);
        }
      }

      console.log(`Created ${successCount} out of 3 starter recommendations`);

      // Reload roadmap to show new recommendations
      await loadRoadmap();

    } catch (error) {
      console.error('Error creating starter recommendations:', error);
      setError('Failed to create starter recommendations. Please try again.');
    } finally {
      setGeneratingRecommendations(false);
    }
  };

  const generateRecommendations = async () => {
    console.log('[generateRecommendations] Function called');
    if (!roadmap) {
      console.log('[generateRecommendations] ✗ No roadmap found, exiting');
      return;
    }

    console.log('[generateRecommendations] ✓ Setting generatingRecommendations to TRUE');
    setGeneratingRecommendations(true);
    setError(null);

    try {
      const childName = getChildName();
      const childAge = profile?.children?.[0]?.age;

      // Gather existing recommendations to prevent duplicates
      const existingRecommendations = roadmapItems.map(item => ({
        title: item.title,
        description: item.description,
        category: item.category
      }));

      // Analyze category distribution to encourage variety
      const categoryCount = existingRecommendations.reduce((acc, rec) => {
        acc[rec.category] = (acc[rec.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const allCategories = ['therapy', 'education', 'daily_skills', 'social', 'communication', 'behavioral'];
      const underrepresentedCategories = allCategories.filter(cat => !categoryCount[cat] || categoryCount[cat] < 2);

      const categoryGuidance = underrepresentedCategories.length > 0
        ? `\n\nSUGGESTED FOCUS AREAS: Consider generating recommendations in these less-covered categories: ${underrepresentedCategories.join(', ')}`
        : '';

      // Build existing recommendations context for the prompt
      const existingContext = existingRecommendations.length > 0
        ? `\n\nEXISTING RECOMMENDATIONS (DO NOT DUPLICATE):\n${existingRecommendations.map((rec, idx) =>
            `${idx + 1}. [${rec.category}] ${rec.title} - ${rec.description.substring(0, 100)}...`
          ).join('\n')}${categoryGuidance}\n`
        : '';

      // Build a prompt to generate one NEW recommendation that's different from existing ones
      const prompt = `Based on ${childName ? `${childName}'s` : 'the child\'s'} profile${childAge ? ` (age ${childAge})` : ''}, generate 1 specific, actionable recommendation for the next 30 days.${existingContext}

CRITICAL ANTI-DUPLICATION REQUIREMENTS:
1. ANALYZE the existing recommendations above carefully
2. IDENTIFY which developmental areas, skills, and topics are already covered
3. AVOID any recommendation that overlaps with existing ones (even if worded differently)
4. If the existing recommendation mentions "communication", DO NOT suggest anything related to speech, language, or verbal skills
5. If the existing recommendation mentions "social skills", DO NOT suggest playdates, peer interactions, or friendship
6. If the existing recommendation mentions "daily routines", DO NOT suggest morning/bedtime schedules, self-care, or independence

GENERATE A TRULY DIFFERENT RECOMMENDATION:
- Choose a developmental area NOT represented in the existing list
- If all major areas are covered, go deeper into a sub-skill that wasn't addressed
- Categories to choose from: therapy, education, daily_skills, social, communication, behavioral
- Be creative and specific - think about sensory needs, fine motor skills, executive function, emotional regulation, safety skills, community participation, etc.

FORMAT REQUIREMENT:
Provide exactly this format:
1. Concise Title (5-10 words) - Detailed description with specific actionable steps and strategies (2-3 sentences)

Example of a UNIQUE recommendation:
1. Practice Safety Skills in Community Settings - Work on "stop, look, and listen" when crossing parking lots. Use role-play at home and then practice in low-traffic areas with hand-over-hand guidance, gradually fading prompts as child demonstrates understanding.`;

      // Call unified roadmap-transform Lambda with mode='generate'
      const apiUrl = process.env.REACT_APP_API_URL || 'https://1mn0x289zc.execute-api.us-east-1.amazonaws.com/prod';
      const authToken = localStorage.getItem('auth_token');

      const response = await fetch(`${apiUrl}/roadmap-transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          message: prompt,
          existingRecommendations: existingRecommendations,
          mode: 'generate'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate recommendations');
      }

      const data = await response.json();
      const roadmapItem = data.roadmapItem;

      if (!roadmapItem || !roadmapItem.title || !roadmapItem.description) {
        throw new Error('Invalid roadmap item returned from Lambda');
      }

      const title = roadmapItem.title;
      const description = roadmapItem.description;
      const category = roadmapItem.category || 'daily_skills';

      // Simplified similarity check (Lambda already handles anti-duplication)
      const isSimilar = (newTitle: string, newDesc: string): boolean => {
        const normalize = (text: string) => text.toLowerCase().trim();
        const normalizedNewTitle = normalize(newTitle);
        const normalizedNewDesc = normalize(newDesc);

        return existingRecommendations.some(existing => {
          const existingTitle = normalize(existing.title);
          const existingDesc = normalize(existing.description);

          // Check for title similarity (exact match or very close)
          if (normalizedNewTitle === existingTitle) return true;

          // Check for significant overlap in key words
          const newTitleWords = normalizedNewTitle.split(/\s+/).filter(w => w.length > 4);
          const existingTitleWords = existingTitle.split(/\s+/).filter(w => w.length > 4);
          const titleOverlap = newTitleWords.filter(w => existingTitleWords.includes(w)).length;

          // If more than 50% of significant words overlap, consider it similar
          if (newTitleWords.length > 0 && titleOverlap / newTitleWords.length > 0.5) return true;

          // Check description for similar concepts
          const newDescWords = normalizedNewDesc.split(/\s+/).filter(w => w.length > 5).slice(0, 20);
          const existingDescWords = existingDesc.split(/\s+/).filter(w => w.length > 5).slice(0, 20);
          const descOverlap = newDescWords.filter(w => existingDescWords.includes(w)).length;

          // If more than 40% of key words in description overlap, consider it similar
          if (newDescWords.length > 0 && descOverlap / newDescWords.length > 0.4) return true;

          return false;
        });
      };

      // Optional: Additional similarity check (Lambda already handles most of this)
      if (isSimilar(title, description)) {
        console.warn('Generated recommendation is too similar to existing ones, skipping...');
        setError('The generated recommendation was too similar to existing ones. Please manually generate a new one.');
        // Don't reload to avoid potential infinite loops - user can manually generate
        return;
      }

      // Category already determined by Lambda
      // Due date already set by Lambda (we'll use the current date + 30 days for consistency)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      await RoadmapService.addRoadmapItem(roadmap.id, {
        title,
        description,
        category,
        status: 'not_started',
        dueDate: dueDate.toISOString(),
        notes: []
      });

      // Reload roadmap to show new recommendation
      console.log('[generateRecommendations] ✓ Item added successfully, reloading roadmap');
      await loadRoadmap();

    } catch (error) {
      console.error('[generateRecommendations] ✗ Error generating recommendations:', error);
      setError('Failed to generate recommendations. Please try again.');
    } finally {
      console.log('[generateRecommendations] ✓ Setting generatingRecommendations to FALSE in finally block');
      setGeneratingRecommendations(false);
    }
  };

  const generateCustomRecommendation = async () => {
    if (!roadmap || !customPrompt.trim()) {
      setError('Please enter a custom prompt');
      return;
    }

    setGeneratingCustom(true);
    setError(null);

    try {
      const childName = getChildName();
      const childAge = profile?.children?.[0]?.age;

      // Build prompt incorporating the user's custom request
      const prompt = `Based on ${childName ? `${childName}'s` : 'the child\'s'} profile${childAge ? ` (age ${childAge})` : ''}, generate 1 specific, actionable recommendation for the following request:

USER REQUEST: "${customPrompt}"

Generate a roadmap item that addresses this specific request. Make it actionable and tailored to the child's profile.

FORMAT REQUIREMENT:
Provide exactly this format:
1. Concise Title (5-10 words) - Detailed description with specific actionable steps and strategies (2-3 sentences)`;

      const apiUrl = process.env.REACT_APP_API_URL || 'https://1mn0x289zc.execute-api.us-east-1.amazonaws.com/prod';
      const authToken = localStorage.getItem('auth_token');

      const response = await fetch(`${apiUrl}/roadmap-transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          message: prompt,
          existingRecommendations: roadmapItems.map(item => ({
            title: item.title,
            description: item.description,
            category: item.category
          })),
          mode: 'generate'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate custom recommendation');
      }

      const data = await response.json();
      const roadmapItem = data.roadmapItem;

      if (!roadmapItem || !roadmapItem.title || !roadmapItem.description) {
        throw new Error('Invalid roadmap item returned from Lambda');
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      await RoadmapService.addRoadmapItem(roadmap.id, {
        title: roadmapItem.title,
        description: roadmapItem.description,
        category: roadmapItem.category || 'daily_skills',
        status: 'not_started',
        dueDate: dueDate.toISOString(),
        notes: []
      });

      // Reset modal and reload
      setShowCustomModal(false);
      setCustomPrompt('');
      await loadRoadmap();

    } catch (error) {
      console.error('Error generating custom recommendation:', error);
      setError('Failed to generate custom recommendation. Please try again.');
    } finally {
      setGeneratingCustom(false);
    }
  };

  return (
    <div className={`h-full flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b p-6 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {getChildName() ? `${getChildName()}'s 90-Day Roadmap` : 'Your 90-Day Roadmap'}
              </h1>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {currentPeriod}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
              Progress: {getProgressPercentage()}%
            </span>
            <span className={`flex items-center space-x-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Calendar className="w-4 h-4" />
              <span>{daysRemaining} days remaining</span>
            </span>
          </div>
          <div className={`w-full h-2 rounded-full overflow-hidden ${
            isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
          }`}>
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Error Banner */}
        {error && (
          <div className={`mb-4 p-4 rounded-xl border transition-all duration-300 ${
            isDarkMode
              ? 'bg-red-900/20 border-red-700/50 text-red-300'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className={`p-1 rounded transition-colors ${
                  isDarkMode
                    ? 'hover:bg-red-800/50 text-red-300'
                    : 'hover:bg-red-100 text-red-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Goals and Challenges Section */}
        {!profileLoading && profile && ((profile.biggest_challenges?.length ?? 0) > 0 || (profile.desired_outcomes?.length ?? 0) > 0) && (
          <div
            key={`goals-${profile.biggest_challenges?.length}-${profile.desired_outcomes?.length}`}
            className={`mb-4 p-4 rounded-xl border transition-all duration-300 ${
              isDarkMode
                ? 'bg-blue-900/20 border-blue-700/50'
                : 'bg-blue-50 border-blue-200'
            }`}>
            <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-blue-200' : 'text-blue-900'}`}>
              Your Goals and Challenges
            </h3>
            <div className="space-y-3">
              {profile.biggest_challenges && profile.biggest_challenges.length > 0 && (
                <div>
                  <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Current Challenges:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {profile.biggest_challenges
                      .filter((challenge: string) => challenge !== 'other')
                      .map((challenge: string, idx: number) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                            isDarkMode ? 'bg-orange-900/50 text-orange-200' : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {formatLabel(challenge, 'challenge')}
                        </span>
                      ))}
                    {profile.other_challenge_texts && profile.other_challenge_texts.map((text: string, idx: number) => (
                      <span
                        key={`other-${idx}`}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                          isDarkMode ? 'bg-orange-900/50 text-orange-200' : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.desired_outcomes && profile.desired_outcomes.length > 0 && (
                <div>
                  <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    90-Day Goals:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {profile.desired_outcomes
                      .filter((outcome: string) => outcome !== 'other')
                      .map((outcome: string, idx: number) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                            isDarkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {formatLabel(outcome, 'outcome')}
                        </span>
                      ))}
                    {profile.other_outcome_texts && profile.other_outcome_texts.map((text: string, idx: number) => (
                      <span
                        key={`other-${idx}`}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                          isDarkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : roadmapItems.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              No Recommendations Yet
            </h3>
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {getChildName()
                ? `Let's create ${getChildName()}'s personalized 90-day recommendations based on your family's needs`
                : "Let's create your personalized 90-day recommendations based on your family's needs"}
            </p>
            <button
              onClick={generateRecommendations}
              disabled={generatingRecommendations}
              className={`inline-flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                generatingRecommendations
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isDarkMode
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                  : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
              }`}
            >
              {generatingRecommendations ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Generate Roadmap</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {roadmapItems.map((item, index) => (
              <div
                key={item.id}
                className={`rounded-xl border transition-all duration-300 hover:shadow-lg cursor-pointer ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                } ${item.status === 'completed' ? 'opacity-70' : ''}`}
                onClick={() => openDetailModal(item)}
              >
                <div className="p-5">
                  <div className="flex items-start space-x-4">
                    {/* Status Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleItemStatus(item.id);
                      }}
                      className="mt-1 flex-shrink-0 transition-all duration-200 hover:scale-110"
                    >
                      {getStatusIcon(item.status)}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className={`text-lg font-semibold mb-1 ${
                            item.status === 'completed'
                              ? isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through'
                              : isDarkMode ? 'text-gray-100' : 'text-gray-900'
                          }`}>
                            {item.title}
                          </h3>
                          <p className={`text-sm line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {item.description.substring(0, 150)}{item.description.length > 150 ? '...' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            getCategoryColor(item.category)
                          }`}>
                            {getCategoryLabel(item.category)}
                          </span>
                          {item.status === 'completed' && (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'
                            }`}>
                              Completed
                            </span>
                          )}
                        </div>

                        {/* Thumbs Up/Down buttons */}
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleThumbsUp(item.id);
                            }}
                            className={`p-2 rounded-lg transition-all duration-200 ${
                              item.thumbsUpGiven
                                ? isDarkMode
                                  ? 'text-green-400 bg-green-900/30'
                                  : 'text-green-600 bg-green-50'
                                : isDarkMode
                                ? 'text-gray-400 hover:text-green-400 hover:bg-green-900/30 hover:scale-110'
                                : 'text-gray-500 hover:text-green-600 hover:bg-green-50 hover:scale-110'
                            }`}
                            title={item.thumbsUpGiven ? "Already accepted" : "Keep this recommendation"}
                            disabled={item.thumbsUpGiven}
                          >
                            <ThumbsUp className={`w-4 h-4 ${item.thumbsUpGiven ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleThumbsDown(item.id);
                            }}
                            className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                              isDarkMode
                                ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30'
                                : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title="Remove and replace this recommendation"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add New Recommendation Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={generateRecommendations}
                disabled={generatingRecommendations}
                className={`p-4 rounded-xl border-2 border-dashed transition-all duration-300 hover:scale-[1.02] ${
                  generatingRecommendations ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  isDarkMode
                    ? 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  {generatingRecommendations ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      <span className={`font-medium text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Generating...
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`font-medium text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Generate Recommendation
                      </span>
                    </>
                  )}
                </div>
              </button>

              <button
                onClick={() => setShowCustomModal(true)}
                disabled={generatingRecommendations || generatingCustom}
                className={`p-4 rounded-xl border-2 border-dashed transition-all duration-300 hover:scale-[1.02] ${
                  generatingRecommendations || generatingCustom ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  isDarkMode
                    ? 'border-purple-700 hover:border-purple-600 hover:bg-purple-900/20'
                    : 'border-purple-300 hover:border-purple-400 hover:bg-purple-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                  <span className={`font-medium text-sm ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                    Custom Recommendation
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2" onClick={() => setShowDetailModal(false)}>
          <div
            className={`w-full max-w-6xl rounded-2xl shadow-2xl transition-all duration-300 max-h-[90vh] overflow-y-auto ${
              isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between p-6 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex-1 pr-4">
                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {selectedItem.title}
                </h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    getCategoryColor(selectedItem.category)
                  }`}>
                    {getCategoryLabel(selectedItem.category)}
                  </span>
                  {selectedItem.status === 'completed' && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'
                    }`}>
                      Completed
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className={`prose max-w-none ${isDarkMode ? 'prose-invert' : ''}`}>
                <p className={`text-base leading-relaxed whitespace-pre-wrap ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {selectedItem.description}
                </p>
              </div>

              {selectedItem.notes && selectedItem.notes.length > 0 && (
                <div className="mt-6">
                  <h4 className={`font-semibold mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    Notes
                  </h4>
                  <div className="space-y-2">
                    {selectedItem.notes.map((note, noteIndex) => (
                      <div key={noteIndex} className="flex items-start space-x-2">
                        <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          isDarkMode ? 'text-gray-500' : 'text-gray-400'
                        }`} />
                        <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {note}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={`flex items-center justify-between p-6 border-t ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={() => {
                  toggleItemStatus(selectedItem.id);
                  setShowDetailModal(false);
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  selectedItem.status === 'completed'
                    ? isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    : isDarkMode
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{selectedItem.status === 'completed' ? 'Mark Incomplete' : 'Mark Complete'}</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    handleThumbsUp(selectedItem.id);
                    setShowDetailModal(false);
                  }}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    selectedItem.thumbsUpGiven
                      ? isDarkMode
                        ? 'text-green-400 bg-green-900/30'
                        : 'text-green-600 bg-green-50'
                      : isDarkMode
                      ? 'text-gray-400 hover:text-green-400 hover:bg-green-900/30 hover:scale-110'
                      : 'text-gray-500 hover:text-green-600 hover:bg-green-50 hover:scale-110'
                  }`}
                  title={selectedItem.thumbsUpGiven ? "Already accepted" : "Keep this recommendation"}
                  disabled={selectedItem.thumbsUpGiven}
                >
                  <ThumbsUp className={`w-5 h-5 ${selectedItem.thumbsUpGiven ? 'fill-current' : ''}`} />
                </button>
                <button
                  onClick={() => {
                    handleThumbsDown(selectedItem.id);
                    setShowDetailModal(false);
                  }}
                  className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                    isDarkMode
                      ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30'
                      : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                  }`}
                  title="Remove and replace this recommendation"
                >
                  <ThumbsDown className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Recommendation Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomModal(false)}>
          <div
            className={`w-full max-w-lg rounded-2xl shadow-2xl transition-all duration-300 ${
              isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`border-b p-6 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Custom Recommendation
                </h2>
                <button
                  onClick={() => setShowCustomModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'hover:bg-gray-700 text-gray-400'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Describe what you'd like to work on and we'll create a personalized recommendation
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  What would you like help with?
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="E.g., 'Help my child learn to ride a bike' or 'Improve communication during meal times'"
                  rows={4}
                  className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 resize-none ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                  }`}
                />
                <p className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Be as specific as possible for the best recommendations
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomModal(false)}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={generateCustomRecommendation}
                  disabled={generatingCustom || !customPrompt.trim()}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all duration-200 inline-flex items-center justify-center gap-2 ${
                    generatingCustom || !customPrompt.trim()
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  } ${
                    isDarkMode
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white'
                  }`}
                >
                  {generatingCustom ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Roadmap;
