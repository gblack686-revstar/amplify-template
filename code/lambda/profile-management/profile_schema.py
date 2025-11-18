from typing import List, Optional, Dict
from enum import Enum
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, time


class MaritalStatus(str, Enum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"
    SEPARATED = "separated"
    DOMESTIC_PARTNERSHIP = "domestic_partnership"


class SupportSystemType(str, Enum):
    FAMILY_NEARBY = "family_nearby"
    PROFESSIONAL_HELP = "professional_help"
    COMMUNITY_SUPPORT = "community_support"
    ONLINE_SUPPORT = "online_support"
    LIMITED_SUPPORT = "limited_support"


class WellnessLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class WellnessGoal(str, Enum):
    WEIGHT_MANAGEMENT = "weight_management"
    FITNESS_IMPROVEMENT = "fitness_improvement"
    STRESS_REDUCTION = "stress_reduction"
    BETTER_SLEEP = "better_sleep"
    NUTRITION_IMPROVEMENT = "nutrition_improvement"
    ENERGY_BOOST = "energy_boost"


class Challenge(str, Enum):
    NUTRITION = "nutrition"
    EXERCISE = "exercise"
    SLEEP = "sleep"
    STRESS = "stress"
    WORK_LIFE_BALANCE = "work_life_balance"
    CONSISTENCY = "consistency"
    MOTIVATION = "motivation"


class Outcome(str, Enum):
    FEEL_HEALTHIER = "feel_healthier"
    BUILD_HABITS = "build_habits"
    REDUCE_STRESS = "reduce_stress"
    REACH_GOALS = "reach_goals"
    SUPPORT_SYSTEM = "support_system"


class WellnessActivity(str, Enum):
    NUTRITION_COUNSELING = "nutrition_counseling"
    PERSONAL_TRAINING = "personal_training"
    MINDFULNESS_COACHING = "mindfulness_coaching"
    YOGA = "yoga"
    MEDITATION = "meditation"
    SLEEP_COACHING = "sleep_coaching"


class EmergencyContact(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    relationship: str = Field(..., min_length=2, max_length=50)
    phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")
    email: Optional[EmailStr] = None


class Activity(BaseModel):
    type: WellnessActivity
    frequency: str = Field(..., description="E.g., '2x per week', 'daily'")
    provider: Optional[str] = None
    start_date: Optional[datetime] = None


class FamilyMemberProfile(BaseModel):
    # Required fields
    name: str = Field(..., min_length=2, max_length=100, description="Family member's first name")
    age: int = Field(..., ge=0, le=120)
    wellness_level: WellnessLevel
    primary_goals: List[WellnessGoal]
    current_activities: List[Activity]

    # Optional fields
    health_conditions: Optional[List[str]] = None
    dietary_restrictions: Optional[List[str]] = None
    preferred_activities: Optional[List[str]] = None
    challenges: Optional[List[Challenge]] = None

    class Config:
        schema_extra = {
            "example": {
                "name": "Sarah",
                "age": 35,
                "wellness_level": "intermediate",
                "primary_goals": ["fitness_improvement", "stress_reduction"],
                "current_activities": [
                    {
                        "type": "personal_training",
                        "frequency": "3x per week",
                        "provider": "Local Gym"
                    }
                ],
                "health_conditions": ["occasional back pain"],
                "dietary_restrictions": ["vegetarian"],
                "preferred_activities": ["yoga", "hiking", "swimming"],
                "challenges": ["consistency", "work_life_balance"]
            }
        }


class FamilyProfile(BaseModel):
    # Required fields
    marital_status: MaritalStatus
    number_of_children: int = Field(..., ge=1)
    location: str = Field(..., min_length=2, max_length=200)
    support_system_type: List[SupportSystemType]

    # Optional fields
    preferred_communication_time: Optional[List[time]] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None
    onboarding_completed: bool = Field(default=False, description="Whether user has completed onboarding flow")
    biggest_challenges: Optional[List[Challenge]] = None
    other_challenge_text: Optional[str] = None  # Deprecated - use other_challenge_texts
    other_challenge_texts: Optional[List[str]] = None  # Array of custom challenge texts
    desired_outcomes: Optional[List[Outcome]] = None
    other_outcome_text: Optional[str] = None  # Deprecated - use other_outcome_texts
    other_outcome_texts: Optional[List[str]] = None  # Array of custom outcome texts
    family_members_info: Optional[List[Dict[str, str]]] = None

    # Family member wellness profiles
    family_members: List[FamilyMemberProfile]

    class Config:
        schema_extra = {
            "example": {
                "marital_status": "married",
                "number_of_children": 2,
                "location": "Seattle, WA",
                "support_system_type": ["family_nearby", "professional_help"],
                "preferred_communication_time": ["09:00:00", "15:00:00"],
                "emergency_contacts": [
                    {
                        "name": "John Smith",
                        "relationship": "Grandfather",
                        "phone": "+1234567890",
                        "email": "john.smith@email.com"
                    }
                ]
            }
        }
