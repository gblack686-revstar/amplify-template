import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface Step5WowMomentProps {
  childName?: string;
  onComplete: () => void;
  onBack: () => void;
  isProcessing?: boolean;
}

const Step5WowMoment: React.FC<Step5WowMomentProps> = ({
  childName,
  onComplete,
  onBack,
  isProcessing = false,
}) => {
  const { isDarkMode } = useTheme();

  return (
    <div className="space-y-6">
      {/* Celebration Header */}
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🎉</div>
        <h2
          className={`text-3xl font-bold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-100' : 'text-gray-900'
          }`}
        >
          {childName ? `Welcome to ${childName}'s Support Journey!` : 'Welcome to Your Support Journey!'}
        </h2>
        <p
          className={`text-lg transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Your profile has been saved successfully
        </p>
      </div>

      {/* Welcome Card */}
      <div
        className={`p-6 rounded-xl border-2 transition-all duration-300 ${
          isDarkMode
            ? 'bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-700'
            : 'bg-gradient-to-br from-blue-50 to-purple-50 border-blue-300'
        }`}
      >
        <h3
          className={`text-2xl font-bold mb-4 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-100' : 'text-gray-900'
          }`}
        >
          What's Next?
        </h3>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📄</div>
            <div>
              <h4 className={`font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Upload Documents
              </h4>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Upload IEPs, ABA reports, medical records, and other documents to get personalized insights powered by AI
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-2xl">💬</div>
            <div>
              <h4 className={`font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Ask Questions
              </h4>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Use the AI chat to get answers about autism support, therapies, and resources tailored to your family
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-2xl">🎯</div>
            <div>
              <h4 className={`font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Track Your Roadmap
              </h4>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Get personalized recommendations and track your progress with actionable 30-day goals
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div
        className={`p-4 rounded-lg border transition-all duration-300 ${
          isDarkMode
            ? 'bg-blue-900/20 border-blue-800'
            : 'bg-blue-50 border-blue-200'
        }`}
      >
        <p
          className={`text-sm transition-colors duration-300 ${
            isDarkMode ? 'text-blue-300' : 'text-blue-800'
          }`}
        >
          💡 <strong>Tip:</strong> Upload your first document to unlock AI-powered recommendations specific to {childName ? `${childName}'s` : 'your child\'s'} needs.
          The more documents you upload, the more personalized your insights become!
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="pt-4 flex gap-4">
        <button
          type="button"
          onClick={onBack}
          className={`flex-1 py-4 px-6 rounded-lg font-semibold transition-all duration-200 ${
            isDarkMode
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          } hover:shadow-lg`}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={isProcessing}
          className={`flex-1 py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
            isProcessing
              ? 'opacity-50 cursor-not-allowed bg-gradient-to-r from-green-600 to-blue-600'
              : isDarkMode
              ? 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 hover:shadow-lg hover:scale-[1.02]'
              : 'bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 hover:shadow-lg hover:scale-[1.02]'
          }`}
        >
          Get Started!
        </button>
      </div>
    </div>
  );
};

export default Step5WowMoment;
