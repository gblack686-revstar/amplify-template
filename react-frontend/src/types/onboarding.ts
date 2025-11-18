// Onboarding Types and Interfaces

export type WellnessGoal = 'weight_management' | 'stress_reduction' | 'energy_improvement' | 'sleep_quality' | 'fitness_goals' | 'nutrition_improvement';
export type WellnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'separated' | 'domestic_partnership';
export type SupportSystemType = 'family_nearby' | 'professional_help' | 'community_support' | 'online_support' | 'limited_support';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';
export type WellnessActivityType = 'nutrition_counseling' | 'personal_training' | 'mindfulness_coaching' | 'sleep_therapy' | 'stress_management' | 'lifestyle_coaching';

// New types for onboarding questions
export type HealthChallenge =
  | 'nutrition'
  | 'exercise'
  | 'sleep'
  | 'stress'
  | 'work_life_balance'
  | 'consistency'
  | 'motivation'
  | 'other';

export type WellnessOutcome =
  | 'feel_healthier'
  | 'build_habits'
  | 'reduce_stress'
  | 'reach_goals'
  | 'support_system'
  | 'other';

export interface WellnessActivity {
  type: WellnessActivityType;
  frequency: string;
  provider?: string;
  startDate?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface FamilyMember {
  name: string;
  relationship: string;
  age: string;
}

export interface DependentProfile {
  name: string; // Required field
  age: number;
  healthGoalsStartDate: string;
  wellnessLevel: WellnessLevel;
  activityLevel: ActivityLevel;
  currentActivities: WellnessActivity[];
  favoriteActivities?: string[];
  wellnessPreferences?: string[];
}

export interface UserProfile {
  maritalStatus: MaritalStatus;
  numberOfDependents: number;
  location: string;
  supportSystemTypes: SupportSystemType[];
  preferredCommunicationTime?: string[];
  emergencyContacts?: EmergencyContact[];
}

export interface OnboardingState {
  currentStep: number;
  totalSteps: number;

  // Step 1: Qualifying Questions
  dependentName?: string; // Required for validation but optional in state
  wellnessGoal?: WellnessGoal;
  wellnessLevel?: WellnessLevel;
  location?: string;
  healthChallenges?: HealthChallenge[];
  otherChallengeTexts?: string[]; // Multiple custom texts when "Other" is selected in challenges
  wellnessOutcomes?: WellnessOutcome[];
  otherOutcomeTexts?: string[]; // Multiple custom texts when "Other" is selected in outcomes

  // Step 2: User Profile
  maritalStatus?: MaritalStatus;
  numberOfDependents?: number;
  familyMemberAges?: string; // Deprecated: Comma-separated ages of all family members
  familyMembers?: FamilyMember[]; // New structured family members list
  supportSystemTypes?: SupportSystemType[];
  preferredCommunicationTime?: string[];

  // Step 3: Dependent Profile Details
  age?: number; // Dependent's current age
  healthGoalsStartDate?: string; // Date when health goals started
  activityLevel?: ActivityLevel;
  favoriteActivities?: string[];
  wellnessPreferences?: string[];

  // Step 4: Wellness Activities
  currentActivities?: WellnessActivity[];

  // Step 5: First recommendation
  firstRecommendation?: any;
}

export interface FamilyProfilePayload {
  marital_status: MaritalStatus;
  number_of_dependents: number;
  location: string;
  family_member_ages?: string; // Deprecated - keeping for backward compatibility
  family_members?: Array<{ name: string; relationship: string; age: string }>;
  support_system_type: SupportSystemType[];
  preferred_communication_time?: string[];
  emergency_contacts?: EmergencyContact[];
  health_challenges?: HealthChallenge[];
  other_challenge_texts?: string[];
  wellness_outcomes?: WellnessOutcome[];
  other_outcome_texts?: string[];
  dependents: Array<{
    name: string;
    age: number;
    health_goals_start_date: string;
    wellness_level: WellnessLevel;
    activity_level: ActivityLevel;
    current_activities: Array<{
      type: WellnessActivityType;
      frequency: string;
      provider?: string;
      start_date?: string;
    }>;
    favorite_activities?: string[];
    wellness_preferences?: string[];
  }>;
}

export interface StepProps {
  data: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export interface RecommendationResponse {
  title: string;
  description: string;
  category: string;
  helpfulCount?: number;
  source?: string;
}
