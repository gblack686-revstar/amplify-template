import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import ProfileService from '../services/profileService';

interface ChildProfile {
  name: string;
  age: number;
  support_level: string;
  communication_level: string;
}

interface UserProfile {
  location: string;
  marital_status: string;
  number_of_children: number;
  support_system_type: string[];
  biggest_challenges?: string[];
  other_challenge_texts?: string[];
  desired_outcomes?: string[];
  other_outcome_texts?: string[];
  children: ChildProfile[];
  onboarding_completed: boolean;
}

interface ProfileContextType {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  getChildName: () => string | null;
  getUserGreeting: () => string;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ProfileService.getProfile();

      if (response && response.profile) {
        setProfile(response.profile);
      } else {
        setProfile(null);
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      setError(err.message || 'Failed to load profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const getChildName = useCallback((): string | null => {
    if (profile && profile.children && profile.children.length > 0) {
      return profile.children[0].name;
    }
    return null;
  }, [profile]);

  const getUserGreeting = useCallback((): string => {
    const childName = getChildName();
    const timeOfDay = new Date().getHours();

    let greeting = 'Good morning';
    if (timeOfDay >= 12 && timeOfDay < 18) {
      greeting = 'Good afternoon';
    } else if (timeOfDay >= 18) {
      greeting = 'Good evening';
    }

    if (childName) {
      return `${greeting}! Let's work together to support ${childName}`;
    }
    return `${greeting}! Welcome to RevStar Wellness Navigator`;
  }, [getChildName]);

  const value: ProfileContextType = useMemo(() => ({
    profile,
    loading,
    error,
    refreshProfile: fetchProfile,
    getChildName,
    getUserGreeting,
  }), [profile, loading, error, getChildName, getUserGreeting]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};

export default ProfileContext;
