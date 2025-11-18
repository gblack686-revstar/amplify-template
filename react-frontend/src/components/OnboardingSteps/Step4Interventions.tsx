import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { StepProps, TherapyType } from '../../types/onboarding';

const Step4Interventions: React.FC<StepProps> = ({ data, onUpdate, onNext, onBack }) => {
  const { isDarkMode } = useTheme();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const therapyOptions: { value: TherapyType; label: string; description: string }[] = [
    { value: 'aba', label: 'ABA (Applied Behavior Analysis)', description: 'Evidence-based behavior therapy' },
    { value: 'speech', label: 'Speech Therapy', description: 'Communication and language support' },
    { value: 'occupational', label: 'Occupational Therapy', description: 'Daily living skills and sensory support' },
    { value: 'physical', label: 'Physical Therapy', description: 'Motor skills and movement' },
    { value: 'behavioral', label: 'Behavioral Therapy', description: 'Managing behaviors and emotions' },
    { value: 'developmental', label: 'Developmental Therapy', description: 'Overall developmental support' },
  ];

  // Get selected therapy types from currentTherapies
  const selectedTherapies = data.currentTherapies?.map(t => t.type) || [];

  const handleTherapyToggle = (therapyType: TherapyType) => {
    const currentTherapies = data.currentTherapies || [];
    const isSelected = currentTherapies.some(t => t.type === therapyType);

    if (isSelected) {
      // Remove therapy
      onUpdate({
        currentTherapies: currentTherapies.filter(t => t.type !== therapyType)
      });
    } else {
      // Add therapy with placeholder frequency
      onUpdate({
        currentTherapies: [...currentTherapies, {
          type: therapyType,
          frequency: 'Currently receiving'
        }]
      });
    }
    setErrors({});
  };

  const validateAndProceed = () => {
    // No validation required - therapies are optional
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <p
          className={`text-lg mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-300' : 'text-gray-700'
          }`}
        >
          What therapies or interventions is your child currently receiving?
        </p>
        <p
          className={`text-sm mb-6 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Select all that apply (optional)
        </p>
      </div>

      {/* Therapy Checkboxes */}
      <div className="grid gap-3">
        {therapyOptions.map((option) => {
          const isSelected = selectedTherapies.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleTherapyToggle(option.value)}
              className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                isSelected
                  ? isDarkMode
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-green-500 bg-green-50'
                  : isDarkMode
                  ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start">
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded border-2 mr-3 mt-0.5 transition-all duration-200 flex items-center justify-center ${
                    isSelected
                      ? 'border-green-500 bg-green-500'
                      : isDarkMode
                      ? 'border-gray-500'
                      : 'border-gray-300'
                  }`}
                >
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`font-semibold mb-1 transition-colors duration-300 ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-800'
                    }`}
                  >
                    {option.label}
                  </div>
                  <div
                    className={`text-sm transition-colors duration-300 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    {option.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {errors.general && (
        <p className="text-sm text-red-500 mt-2">{errors.general}</p>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onBack}
          className={`flex-1 py-4 px-6 rounded-lg font-semibold transition-all duration-200 ${
            isDarkMode
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Back
        </button>
        <button
          type="button"
          onClick={validateAndProceed}
          className={`flex-1 py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
            isDarkMode
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
              : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600'
          } hover:shadow-lg hover:scale-[1.02]`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default Step4Interventions;
