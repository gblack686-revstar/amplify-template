/**
 * Label mappings for enum values to human-readable text
 */

export const challengeLabels: { [key: string]: string } = {
  nutrition: 'Nutrition & Healthy Eating',
  exercise: 'Exercise & Physical Activity',
  sleep: 'Sleep Quality',
  stress: 'Stress Management',
  work_life_balance: 'Work-Life Balance',
  consistency: 'Staying Consistent',
  motivation: 'Motivation & Accountability',
  other: 'Other',
};

export const outcomeLabels: { [key: string]: string } = {
  feel_healthier: 'Feel Healthier and More Energetic',
  build_habits: 'Build Sustainable Healthy Habits',
  reduce_stress: 'Reduce Stress and Improve Mental Health',
  reach_goals: 'Reach Specific Health/Fitness Goals',
  support_system: 'Build a Support System',
  other: 'Other',
};

export const wellnessGoalLabels: { [key: string]: string } = {
  weight_management: 'Weight Management',
  stress_reduction: 'Stress Reduction',
  energy_improvement: 'Energy & Vitality',
  sleep_quality: 'Sleep Quality',
  fitness_goals: 'Fitness Goals',
  nutrition_improvement: 'Nutrition Improvement',
};

export const wellnessLevelLabels: { [key: string]: string } = {
  beginner: 'Beginner - Just Starting My Wellness Journey',
  intermediate: 'Intermediate - Have Some Healthy Habits',
  advanced: 'Advanced - Actively Working on Wellness Goals',
};

export const maritalStatusLabels: { [key: string]: string } = {
  single: 'Single',
  married: 'Married',
  divorced: 'Divorced',
  widowed: 'Widowed',
  separated: 'Separated',
  domestic_partnership: 'Domestic Partnership',
};

export const supportSystemLabels: { [key: string]: string } = {
  family_nearby: 'Family Nearby',
  professional_help: 'Professional Help',
  community_support: 'Community Support',
  online_support: 'Online Support',
  limited_support: 'Limited Support',
};

export const activityLevelLabels: { [key: string]: string } = {
  sedentary: 'Sedentary - Minimal physical activity',
  lightly_active: 'Lightly Active - Light exercise 1-3 days/week',
  moderately_active: 'Moderately Active - Moderate exercise 3-5 days/week',
  very_active: 'Very Active - Intense exercise 6-7 days/week',
};

export const wellnessActivityLabels: { [key: string]: string } = {
  nutrition_counseling: 'Nutrition Counseling',
  personal_training: 'Personal Training',
  mindfulness_coaching: 'Mindfulness/Meditation Coaching',
  sleep_therapy: 'Sleep Therapy',
  stress_management: 'Stress Management',
  lifestyle_coaching: 'Lifestyle Coaching',
};

/**
 * Format any label value to human-readable text
 * Uses specific mappings when available, falls back to generic formatting
 */
export function formatLabel(value: string, type?: string): string {
  if (!value) return 'N/A';

  // Check specific mapping based on type
  if (type === 'challenge' && challengeLabels[value]) {
    return challengeLabels[value];
  }
  if (type === 'outcome' && outcomeLabels[value]) {
    return outcomeLabels[value];
  }
  if (type === 'wellnessGoal' && wellnessGoalLabels[value]) {
    return wellnessGoalLabels[value];
  }
  if (type === 'wellnessLevel' && wellnessLevelLabels[value]) {
    return wellnessLevelLabels[value];
  }
  if (type === 'maritalStatus' && maritalStatusLabels[value]) {
    return maritalStatusLabels[value];
  }
  if (type === 'supportSystem' && supportSystemLabels[value]) {
    return supportSystemLabels[value];
  }
  if (type === 'activityLevel' && activityLevelLabels[value]) {
    return activityLevelLabels[value];
  }
  if (type === 'wellnessActivity' && wellnessActivityLabels[value]) {
    return wellnessActivityLabels[value];
  }

  // Try all mappings if no type specified
  const allLabels = {
    ...challengeLabels,
    ...outcomeLabels,
    ...wellnessGoalLabels,
    ...wellnessLevelLabels,
    ...maritalStatusLabels,
    ...supportSystemLabels,
    ...activityLevelLabels,
    ...wellnessActivityLabels,
  };

  if (allLabels[value]) {
    return allLabels[value];
  }

  // Fallback to generic formatting
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
