import React, { useState, useEffect } from 'react';
import OnboardingLayout from './OnboardingLayout';
import Step1QualifyingQuestions from './OnboardingSteps/Step1QualifyingQuestions';
import Step2ParentProfile from './OnboardingSteps/Step2ParentProfile';
import Step3ChildProfile from './OnboardingSteps/Step3ChildProfile';
import Step4Interventions from './OnboardingSteps/Step4Interventions';
import Step5WowMoment from './OnboardingSteps/Step5WowMoment';
import QuickWinModal from './QuickWinModal';
import { OnboardingState, FamilyProfilePayload } from '../types/onboarding';
import ProfileService from '../services/profileService';
import RoadmapService, { RoadmapItem } from '../services/roadmapService';

interface OnboardingProps {
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const TOTAL_STEPS = 5;
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickWin, setShowQuickWin] = useState(false);
  const [quickWinRecommendation, setQuickWinRecommendation] = useState<Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'thumbsUpGiven'> | null>(null);
  const [generatingQuickWin, setGeneratingQuickWin] = useState(false);

  const [data, setData] = useState<OnboardingState>({
    currentStep: 1,
    totalSteps: TOTAL_STEPS,
  });

  // Load saved progress from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('onboarding_progress');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setData(parsed);
        setCurrentStep(parsed.currentStep || 1);
      } catch (err) {
        console.error('Error loading onboarding progress:', err);
      }
    }
  }, []);

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem('onboarding_progress', JSON.stringify(data));
  }, [data]);

  const handleUpdate = (updates: Partial<OnboardingState>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = async () => {
    setError(null);

    // If moving from step 4 to step 5, save profile (no recommendation yet - will show after docs are uploaded)
    if (currentStep === 4) {
      setIsLoading(true);
      try {
        // Build profile payload
        const profilePayload = buildProfilePayload();

        // Save profile only
        await ProfileService.createOrUpdateProfile(profilePayload);

        // Move to step 5 without recommendation
        setCurrentStep(5);
        setData((prev) => ({ ...prev, currentStep: 5 }));
      } catch (err: any) {
        console.error('Error saving profile:', err);
        setError(err.message || 'Failed to save profile. Please try again.');
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    } else if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      setData((prev) => ({ ...prev, currentStep: currentStep + 1 }));
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      setData((prev) => ({ ...prev, currentStep: currentStep - 1 }));
    }
  };

  const handleComplete = async () => {
    // Prevent multiple simultaneous calls
    if (generatingQuickWin) {
      console.log('[ONBOARDING] Already generating, ignoring duplicate call');
      return;
    }

    setGeneratingQuickWin(true);

    try {
      // Mark onboarding as complete in backend
      await ProfileService.markOnboardingComplete();

      // Get the saved profile for quick win generation
      const profile = await ProfileService.getProfile();

      // Step 1: Create 3 static starter recommendations
      console.log('[ONBOARDING] Creating 3 starter roadmap items...');
      try {
        const startDate = new Date();
        const starterItems = [
          {
            title: 'Establish consistent daily routine',
            description: 'Create predictable daily schedules with visual supports to help your child understand what to expect throughout the day.',
            category: 'daily_skills' as const,
            status: 'not_started' as const,
            dueDate: new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            notes: ['Start with morning and bedtime routines', 'Use visual schedules', 'Track progress daily']
          },
          {
            title: 'Practice requesting help appropriately',
            description: 'Teach and reinforce using "help please" or alternative communication methods in various situations.',
            category: 'communication' as const,
            status: 'not_started' as const,
            dueDate: new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            notes: ['Use visual cue cards', 'Reward successful attempts', 'Practice in multiple settings']
          },
          {
            title: 'Arrange structured playdate with peer',
            description: 'Set up a short, structured playdate to work on social interaction skills in a controlled environment.',
            category: 'social' as const,
            status: 'not_started' as const,
            dueDate: new Date(startDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            notes: ['Choose a familiar peer', 'Plan structured activities', 'Keep it short (30-45 minutes)']
          }
        ];

        await RoadmapService.createRoadmap(starterItems);
        console.log('[ONBOARDING] Successfully created 3 starter items');
      } catch (starterError) {
        console.error('[ONBOARDING] Error creating starter items:', starterError);
        // Continue even if starter creation fails
      }

      // Step 2: Generate personalized quick win recommendation
      console.log('[ONBOARDING] Generating personalized quick win...');
      console.log('[ONBOARDING] Profile data:', JSON.stringify(profile.profile, null, 2));

      try {
        const recommendation = await RoadmapService.generateQuickWin(profile.profile);
        console.log('[ONBOARDING] Quick win generated:', recommendation);
        setQuickWinRecommendation(recommendation);
        setGeneratingQuickWin(false); // Stop spinner BEFORE showing modal
        setShowQuickWin(true);
        console.log('[ONBOARDING] Quick win modal should now be visible');
        // DO NOT call onComplete() here - wait for user to close modal
      } catch (quickWinError) {
        console.error('[ONBOARDING] Error generating quick win:', quickWinError);
        // If quick win fails, just complete onboarding gracefully
        // User still has 3 starter items
        setGeneratingQuickWin(false);
        localStorage.removeItem('onboarding_progress');
        onComplete();
      }
    } catch (error) {
      console.error('[ONBOARDING] Error completing onboarding:', error);
      // Continue even if there's an error
      setGeneratingQuickWin(false);
      localStorage.removeItem('onboarding_progress');
      onComplete();
    }
  };

  const handleQuickWinClose = () => {
    setShowQuickWin(false);
    // Clear progress and complete onboarding
    localStorage.removeItem('onboarding_progress');
    onComplete();
  };

  const buildProfilePayload = (): FamilyProfilePayload => {
    // Calculate approximate diagnosis date from diagnosis age
    const calculateDiagnosisDate = (currentAge: number, diagnosisAge: number): string => {
      const currentDate = new Date();
      const yearsSinceDiagnosis = currentAge - diagnosisAge;
      const diagnosisDate = new Date(currentDate);
      diagnosisDate.setFullYear(currentDate.getFullYear() - yearsSinceDiagnosis);
      return diagnosisDate.toISOString();
    };

    return {
      marital_status: data.maritalStatus!,
      number_of_children: data.numberOfChildren!,
      location: data.location!,
      family_members: data.familyMembers,
      support_system_type: data.supportSystemTypes || [],
      preferred_communication_time: data.preferredCommunicationTime,
      biggest_challenges: data.biggestChallenges,
      other_challenge_texts: data.otherChallengeTexts,
      desired_outcomes: data.desiredOutcomes,
      other_outcome_texts: data.otherOutcomeTexts,
      children: [
        {
          name: data.childName!,
          age: data.age!,
          diagnosis_date: calculateDiagnosisDate(data.age!, data.diagnosisAge!),
          diagnosis_age: data.diagnosisAge,
          autism_severity: data.autismSeverity!,
          verbal_status: data.verbalStatus!,
          current_therapies:
            data.currentTherapies?.map((t) => ({
              type: t.type,
              frequency: t.frequency,
              provider: t.provider,
              start_date: t.startDate,
            })) || [],
          school_status: data.schoolStatus,
          favorite_activities: data.favoriteActivities,
          triggers: data.triggers,
        },
      ],
    };
  };

  const stepTitles = [
    { title: 'Quick Questions', subtitle: 'Let\'s get to know your family' },
    { title: 'Family Profile', subtitle: 'Tell us about your family structure and support' },
    { title: 'Child Profile', subtitle: 'Help us understand your child better' },
    { title: 'Current Interventions', subtitle: 'What therapies is your child receiving?' },
    ];

  const renderStep = () => {
    const stepProps = {
      data,
      onUpdate: handleUpdate,
      onNext: handleNext,
      onBack: handleBack,
    };

    switch (currentStep) {
      case 1:
        return <Step1QualifyingQuestions {...stepProps} />;
      case 2:
        return <Step2ParentProfile {...stepProps} />;
      case 3:
        return <Step3ChildProfile {...stepProps} />;
      case 4:
        return <Step4Interventions {...stepProps} />;
      case 5:
        return (
          <Step5WowMoment
            childName={data.childName}
            onComplete={handleComplete}
            onBack={handleBack}
            isProcessing={generatingQuickWin}
          />
        );
      default:
        return <Step1QualifyingQuestions {...stepProps} />;
    }
  };

  return (
    <>
      <OnboardingLayout
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        title={currentStep <= 4 ? stepTitles[currentStep - 1].title : ''}
        subtitle={currentStep <= 4 ? stepTitles[currentStep - 1].subtitle : ''}
      >
        {isLoading || generatingQuickWin ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-lg text-gray-500">
                {generatingQuickWin ? 'Generating your personalized quick win...' : 'Saving your profile...'}
              </p>
              <p className="text-sm text-gray-400 mt-2">This may take a moment</p>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            )}
            {renderStep()}
          </>
        )}
      </OnboardingLayout>

      {/* Quick Win Modal */}
      {showQuickWin && quickWinRecommendation && (
        <QuickWinModal
          recommendation={quickWinRecommendation}
          childName={data.childName || 'your child'}
          onClose={handleQuickWinClose}
          onAddedToRoadmap={() => {
            // Optionally refresh roadmap or show success message
            console.log('Quick win added to roadmap');
          }}
        />
      )}
    </>
  );
};

export default Onboarding;
