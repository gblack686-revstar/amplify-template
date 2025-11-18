# Template Customization Guide

This guide explains how to customize the RevStar Wellness template for your specific use case.

## Overview

This template is pre-configured for a wellness/health application, but the architecture supports any vertical that requires:
- User onboarding and profiling
- AI-powered chat with document knowledge base
- Personalized recommendations/roadmaps
- Document upload and analysis
- Admin dashboard and analytics

## Quick Start Customization Checklist

### 1. Branding & Visual Identity

**Frontend Files to Update:**
- [ ] `react-frontend/public/revstar-logo.jpg` - Replace with your logo
- [ ] `react-frontend/public/manifest.json` - Update app name, short_name, description
- [ ] `react-frontend/public/index.html` - Update title and meta description
- [ ] `react-frontend/src/components/Auth.tsx` - Update welcome text and branding
- [ ] `react-frontend/src/components/GatekeepingPage.tsx` - Update tagline, access code, support email
- [ ] `react-frontend/src/components/Sidebar.tsx` - Update version and branding

**Key Text Replacements:**
- "RevStar Wellness" → Your App Name
- "support@revstar.com" → Your Support Email
- "revstar" (access code) → Your Access Code

### 2. Onboarding Questions

**Customize for Your Vertical:**

The onboarding flow currently asks wellness-focused questions. Modify these files to match your domain:

**Step 1 - Qualifying Questions** (`react-frontend/src/components/OnboardingSteps/Step1QualifyingQuestions.tsx`)
- Wellness goals → Your primary categories
- Wellness levels → Your user segmentation
- Health challenges → Your user pain points
- Wellness outcomes → Your desired user outcomes

**Step 2 - User Profile** (`react-frontend/src/components/OnboardingSteps/Step2UserProfile.tsx`)
- Support system types (can keep as-is or customize)
- Family structure questions

**Step 3 - Dependent/Family Member** (`react-frontend/src/components/OnboardingSteps/Step3ChildProfile.tsx`)
- Rename file if needed (e.g., ClientProfile, StudentProfile)
- Customize profile fields for your use case

**Step 4 - Activities/Services** (`react-frontend/src/components/OnboardingSteps/Step4Interventions.tsx`)
- Wellness activities → Your services/interventions
- Update to match your offerings

**Type Definitions** (`react-frontend/src/types/onboarding.ts`)
- Update all enums to match your domain
- Customize field names and types

**Label Mappings** (`react-frontend/src/utils/labelMappings.ts`)
- Update display labels for all your custom enums

### 3. Backend Schema

**File:** `code/lambda/profile-management/profile_schema.py`

Update Pydantic models to match your frontend:
- Enum values must match frontend exactly
- Add/remove fields as needed
- Update validation rules

**Example Verticals:**

**Education Platform:**
```python
class StudentLevel(str, Enum):
    elementary = "elementary"
    middle_school = "middle_school"
    high_school = "high_school"
    college = "college"

class Subject(str, Enum):
    math = "math"
    science = "science"
    language_arts = "language_arts"
    social_studies = "social_studies"
```

**Business Coaching:**
```python
class BusinessStage(str, Enum):
    idea = "idea"
    startup = "startup"
    growth = "growth"
    established = "established"

class CoachingArea(str, Enum):
    leadership = "leadership"
    sales = "sales"
    operations = "operations"
    finance = "finance"
```

### 4. AI Prompts & Personality

**Query Lambda** (`code/lambda/query/index.py`)
- Lines 144-177: System prompt defines AI personality and expertise
- Update to match your domain knowledge
- Customize response style and tone

**Roadmap Lambda** (`code/lambda/roadmap-transform/index.py`)
- Lines 108-161: Roadmap generation instructions
- Update categories to match your domain
- Customize recommendation examples

**Example System Prompt (Education):**
```python
system_prompt = """You are an expert educational advisor helping students and parents
navigate their academic journey. You provide guidance on:
- Study strategies and learning techniques
- Course selection and academic planning
- College preparation and applications
- Career exploration

Focus on age-appropriate, actionable advice."""
```

### 5. Document Types

**File:** `code/lambda/document-upload/index.py` (Line 171)

Update valid document types:
```python
# Current (Wellness)
valid_types = ['wellness_plan', 'fitness_assessment', 'health_record', 'nutrition_plan', 'other']

# Example (Education)
valid_types = ['transcript', 'report_card', 'test_scores', 'essay', 'recommendation_letter', 'other']

# Example (Business)
valid_types = ['business_plan', 'financial_statement', 'pitch_deck', 'market_research', 'other']
```

### 6. Infrastructure & Configuration

**Environment Variables** (`.env.example`)
- `STACK_NAME` - Update to your project name
- `PROJECT_NAME` - Update to your project name
- Add any vertical-specific variables

**CDK Stack** (`infra/bin/infra.ts`)
- Line 10: Update stack name
- Update tags and descriptions

**Guardrails** (`infra/lib/backend-stack.ts`)
- Lines 87-93: Update content filter descriptions for your domain
- Adjust sensitivity levels if needed

### 7. Legal & Privacy

**Privacy Policy** (`react-frontend/src/content/privacy-policy.ts`)
- Update company name and legal entity
- Customize data collection descriptions
- Update contact information
- Adjust for your compliance requirements (HIPAA, FERPA, GDPR, etc.)

**Terms of Service**
- Update service descriptions
- Adjust liability and warranty clauses
- Customize for your vertical

### 8. Domain-Specific Features

#### For Healthcare/Wellness:
- Keep current wellness schema
- Add HIPAA-specific logging
- Enable encryption for PHI

#### For Education:
- Add FERPA compliance
- Update to student/parent/teacher roles
- Add grade tracking features

#### For Business Coaching:
- Add business metrics tracking
- Customize for B2B use cases
- Add team/organization support

## Configuration Files Reference

| File | Purpose | What to Change |
|------|---------|----------------|
| `.env.example` | Environment config | Stack name, project name, AWS region |
| `infra/bin/infra.ts` | CDK entry point | Stack name |
| `infra/lib/backend-stack.ts` | Main infrastructure | Tags, guardrails, descriptions |
| `react-frontend/public/manifest.json` | PWA config | App name, icons |
| `react-frontend/src/types/onboarding.ts` | TypeScript types | All enums and interfaces |
| `code/lambda/profile-management/profile_schema.py` | Backend validation | Pydantic models |
| `code/lambda/query/index.py` | AI chat logic | System prompts |
| `code/lambda/roadmap-transform/index.py` | Recommendations | Roadmap generation |

## Testing Your Customizations

1. **Type Safety**: Ensure frontend TypeScript types match backend Pydantic models
2. **Label Mappings**: Verify all enum values have corresponding labels
3. **Onboarding Flow**: Test complete flow end-to-end
4. **AI Responses**: Test queries to ensure AI personality matches your domain
5. **Document Upload**: Test with your custom document types
6. **Roadmap Generation**: Verify recommendations are domain-appropriate

## Common Customization Patterns

### Adding New Onboarding Step

1. Create new component in `react-frontend/src/components/OnboardingSteps/`
2. Update `OnboardingLayout.tsx` to include new step
3. Add types to `onboarding.ts`
4. Update backend schema in `profile_schema.py`
5. Update label mappings

### Changing AI Model

Edit `infra/lib/backend-stack.ts`:
```typescript
const modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0' // Or your preferred model
```

### Adding New Document Metadata Fields

1. Update document upload Lambda to capture metadata
2. Update OpenSearch schema if needed for search
3. Update frontend document list to display new fields

## Deployment After Customization

```bash
# 1. Update dependencies
cd react-frontend && npm install && cd ..
cd infra && npm install && cd ..

# 2. Synthesize CDK
cd infra && npm run synth

# 3. Review changes
cdk diff --context environment=dev

# 4. Deploy
cdk deploy --context environment=dev

# 5. Update Amplify environment variables from CDK outputs
```

## Support

For questions about customization:
- Review this guide and [SERVICES.md](SERVICES.md)
- Check existing onboarding implementations
- Contact RevStar team at support@revstar.com

## Examples of Verticals Using This Template

- **Healthcare**: Patient wellness coaching, chronic disease management
- **Education**: Tutoring platform, college counseling, homeschool support
- **Business**: Startup coaching, leadership development, sales training
- **Finance**: Financial planning, investment advisory, debt management
- **Legal**: Legal advice platform, contract review assistance
- **Real Estate**: Home buying guidance, property investment coaching
