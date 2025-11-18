# Repository Structure

This document shows what will be committed to GitHub after considering `.gitignore` rules.

## Root Directory

```
amplify-template/
├── .gitignore                    # Git ignore rules
├── .env.example                  # Environment variables template
├── .flake8                       # Python linting configuration
├── .git-config                   # Git configuration
├── pyproject.toml                # Python project configuration
├── README.md                     # Main documentation
├── SERVICES.md                   # AWS services documentation
├── DEPLOYMENT.md                 # Deployment guide
├── TEMPLATE-SETUP.md             # Template customization guide
├── AMPLIFY-DEPLOYMENT.md         # AWS Amplify deployment guide
├── next-steps.md                 # Post-deployment next steps
│
├── code/                         # Backend Lambda functions
│   ├── lambda/
│   │   ├── shared/              # Shared utilities & dependencies
│   │   ├── query/               # RAG query endpoint
│   │   ├── ingest/              # Document ingestion
│   │   ├── profile-management/  # User profiles CRUD
│   │   ├── document-upload/     # Presigned URL generation
│   │   ├── document-list/       # Document operations
│   │   ├── document-analysis/   # AI document extraction
│   │   ├── roadmap-*/          # Roadmap generation
│   │   ├── admin-*/            # Admin endpoints
│   │   ├── feedback/           # Feedback collection
│   │   └── user-*/             # User management
│   └── tests/
│       ├── unit/               # Unit tests
│       └── integration/        # Integration tests
│
├── infra/                       # AWS CDK infrastructure
│   ├── lib/
│   │   ├── constructs/         # Reusable CDK constructs
│   │   ├── utils/              # CDK utilities
│   │   └── backend-stack.ts    # Main infrastructure stack
│   ├── bin/                    # CDK app entry point
│   ├── package.json
│   └── tsconfig.json
│
├── react-frontend/             # React application
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── Auth.tsx
│   │   │   ├── Onboarding.tsx
│   │   │   ├── OnboardingSteps/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Roadmap.tsx
│   │   │   ├── DocumentUpload.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   └── Settings.tsx
│   │   ├── services/         # API service layer
│   │   │   ├── api.ts
│   │   │   ├── authService.ts
│   │   │   ├── profileService.ts
│   │   │   ├── documentService.ts
│   │   │   └── roadmapService.ts
│   │   ├── contexts/         # React contexts
│   │   │   ├── ThemeContext.tsx
│   │   │   └── ProfileContext.tsx
│   │   ├── types/            # TypeScript types
│   │   ├── config/           # Configuration
│   │   ├── utils/            # Utility functions
│   │   └── App.tsx           # Main app component
│   ├── public/               # Static assets
│   ├── amplify.yml           # AWS Amplify build config
│   ├── package.json
│   └── tsconfig.json
│
├── screenshots/               # Application screenshots
│   ├── 01-onboarding-step1-quick-questions.png
│   ├── 02-onboarding-step2-family-profile.png
│   ├── 03-onboarding-step3-child-profile.png
│   ├── 04-onboarding-step4-interventions.png
│   ├── 05-onboarding-step5-welcome.png
│   ├── 06-main-app-chat-interface.png
│   ├── 07-main-app-roadmap-view.png
│   ├── 08-main-app-documents-view.png
│   ├── 09-settings-modal.png
│   └── 10-admin-dashboard.png
│
├── scripts/                  # Utility scripts
│   ├── deployment/          # Production deployment
│   └── (various .sh/.py)    # Setup & utility scripts
│
├── docs/                    # Additional documentation
│   └── (architecture diagrams, guides, etc.)
│
├── e2e-tests/               # End-to-end tests
│   ├── playwright.config.ts
│   ├── package.json
│   └── tests/
│
└── templates/               # Template files
    └── (CDK parameter templates, etc.)
```

## What's NOT Committed (per .gitignore)

### Secrets & Credentials
- `.env` files (except `.env.example`)
- `*.pem`, `*.key`, `.ssh/`
- AWS credentials
- API keys and tokens

### Build Artifacts
- `node_modules/`
- `cdk.out/`
- `react-frontend/build/`
- `*.zip`, `*.tar.gz`
- Python `__pycache__/`, `*.pyc`

### Development Files
- `.vscode/`, `.idea/`
- `.aws/`, `.claude/`
- Test coverage reports
- Logs and temporary files

### Project-Specific Exclusions
- `scope/` (scoping documents)
- `bonus/` (bonus materials)
- `deployments/` (deployment artifacts)
- Personal files (thanksgiving plans, etc.)

## Total Committed Files

Approximately **~200 files** will be committed including:
- **~80 backend files** (Lambda functions, tests)
- **~50 frontend files** (React components, services)
- **~30 infrastructure files** (CDK stacks, constructs)
- **10 screenshots**
- **~10 documentation files**
- **~20 configuration files**

## Repository Size

Estimated size: **~5-10 MB** (excluding `node_modules`)
