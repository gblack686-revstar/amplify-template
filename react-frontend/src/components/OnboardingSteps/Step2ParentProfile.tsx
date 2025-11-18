import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { StepProps, MaritalStatus, SupportSystemType } from '../../types/onboarding';
import AddFamilyMemberModal from '../AddFamilyMemberModal';

const Step2ParentProfile: React.FC<StepProps> = ({ data, onUpdate, onNext, onBack }) => {
  const { isDarkMode } = useTheme();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  const maritalOptions: { value: MaritalStatus; label: string }[] = [
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married' },
    { value: 'divorced', label: 'Divorced' },
    { value: 'widowed', label: 'Widowed' },
    { value: 'separated', label: 'Separated' },
    { value: 'domestic_partnership', label: 'Domestic Partnership' },
  ];

  const supportOptions: { value: SupportSystemType; label: string; description: string }[] = [
    { value: 'family_nearby', label: 'Family Nearby', description: 'Close family members in the area' },
    { value: 'professional_help', label: 'Professional Help', description: 'Therapists, counselors, caregivers' },
    { value: 'community_support', label: 'Community Support', description: 'Local support groups or organizations' },
    { value: 'online_support', label: 'Online Support', description: 'Virtual communities and forums' },
    { value: 'limited_support', label: 'Limited Support', description: 'Few or no support resources available' },
  ];

  const handleMaritalStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ maritalStatus: e.target.value as MaritalStatus });
    setErrors((prev) => ({ ...prev, maritalStatus: '' }));
  };

  const handleNumberOfChildrenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      onUpdate({ numberOfChildren: value });
      setErrors((prev) => ({ ...prev, numberOfChildren: '' }));
    } else if (e.target.value === '') {
      onUpdate({ numberOfChildren: undefined });
    }
  };

  const handleAddFamilyMember = (member: { name: string; relationship: string; age: string }) => {
    const currentMembers = data.familyMembers || [];
    onUpdate({ familyMembers: [...currentMembers, member] });
  };

  const handleRemoveFamilyMember = (index: number) => {
    const currentMembers = data.familyMembers || [];
    onUpdate({ familyMembers: currentMembers.filter((_, i) => i !== index) });
  };

  const handleSupportToggle = (supportType: SupportSystemType) => {
    const currentSupport = data.supportSystemTypes || [];
    const isSelected = currentSupport.includes(supportType);

    const newSupport = isSelected
      ? currentSupport.filter((s) => s !== supportType)
      : [...currentSupport, supportType];

    onUpdate({ supportSystemTypes: newSupport });
    setErrors((prev) => ({ ...prev, supportSystemTypes: '' }));
  };

  const validateAndProceed = () => {
    const newErrors: { [key: string]: string } = {};

    if (!data.maritalStatus) {
      newErrors.maritalStatus = 'Please select your marital status';
    }
    if (!data.numberOfChildren || data.numberOfChildren < 1) {
      newErrors.numberOfChildren = 'Please enter the number of children';
    }
    if (!data.supportSystemTypes || data.supportSystemTypes.length === 0) {
      newErrors.supportSystemTypes = 'Please select at least one support system';
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
      {/* Marital Status */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What is your marital status? <span className="text-red-500">*</span>
        </label>
        <select
          value={data.maritalStatus || ''}
          onChange={handleMaritalStatusChange}
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            errors.maritalStatus
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        >
          <option value="">Select marital status</option>
          {maritalOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.maritalStatus && (
          <p className="mt-2 text-sm text-red-500">{errors.maritalStatus}</p>
        )}
      </div>

      {/* Number of Children */}
      <div>
        <label
          className={`block text-lg font-semibold mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          How many children do you have? <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min="1"
          value={data.numberOfChildren || ''}
          onChange={handleNumberOfChildrenChange}
          placeholder="Enter number of children"
          className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
            errors.numberOfChildren
              ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {errors.numberOfChildren && (
          <p className="mt-2 text-sm text-red-500">{errors.numberOfChildren}</p>
        )}
      </div>

      {/* Family Members */}
      <div>
        <label
          className={`block text-lg font-semibold mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          Family Members, including yourself <span className="text-gray-400">(Optional)</span>
        </label>
        <p
          className={`text-sm mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Add information about family members in your household
        </p>

        {/* Display family members list */}
        {data.familyMembers && data.familyMembers.length > 0 && (
          <div className="mb-4 space-y-2">
            {data.familyMembers.map((member, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    isDarkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {member.relationship || 'Family Member'}
                  </span>
                  <span className={isDarkMode ? 'text-gray-200' : 'text-gray-800'}>
                    {member.name}
                  </span>
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                    Age {member.age}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFamilyMember(index)}
                  className={`p-1 rounded hover:bg-red-500/20 transition-colors ${
                    isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-600 hover:text-red-600'
                  }`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Family Member Button */}
        <button
          type="button"
          onClick={() => setIsAddMemberModalOpen(true)}
          className={`w-full py-3 px-4 rounded-lg border-2 border-dashed font-medium transition-all duration-200 ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:border-blue-500 hover:bg-blue-500/10'
              : 'border-gray-300 text-gray-700 hover:border-blue-500 hover:bg-blue-50'
          }`}
        >
          + Add Family Member
        </button>
      </div>

      {/* Add Family Member Modal */}
      <AddFamilyMemberModal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        onAdd={(member) => {
          handleAddFamilyMember(member);
          setIsAddMemberModalOpen(false);
        }}
      />

      {/* Support System Types */}
      <div>
        <label
          className={`block text-lg font-semibold mb-3 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          What support systems do you have? <span className="text-red-500">*</span>
        </label>
        <p
          className={`text-sm mb-4 transition-colors duration-300 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          Select all that apply
        </p>
        <div className="grid gap-3">
          {supportOptions.map((option) => {
            const isSelected = (data.supportSystemTypes || []).includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSupportToggle(option.value)}
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
        {errors.supportSystemTypes && (
          <p className="mt-2 text-sm text-red-500">{errors.supportSystemTypes}</p>
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

export default Step2ParentProfile;
