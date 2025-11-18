import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { StepProps, WellnessGoal, WellnessLevel, HealthChallenge, WellnessOutcome } from '../../types/onboarding';

const Step1QualifyingQuestions: React.FC<StepProps> = ({ data, onUpdate, onNext }) => {
  const { isDarkMode } = useTheme();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const wellnessGoalOptions: { value: WellnessGoal; label: string; description: string }[] = [
    {
      value: 'weight_management',
      label: 'Weight Management',
      description: 'Achieve and maintain a healthy weight',
    },
    {
      value: 'stress_reduction',
      label: 'Stress Reduction',
      description: 'Reduce stress and improve relaxation',
    },
    {
      value: 'energy_improvement',
      label: 'Energy & Vitality',
      description: 'Boost energy levels and overall vitality',
    },
    {
      value: 'sleep_quality',
      label: 'Sleep Quality',
      description: 'Improve sleep patterns and quality',
    },
    {
      value: 'fitness_goals',
      label: 'Fitness Goals',
      description: 'Improve strength, endurance, or flexibility',
    },
    {
      value: 'nutrition_improvement',
      label: 'Nutrition Improvement',
      description: 'Develop healthier eating habits',
    },
  ];

  const wellnessLevelOptions: { value: WellnessLevel; label: string; description: string }[] = [
    {
      value: 'beginner',
      label: 'Beginner',
      description: 'Just starting my wellness journey',
    },
    {
      value: 'intermediate',
      label: 'Intermediate',
      description: 'Have some healthy habits',
    },
    {
      value: 'advanced',
      label: 'Advanced',
      description: 'Actively working on wellness goals',
    },
  ];

  const challengeOptions: { value: HealthChallenge; label: string }[] = [
    { value: 'nutrition', label: 'Nutrition & Healthy Eating' },
    { value: 'exercise', label: 'Exercise & Physical Activity' },
    { value: 'sleep', label: 'Sleep Quality' },
    { value: 'stress', label: 'Stress Management' },
    { value: 'work_life_balance', label: 'Work-Life Balance' },
    { value: 'consistency', label: 'Staying Consistent' },
    { value: 'motivation', label: 'Motivation & Accountability' },
    { value: 'other', label: 'Other' },
  ];

  const outcomeOptions: { value: WellnessOutcome; label: string }[] = [
    { value: 'feel_healthier', label: 'Feel healthier and more energetic' },
    { value: 'build_habits', label: 'Build sustainable healthy habits' },
    { value: 'reduce_stress', label: 'Reduce stress and improve mental health' },
    { value: 'reach_goals', label: 'Reach specific health/fitness goals' },
    { value: 'support_system', label: 'Build a support system' },
    { value: 'other', label: 'Other' },
  ];

  const handleWellnessGoalSelect = (value: WellnessGoal) => {
    onUpdate({ wellnessGoal: value });
    setErrors((prev) => ({ ...prev, wellnessGoal: '' }));
  };

  const handleWellnessLevelSelect = (value: WellnessLevel) => {
    onUpdate({ wellnessLevel: value });
    setErrors((prev) => ({ ...prev, wellnessLevel: '' }));
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits and optional hyphen for ZIP+4 format
    const value = e.target.value.replace(/[^\d-]/g, '');
    onUpdate({ location: value });
    setErrors((prev) => ({ ...prev, location: '' }));
  };

  const handleDependentNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ dependentName: e.target.value });
    setErrors((prev) => ({ ...prev, dependentName: '' }));
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const sanitized = e.target.value.replace(/\D/g, '');

    if (sanitized === '') {
      onUpdate({ age: undefined });
      return;
    }

    const value = parseInt(sanitized, 10);
    if (!isNaN(value) && value >= 0 && value <= 99) {
      onUpdate({ age: value });
      setErrors((prev) => ({ ...prev, age: '' }));
    }
  };

  const handleChallengeToggle = (value: HealthChallenge) => {
    const currentChallenges = data.healthChallenges || [];
    const isSelected = currentChallenges.includes(value);

    if (isSelected) {
      onUpdate({ healthChallenges: currentChallenges.filter(c => c !== value) });
      // Clear "other" texts if "other" is deselected
      if (value === 'other') {
        onUpdate({ otherChallengeTexts: [] });
      }
    } else {
      onUpdate({ healthChallenges: [...currentChallenges, value] });
      // Initialize with one empty text input when "other" is selected
      if (value === 'other') {
        onUpdate({ otherChallengeTexts: [''] });
      }
    }
  };

  const handleOutcomeToggle = (value: WellnessOutcome) => {
    const currentOutcomes = data.wellnessOutcomes || [];
    const isSelected = currentOutcomes.includes(value);

    if (isSelected) {
      onUpdate({ wellnessOutcomes: currentOutcomes.filter(o => o !== value) });
      // Clear "other" texts if "other" is deselected
      if (value === 'other') {
        onUpdate({ otherOutcomeTexts: [] });
      }
    } else {
      onUpdate({ wellnessOutcomes: [...currentOutcomes, value] });
      // Initialize with one empty text input when "other" is selected
      if (value === 'other') {
        onUpdate({ otherOutcomeTexts: [''] });
      }
    }
  };

  const handleOtherChallengeTextChange = (index: number, value: string) => {
    const updatedTexts = [...(data.otherChallengeTexts || [])];
    updatedTexts[index] = value;
    onUpdate({ otherChallengeTexts: updatedTexts });
  };

  const addOtherChallengeText = () => {
    const updatedTexts = [...(data.otherChallengeTexts || []), ''];
    onUpdate({ otherChallengeTexts: updatedTexts });
  };

  const removeOtherChallengeText = (index: number) => {
    const updatedTexts = (data.otherChallengeTexts || []).filter((_, i) => i !== index);
    onUpdate({ otherChallengeTexts: updatedTexts.length > 0 ? updatedTexts : [''] });
  };

  const handleOtherOutcomeTextChange = (index: number, value: string) => {
    const updatedTexts = [...(data.otherOutcomeTexts || [])];
    updatedTexts[index] = value;
    onUpdate({ otherOutcomeTexts: updatedTexts });
  };

  const addOtherOutcomeText = () => {
    const updatedTexts = [...(data.otherOutcomeTexts || []), ''];
    onUpdate({ otherOutcomeTexts: updatedTexts });
  };

  const removeOtherOutcomeText = (index: number) => {
    const updatedTexts = (data.otherOutcomeTexts || []).filter((_, i) => i !== index);
    onUpdate({ otherOutcomeTexts: updatedTexts.length > 0 ? updatedTexts : [''] });
  };

  const validateAndProceed = () => {
    const newErrors: { [key: string]: string } = {};

    if (!data.dependentName || data.dependentName.trim().length < 2) {
      newErrors.dependentName = "Please enter a name";
    }
    if (!data.age || data.age < 0 || data.age > 99) {
      newErrors.age = "Please enter the current age (0-99)";
    }
    if (!data.wellnessGoal) {
      newErrors.wellnessGoal = 'Please select a wellness goal';
    }
    if (!data.wellnessLevel) {
      newErrors.wellnessLevel = 'Please select a wellness level';
    }
    // Validate ZIP code (5 digits or 5+4 format)
    const zipPattern = /^\d{5}(-\d{4})?$/;
    if (!data.location || !zipPattern.test(data.location.trim())) {
      newErrors.location = 'Please enter a valid ZIP code (e.g., 12345 or 12345-6789)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onNext();
  };

  return (
    <div className="space-y-8">
      {/* Name (Required) */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is your name (or the person's name who will be using this)? <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.dependentName || ''}
          onChange={handleDependentNameChange}
          placeholder="Enter name"
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            errors.dependentName
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {errors.dependentName && <p className="mt-2 text-sm text-red-500">{errors.dependentName}</p>}
        <p
          className={`mt-2 text-sm transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          This helps us personalize your wellness experience
        </p>
      </div>

      {/* Current Age (Required) */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is the current age? <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={data.age !== undefined ? data.age : ''}
          onChange={handleAgeChange}
          placeholder="Enter current age"
          maxLength={2}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            errors.age
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {errors.age && <p className="mt-2 text-sm text-red-500">{errors.age}</p>}
      </div>

      {/* Wellness Goal */}
      <div>
        <label
          className={`block text-lg font-semibold mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is your primary wellness goal? <span className="text-red-500">*</span>
        </label>
        <div className="grid gap-3">
          {wellnessGoalOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleWellnessGoalSelect(option.value)}
              className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                data.wellnessGoal === option.value
                  ? isDarkMode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-blue-500 bg-blue-50'
                  : isDarkMode
                  ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start">
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 mr-3 mt-1 transition-all duration-200 ${
                    data.wellnessGoal === option.value
                      ? 'border-blue-500 bg-blue-500'
                      : isDarkMode
                      ? 'border-gray-500'
                      : 'border-gray-300'
                  }`}
                >
                  {data.wellnessGoal === option.value && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
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
          ))}
        </div>
        {errors.wellnessGoal && (
          <p className="mt-2 text-sm text-red-500">{errors.wellnessGoal}</p>
        )}
      </div>

      {/* Wellness Level */}
      <div>
        <label
          className={`block text-lg font-semibold mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is your current wellness level? <span className="text-red-500">*</span>
        </label>
        <div className="grid gap-3">
          {wellnessLevelOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleWellnessLevelSelect(option.value)}
              className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                data.wellnessLevel === option.value
                  ? isDarkMode
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-purple-500 bg-purple-50'
                  : isDarkMode
                  ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start">
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 mr-3 mt-1 transition-all duration-200 ${
                    data.wellnessLevel === option.value
                      ? 'border-purple-500 bg-purple-500'
                      : isDarkMode
                      ? 'border-gray-500'
                      : 'border-gray-300'
                  }`}
                >
                  {data.wellnessLevel === option.value && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
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
          ))}
        </div>
        {errors.wellnessLevel && (
          <p className="mt-2 text-sm text-red-500">{errors.wellnessLevel}</p>
        )}
      </div>

      {/* ZIP Code */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is your ZIP code? <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.location || ''}
          onChange={handleLocationChange}
          placeholder="e.g., 90210 or 90210-1234"
          maxLength={10}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            errors.location
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {errors.location && <p className="mt-2 text-sm text-red-500">{errors.location}</p>}
        <p
          className={`mt-2 text-sm transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          We'll use this to recommend local programs and resources in your area
        </p>
      </div>

      {/* Health Challenges */}
      <div>
        <label
          className={`block text-lg font-semibold mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What are your biggest health challenges right now? <span className="text-gray-400">(Select all that apply)</span>
        </label>
        <div className="grid gap-2">
          {challengeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChallengeToggle(option.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all duration-200 ${
                data.healthChallenges?.includes(option.value)
                  ? isDarkMode
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-green-500 bg-green-50'
                  : isDarkMode
                  ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 mr-3 transition-all duration-200 flex items-center justify-center ${
                    data.healthChallenges?.includes(option.value)
                      ? 'border-green-500 bg-green-500'
                      : isDarkMode
                      ? 'border-gray-500'
                      : 'border-gray-300'
                  }`}
                >
                  {data.healthChallenges?.includes(option.value) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className={`text-sm transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  {option.label}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Conditional "Other" text inputs for challenges */}
        {data.healthChallenges?.includes('other') && (
          <div className="mt-3 space-y-2">
            {(data.otherChallengeTexts || ['']).map((text, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => handleOtherChallengeTextChange(index, e.target.value)}
                  placeholder="Please specify your challenge..."
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                  }`}
                />
                {(data.otherChallengeTexts || []).length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOtherChallengeText(index)}
                    className={`px-3 py-2 rounded-lg transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-red-100 text-red-600 hover:bg-red-200'
                    }`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOtherChallengeText}
              className={`w-full py-2 px-4 rounded-lg border-2 border-dashed transition-all duration-200 ${
                isDarkMode
                  ? 'border-gray-600 text-gray-400 hover:border-green-500 hover:text-green-400'
                  : 'border-gray-300 text-gray-600 hover:border-green-500 hover:text-green-600'
              }`}
            >
              + Add Another Challenge
            </button>
          </div>
        )}
      </div>

      {/* Wellness Outcomes */}
      <div>
        <label
          className={`block text-lg font-semibold mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What's the most important outcome you want to achieve in the next 90 days? <span className="text-gray-400">(Select all that apply)</span>
        </label>
        <div className="grid gap-2">
          {outcomeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleOutcomeToggle(option.value)}
              className={`p-3 rounded-lg border-2 text-left transition-all duration-200 ${
                data.wellnessOutcomes?.includes(option.value)
                  ? isDarkMode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-blue-500 bg-blue-50'
                  : isDarkMode
                  ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 mr-3 transition-all duration-200 flex items-center justify-center ${
                    data.wellnessOutcomes?.includes(option.value)
                      ? 'border-blue-500 bg-blue-500'
                      : isDarkMode
                      ? 'border-gray-500'
                      : 'border-gray-300'
                  }`}
                >
                  {data.wellnessOutcomes?.includes(option.value) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className={`text-sm transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  {option.label}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Conditional "Other" text inputs for outcomes */}
        {data.wellnessOutcomes?.includes('other') && (
          <div className="mt-3 space-y-2">
            {(data.otherOutcomeTexts || ['']).map((text, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => handleOtherOutcomeTextChange(index, e.target.value)}
                  placeholder="Please specify your desired outcome..."
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  }`}
                />
                {(data.otherOutcomeTexts || []).length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOtherOutcomeText(index)}
                    className={`px-3 py-2 rounded-lg transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-red-100 text-red-600 hover:bg-red-200'
                    }`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOtherOutcomeText}
              className={`w-full py-2 px-4 rounded-lg border-2 border-dashed transition-all duration-200 ${
                isDarkMode
                  ? 'border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-400'
                  : 'border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-600'
              }`}
            >
              + Add Another Outcome
            </button>
          </div>
        )}
      </div>

      {/* Next Button */}
      <div className="pt-4">
        <button
          type="button"
          onClick={validateAndProceed}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
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

export default Step1QualifyingQuestions;
