import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface OnboardingLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
}

const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({
  children,
  currentStep,
  totalSteps,
  title,
  subtitle,
}) => {
  const { isDarkMode } = useTheme();

  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-500 ${
        isDarkMode
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
          : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'
      }`}
    >
      {/* Header with Progress */}
      <div className="w-full py-6 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Logo/Brand */}
          <div className="text-center mb-6">
            <h1
              className={`text-2xl font-bold transition-colors duration-300 ${
                isDarkMode ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              RevStar Wellness
            </h1>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span
                className={`text-sm font-medium transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                Step {currentStep} of {totalSteps}
              </span>
              <span
                className={`text-sm font-medium transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                {Math.round(progressPercentage)}% Complete
              </span>
            </div>
            <div
              className={`w-full h-2 rounded-full overflow-hidden ${
                isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
              }`}
            >
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-3xl">
          <div
            className={`rounded-2xl shadow-2xl p-8 transition-all duration-300 ${
              isDarkMode
                ? 'bg-gray-800/90 border border-gray-700'
                : 'bg-white border border-gray-100'
            }`}
          >
            {/* Step Title */}
            <div className="mb-8 text-center">
              <h2
                className={`text-3xl font-bold mb-2 transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-100' : 'text-gray-900'
                }`}
              >
                {title}
              </h2>
              {subtitle && (
                <p
                  className={`text-lg transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>

            {/* Step Content */}
            {children}
          </div>

          {/* Helper Text */}
          <div className="text-center mt-6">
            <p
              className={`text-sm transition-colors duration-300 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Your information is secure and will only be used to personalize your experience
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingLayout;
