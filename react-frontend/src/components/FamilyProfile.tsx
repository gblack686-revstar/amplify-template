import React, { useState, useEffect } from 'react';
import { X, User, MapPin, Users, Heart, Calendar, Stethoscope, School, Smile, AlertTriangle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ProfileService from '../services/profileService';
import { formatLabel as formatLabelUtil } from '../utils/labelMappings';

interface FamilyProfileProps {
  isOpen: boolean;
  onClose: () => void;
}

const FamilyProfile: React.FC<FamilyProfileProps> = ({ isOpen, onClose }) => {
  const { isDarkMode } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
    }
  }, [isOpen]);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ProfileService.getProfile();
      console.log('Profile data received:', data);

      // Handle different response formats from backend
      if (data && data.profile) {
        // Backend returns { userId, profile: {...}, createdAt, updatedAt }
        setProfile(data.profile);
        // Cache profile data in localStorage for offline/expired token scenarios
        localStorage.setItem('cached_profile', JSON.stringify(data.profile));
      } else if (data) {
        // Direct profile object
        setProfile(data);
        localStorage.setItem('cached_profile', JSON.stringify(data));
      } else {
        setError('No profile data found. Please complete onboarding first.');
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);

      // If 401 (expired token), try to use cached profile
      if (err.message?.includes('401')) {
        const cachedProfile = localStorage.getItem('cached_profile');
        if (cachedProfile) {
          try {
            setProfile(JSON.parse(cachedProfile));
            setError('Showing cached profile (authentication expired). Some data may be outdated.');
          } catch {
            setError('Authentication expired. Please log in again to view your profile.');
          }
        } else {
          setError('Authentication expired. Please log in again to view your profile.');
        }
      } else {
        setError(err.message || 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  // Use imported formatLabel utility with proper label mappings
  const formatLabel = formatLabelUtil;

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div
        className={`w-full max-w-3xl rounded-2xl shadow-2xl transition-all duration-300 max-h-[90vh] flex flex-col ${
          isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-6 border-b ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <h3
              className={`text-xl font-semibold transition-colors duration-300 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              Family Profile
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : profile ? (
            <div className="space-y-6">
              {/* Show warning banner if there's an error but we have cached profile */}
              {error && (
                <div className={`p-4 rounded-lg border ${
                  isDarkMode
                    ? 'bg-yellow-900/20 border-yellow-700/50 text-yellow-300'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                }`}>
                  <p className="text-sm">{error}</p>
                </div>
              )}
              {/* Parent/Family Information */}
              <div>
                <h4
                  className={`text-lg font-semibold mb-4 flex items-center space-x-2 ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span>Parent & Family Information</span>
                </h4>
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isDarkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        Marital Status
                      </p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {profile.marital_status ? formatLabel(profile.marital_status) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        Number of Children
                      </p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {profile.number_of_children || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p
                      className={`text-xs font-medium mb-1 flex items-center space-x-1 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Location</span>
                    </p>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {profile.location || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p
                      className={`text-xs font-medium mb-1 flex items-center space-x-1 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      <Heart className="w-3 h-3" />
                      <span>Support System</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {profile.support_system_type?.map((type: string, idx: number) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                            isDarkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {formatLabel(type)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {profile.family_members && profile.family_members.length > 0 && (
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        Family Members
                      </p>
                      <div className="space-y-2 mt-2">
                        {profile.family_members.map((member: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-2 rounded-lg text-sm ${
                              isDarkMode ? 'bg-gray-800/50' : 'bg-white border border-gray-200'
                            }`}
                          >
                            <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                              {member.name}
                            </span>
                            <span className={`mx-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>•</span>
                            <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              Age {member.age}
                            </span>
                            {member.gender && (
                              <>
                                <span className={`mx-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>•</span>
                                <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {formatLabel(member.gender)}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.biggest_challenges && profile.biggest_challenges.length > 0 && (
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        Biggest Challenges
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {profile.biggest_challenges
                          .filter((challenge: string) => challenge !== 'other')
                          .map((challenge: string, idx: number) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                                isDarkMode
                                  ? 'bg-green-900/50 text-green-200'
                                  : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {formatLabel(challenge)}
                            </span>
                          ))}
                        {profile.other_challenge_texts && profile.other_challenge_texts.map((text: string, idx: number) => (
                          <span
                            key={`other-${idx}`}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                              isDarkMode
                                ? 'bg-green-900/50 text-green-200'
                                : 'bg-green-100 text-green-800'
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
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        Desired Outcomes
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {profile.desired_outcomes
                          .filter((outcome: string) => outcome !== 'other')
                          .map((outcome: string, idx: number) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                                isDarkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {formatLabel(outcome)}
                            </span>
                          ))}
                        {profile.other_outcome_texts && profile.other_outcome_texts.map((text: string, idx: number) => (
                          <span
                            key={`other-${idx}`}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                              isDarkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800'
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

              {/* Child Profiles */}
              {profile.children?.map((child: any, childIdx: number) => (
                <div key={childIdx}>
                  <h4
                    className={`text-lg font-semibold mb-4 flex items-center space-x-2 ${
                      isDarkMode ? 'text-gray-100' : 'text-gray-900'
                    }`}
                  >
                    <User className="w-5 h-5" />
                    <span>
                      {child.name ? `${child.name}'s Profile` : `Child Profile ${profile.children.length > 1 ? `#${childIdx + 1}` : ''}`}
                    </span>
                  </h4>
                  <div
                    className={`p-4 rounded-xl border space-y-3 ${
                      isDarkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          Current Age
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {child.age ? `${child.age} years` : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 flex items-center space-x-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          <span>Condition Start Date</span>
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {child.condition_start_date ? formatDate(child.condition_start_date) : 'N/A'}
                        </p>
                      </div>
                    </div>
                    {child.condition_age && (
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          Age at Condition Onset
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {child.condition_age} years
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          Support Level
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {child.support_level ? formatLabel(child.support_level) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          Communication Level
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {child.communication_level ? formatLabel(child.communication_level) : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Current Therapies */}
                    {child.current_therapies && child.current_therapies.length > 0 && (
                      <div>
                        <p
                          className={`text-xs font-medium mb-2 flex items-center space-x-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          <Stethoscope className="w-3 h-3" />
                          <span>Current Therapies</span>
                        </p>
                        <div className="space-y-2">
                          {child.current_therapies.map((therapy: any, therapyIdx: number) => (
                            <div
                              key={therapyIdx}
                              className={`p-3 rounded-lg ${
                                isDarkMode ? 'bg-gray-800/50' : 'bg-white border border-gray-200'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p
                                    className={`text-sm font-medium ${
                                      isDarkMode ? 'text-gray-200' : 'text-gray-800'
                                    }`}
                                  >
                                    {therapy.type ? formatLabel(therapy.type) : 'Unknown Therapy'}
                                  </p>
                                  {therapy.frequency && (
                                    <p
                                      className={`text-xs mt-1 ${
                                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                      }`}
                                    >
                                      {therapy.frequency}
                                    </p>
                                  )}
                                  {therapy.provider && (
                                    <p
                                      className={`text-xs mt-1 ${
                                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                      }`}
                                    >
                                      Provider: {therapy.provider}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* School Status */}
                    {child.school_status && (
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 flex items-center space-x-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          <School className="w-3 h-3" />
                          <span>School Status</span>
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {formatLabel(child.school_status)}
                        </p>
                      </div>
                    )}

                    {/* Favorite Activities */}
                    {child.favorite_activities && child.favorite_activities.length > 0 && (
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 flex items-center space-x-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          <Smile className="w-3 h-3" />
                          <span>Favorite Activities</span>
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {child.favorite_activities.map((activity: string, idx: number) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                                isDarkMode
                                  ? 'bg-purple-900/50 text-purple-200'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {activity}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Triggers */}
                    {child.triggers && child.triggers.length > 0 && (
                      <div>
                        <p
                          className={`text-xs font-medium mb-1 flex items-center space-x-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Triggers</span>
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {child.triggers.map((trigger: string, idx: number) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
                                isDarkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {trigger}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{error}</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                No profile data available. Please complete onboarding first.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`p-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}
        >
          <button
            onClick={onClose}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FamilyProfile;
