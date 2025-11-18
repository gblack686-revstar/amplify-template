import React, { useState } from 'react';
import { X, ThumbsUp, ThumbsDown, Plus, Loader } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import RoadmapService, { RoadmapItem } from '../services/roadmapService';
import FeedbackService from '../services/feedbackService';

interface QuickWinModalProps {
  recommendation: Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'thumbsUpGiven'>;
  childName: string;
  onClose: () => void;
  onAddedToRoadmap?: () => void;
}

const QuickWinModal: React.FC<QuickWinModalProps> = ({
  recommendation,
  childName,
  onClose,
  onAddedToRoadmap
}) => {
  const { isDarkMode } = useTheme();
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleFeedback = async (isPositive: boolean) => {
    try {
      console.log('Submitting feedback:', {
        messageId: `quick-win-${Date.now()}`,
        sessionId: 'onboarding-quick-win',
        feedbackType: isPositive ? 'positive' : 'negative',
        objectType: 'recommendation',
        comment: `Quick win: ${recommendation.title} (${recommendation.category})`
      });

      await FeedbackService.submitFeedback({
        messageId: `quick-win-${Date.now()}`,
        sessionId: 'onboarding-quick-win',
        feedbackType: isPositive ? 'positive' : 'negative',
        objectType: 'recommendation',
        comment: `Quick win: ${recommendation.title} (${recommendation.category})`
      });

      console.log('Feedback submitted successfully');
      setFeedbackGiven(isPositive ? 'positive' : 'negative');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      // Still set feedback as given to prevent UI blocking
      setFeedbackGiven(isPositive ? 'positive' : 'negative');
    }
  };

  const handleAddToRoadmap = async () => {
    setIsAdding(true);
    try {
      await RoadmapService.addRoadmapItem('roadmap-current', {
        ...recommendation,
        status: 'not_started',
        thumbsUpGiven: feedbackGiven === 'positive'
      });
      setAdded(true);
      if (onAddedToRoadmap) {
        onAddedToRoadmap();
      }
      // Close modal after 1.5 seconds
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error adding to roadmap:', error);
      setIsAdding(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'therapy':
        return isDarkMode ? 'bg-purple-900/50 text-purple-200' : 'bg-purple-100 text-purple-800';
      case 'education':
        return isDarkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800';
      case 'daily_skills':
        return isDarkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-800';
      case 'social':
        return isDarkMode ? 'bg-pink-900/50 text-pink-200' : 'bg-pink-100 text-pink-800';
      case 'communication':
        return isDarkMode ? 'bg-yellow-900/50 text-yellow-200' : 'bg-yellow-100 text-yellow-800';
      case 'behavioral':
        return isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-100 text-red-800';
      default:
        return isDarkMode ? 'bg-gray-900/50 text-gray-200' : 'bg-gray-100 text-gray-800';
    }
  };

  const formatCategoryLabel = (category: string) => {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`relative w-full max-w-2xl rounded-2xl shadow-2xl ${
          isDarkMode ? 'bg-gray-800' : 'bg-white'
        } max-h-[90vh] overflow-y-auto`}
      >
        {/* Header with Celebration */}
        <div className={`sticky top-0 z-10 px-6 pt-6 pb-4 border-b ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="text-5xl mb-3">🎯</div>
              <h2 className={`text-3xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Your Quick Win for {childName}!
              </h2>
              <p className={`mt-2 text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                We've generated a personalized recommendation to get you started
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Recommendation Card with Gradient */}
          <div
            className={`p-6 rounded-xl border-2 transition-all duration-300 ${
              isDarkMode
                ? 'bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-700'
                : 'bg-gradient-to-br from-blue-50 to-purple-50 border-blue-300'
            }`}
          >
            {/* Category Badge */}
            <div className="mb-4">
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${getCategoryColor(recommendation.category)}`}>
                {formatCategoryLabel(recommendation.category)}
              </span>
            </div>

            {/* Title */}
            <h3 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {recommendation.title}
            </h3>

            {/* Description */}
            <p className={`text-base leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {recommendation.description}
            </p>
          </div>

          {/* Feedback Section */}
          <div className={`p-5 rounded-xl border ${
            isDarkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-base font-semibold mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              💭 Is this recommendation helpful?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleFeedback(true)}
                disabled={feedbackGiven !== null}
                className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  feedbackGiven === 'positive'
                    ? 'bg-green-600 text-white shadow-lg scale-105'
                    : feedbackGiven === 'negative'
                    ? 'opacity-50 cursor-not-allowed'
                    : isDarkMode
                    ? 'bg-gray-600 hover:bg-green-600 text-gray-200 hover:shadow-lg hover:scale-105'
                    : 'bg-white hover:bg-green-50 text-gray-700 border-2 border-gray-300 hover:border-green-500 hover:shadow-lg hover:scale-105'
                }`}
              >
                <ThumbsUp className="w-5 h-5" />
                <span>Helpful</span>
              </button>
              <button
                onClick={() => handleFeedback(false)}
                disabled={feedbackGiven !== null}
                className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  feedbackGiven === 'negative'
                    ? 'bg-red-600 text-white shadow-lg scale-105'
                    : feedbackGiven === 'positive'
                    ? 'opacity-50 cursor-not-allowed'
                    : isDarkMode
                    ? 'bg-gray-600 hover:bg-red-600 text-gray-200 hover:shadow-lg hover:scale-105'
                    : 'bg-white hover:bg-red-50 text-gray-700 border-2 border-gray-300 hover:border-red-500 hover:shadow-lg hover:scale-105'
                }`}
              >
                <ThumbsDown className="w-5 h-5" />
                <span>Not Helpful</span>
              </button>
            </div>
            {feedbackGiven && (
              <p className={`text-sm mt-3 text-center ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                ✓ Thanks for your feedback!
              </p>
            )}
          </div>

          {/* Add to Roadmap Button */}
          <div className="pt-2">
            <button
              onClick={handleAddToRoadmap}
              disabled={isAdding || added}
              className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-lg font-bold text-white transition-all duration-200 ${
                added
                  ? 'bg-green-600 shadow-lg'
                  : isDarkMode
                  ? 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 hover:shadow-lg hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 hover:shadow-lg hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isAdding ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Adding to Roadmap...</span>
                </>
              ) : added ? (
                <>
                  <span className="text-2xl">✓</span>
                  <span>Added to Roadmap!</span>
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6" />
                  <span>Add to My Roadmap</span>
                </>
              )}
            </button>
          </div>

          {/* Skip Option */}
          {!added && (
            <div className="text-center">
              <button
                onClick={onClose}
                className={`text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'text-gray-400 hover:text-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickWinModal;
