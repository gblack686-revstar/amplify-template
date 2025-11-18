// Onboarding Types and Interfaces

// Communication & Development Types
export type CommunicationLevel = 'verbal' | 'non_verbal' | 'minimally_verbal';
export type SupportLevel = 'mild' | 'moderate' | 'severe';

// Family & Support Types
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'separated' | 'domestic_partnership';
export type SupportSystemType = 'family_nearby' | 'professional_help' | 'community_support' | 'online_support' | 'limited_support';
export type EducationStatus = 'public_school' | 'private_school' | 'special_education' | 'homeschool' | 'hybrid';
export type SupportServiceType = 'aba' | 'speech' | 'occupational' | 'physical' | 'behavioral' | 'developmental';

// Legacy wellness types (kept for backward compatibility)
export type WellnessGoal = 'weight_management' | 'stress_reduction' | 'energy_improvement' | 'sleep_quality' | 'fitness_goals' | 'nutrition_improvement';
export type WellnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';
export type WellnessActivityType = 'nutrition_counseling' | 'personal_training' | 'mindfulness_coaching' | 'sleep_therapy' | 'stress_management' | 'lifestyle_coaching';

// Wellness Challenge Types
export type WellnessChallenge =
  | 'communication_speech'
  | 'behavior_regulation'
  | 'sensory_sensitivities'
  | 'social_skills'
  | 'daily_living_skills'
  | 'school_iep'
  | 'transition_planning'
  | 'other';

// Goal Types
export type WellnessGoalType =
  | 'feel_confident'
  | 'improve_skills'
  | 'organize_therapies'
  | 'build_support'
  | 'explore_breakthroughs'
  | 'other';

// Legacy type aliases for backward compatibility
export type VerbalStatus = CommunicationLevel;
export type AutismSeverity = SupportLevel;
export type SchoolStatus = EducationStatus;
export type TherapyType = SupportServiceType;
export type BiggestChallenge = WellnessChallenge;
export type DesiredOutcome = WellnessGoalType;

// Legacy health challenge type (kept for backward compatibility)
export type HealthChallenge =
  | 'nutrition'
  | 'exercise'
  | 'sleep'
  | 'stress'
  | 'work_life_balance'
  | 'consistency'
  | 'motivation'
  | 'other';

// Legacy wellness outcome type (kept for backward compatibility)
export type WellnessOutcome =
  | 'feel_healthier'
  | 'build_habits'
  | 'reduce_stress'
  | 'reach_goals'
  | 'support_system'
  | 'other';

// Support Service Interface
export interface SupportService {
  type: SupportServiceType;
  frequency: string;
  provider?: string;
  startDate?: string;
}

// Legacy alias for backward compatibility
export interface Therapy extends SupportService {}

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
  childName?: string; // Alias for dependentName for child-focused apps
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
  numberOfChildren?: number; // Alias for numberOfDependents for child-focused apps
  familyMemberAges?: string; // Deprecated: Comma-separated ages of all family members
  familyMembers?: FamilyMember[]; // New structured family members list
  supportSystemTypes?: SupportSystemType[];
  preferredCommunicationTime?: string[];

  // Step 3: Dependent Profile Details
  age?: number; // Dependent's current age
  healthGoalsStartDate?: string; // Date when health goals started
  diagnosisAge?: number; // Age at diagnosis (for child-focused apps)
  activityLevel?: ActivityLevel;
  favoriteActivities?: string[];
  wellnessPreferences?: string[];

  // Child-specific profile fields
  autismSeverity?: AutismSeverity; // Autism severity level
  verbalStatus?: VerbalStatus; // Communication/verbal status
  schoolStatus?: SchoolStatus; // School enrollment status
  triggers?: string[]; // Known triggers for the child

  // Step 4: Wellness Activities / Support Services
  currentActivities?: WellnessActivity[];
  currentTherapies?: Therapy[]; // Current therapies (for child-focused apps)

  // Legacy field aliases for backward compatibility
  biggestChallenges?: BiggestChallenge[]; // Alias for healthChallenges
  desiredOutcomes?: DesiredOutcome[]; // Alias for wellnessOutcomes

  // Step 5: First recommendation
  firstRecommendation?: any;
}

export interface FamilyProfilePayload {
  marital_status: MaritalStatus;
  number_of_dependents?: number; // For wellness apps
  number_of_children?: number; // For child-focused apps
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
  biggest_challenges?: BiggestChallenge[]; // For child-focused apps
  desired_outcomes?: DesiredOutcome[]; // For child-focused apps

  // Wellness app dependents structure
  dependents?: Array<{
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

  // Child-focused app children structure
  children?: Array<{
    name: string;
    age: number;
    condition_start_date: string;
    condition_age?: number;
    support_level: SupportLevel;
    communication_level: CommunicationLevel;
    current_services: Array<{
      type: SupportServiceType;
      frequency: string;
      provider?: string;
      start_date?: string;
    }>;
    education_status?: EducationStatus;
    favorite_activities?: string[];
    triggers?: string[];
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
