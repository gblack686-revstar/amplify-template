import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { StepProps, SchoolStatus } from '../../types/onboarding';

const Step3ChildProfile: React.FC<StepProps> = ({ data, onUpdate, onNext, onBack }) => {
  const { isDarkMode } = useTheme();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [activityInput, setActivityInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');

  const schoolOptions: { value: SchoolStatus; label: string }[] = [
    { value: 'public_school', label: 'Public School' },
    { value: 'private_school', label: 'Private School' },
    { value: 'special_education', label: 'Special Education' },
    { value: 'homeschool', label: 'Homeschool' },
    { value: 'hybrid', label: 'Hybrid' },
  ];

  const handleDiagnosisAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const sanitized = e.target.value.replace(/\D/g, '');

    if (sanitized === '') {
      onUpdate({ diagnosisAge: undefined });
      return;
    }

    const value = parseInt(sanitized, 10);
    if (!isNaN(value) && value >= 0 && value <= 99) {
      onUpdate({ diagnosisAge: value });
      setErrors((prev) => ({ ...prev, diagnosisAge: '' }));
    }
  };

  const handleSchoolStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ schoolStatus: e.target.value as SchoolStatus });
  };

  const handleAddActivity = () => {
    if (activityInput.trim()) {
      const currentActivities = data.favoriteActivities || [];
      onUpdate({ favoriteActivities: [...currentActivities, activityInput.trim()] });
      setActivityInput('');
    }
  };

  const handleRemoveActivity = (index: number) => {
    const currentActivities = data.favoriteActivities || [];
    onUpdate({
      favoriteActivities: currentActivities.filter((_, i) => i !== index),
    });
  };

  const handleAddTrigger = () => {
    if (triggerInput.trim()) {
      const currentTriggers = data.triggers || [];
      onUpdate({ triggers: [...currentTriggers, triggerInput.trim()] });
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (index: number) => {
    const currentTriggers = data.triggers || [];
    onUpdate({
      triggers: currentTriggers.filter((_, i) => i !== index),
    });
  };

  const validateAndProceed = () => {
    const newErrors: { [key: string]: string } = {};

    if (!data.diagnosisAge && data.diagnosisAge !== 0) {
      newErrors.diagnosisAge = 'Please enter the age at diagnosis';
    }
    if (data.diagnosisAge !== undefined && data.age !== undefined && data.diagnosisAge > data.age) {
      newErrors.diagnosisAge = 'Diagnosis age cannot be greater than current age';
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
    <div className="space-y-6">
      {/* Diagnosis Age */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          At what age was your child diagnosed? <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={data.diagnosisAge !== undefined ? data.diagnosisAge : ''}
          onChange={handleDiagnosisAgeChange}
          placeholder="Enter age at diagnosis"
          maxLength={2}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            errors.diagnosisAge
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {errors.diagnosisAge && (
          <p className="mt-2 text-sm text-red-500">{errors.diagnosisAge}</p>
        )}
        <p
          className={`mt-2 text-sm transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          This helps us provide age-appropriate recommendations
        </p>
      </div>

      {/* School Status */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is your child's school status? <span className="text-gray-400">(Optional)</span>
        </label>
        <select
          value={data.schoolStatus || ''}
          onChange={handleSchoolStatusChange}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        >
          <option value="">Select school status</option>
          {schoolOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Favorite Activities */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What are your child's favorite activities? <span className="text-gray-400">(Optional)</span>
        </label>
        <p
          className={`text-sm mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          This helps us provide more personalized recommendations
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={activityInput}
            onChange={(e) => setActivityInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddActivity()}
            placeholder="e.g., puzzles, music, trains"
            className={`flex-1 px-4 py-2 rounded-lg border transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
            }`}
          />
          <button
            type="button"
            onClick={handleAddActivity}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              isDarkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Add
          </button>
        </div>
        {data.favoriteActivities && data.favoriteActivities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.favoriteActivities.map((activity, index) => (
              <span
                key={index}
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                  isDarkMode
                    ? 'bg-blue-900/50 text-blue-200'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {activity}
                <button
                  type="button"
                  onClick={() => handleRemoveActivity(index)}
                  className="ml-2 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Triggers */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What are your child's triggers? <span className="text-gray-400">(Optional)</span>
        </label>
        <p
          className={`text-sm mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Things that may cause stress or difficulty
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={triggerInput}
            onChange={(e) => setTriggerInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTrigger()}
            placeholder="e.g., loud noises, bright lights"
            className={`flex-1 px-4 py-2 rounded-lg border transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
            }`}
          />
          <button
            type="button"
            onClick={handleAddTrigger}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              isDarkMode
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`}
          >
            Add
          </button>
        </div>
        {data.triggers && data.triggers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.triggers.map((trigger, index) => (
              <span
                key={index}
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                  isDarkMode
                    ? 'bg-purple-900/50 text-purple-200'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                {trigger}
                <button
                  type="button"
                  onClick={() => handleRemoveTrigger(index)}
                  className="ml-2 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
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

export default Step3ChildProfile;
