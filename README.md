# RevStar Wellness - AWS Amplify Template

AI-powered wellness support platform template. Built on AWS using CDK, Bedrock, AWS Amplify, and modern serverless architecture.

Based on the LLM-Ops QuickStart framework, customized for health and wellness applications. This template can be adapted for any vertical (healthcare, coaching, education, etc.).

## 🏗️ Architecture Overview

This project deploys a complete serverless LLM infrastructure with the following components:

![LLM Ops QuickStart Architecture](LLMOPS.webp)

- **Amazon Bedrock** - LLM models (Claude, Titan, Cohere, or custom)
- **Knowledge Base** - Vector embeddings with OpenSearch Serverless
- **Document Storage** - S3 bucket with automated processing
- **API Gateway** - RESTful API with authentication
- **Lambda Functions** - Serverless orchestration
- **DynamoDB** - Request/response logging
- **CloudWatch** - Monitoring and logging
- **WAF** - Web Application Firewall protection
- **QuickSight** - Analytics dashboard for usage metrics

## 🚀 Quick Start

### Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials
- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) v2.x
- Node.js 18+ and npm
- Python 3.12+

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/gblack686/amplify-template.git
   cd amplify-template
   npm install
   cd react-frontend && npm install && cd ..
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials and configuration
   ```

3. **Setup AWS resources**
   ```bash
   # Bootstrap CDK (first time only)
   cdk bootstrap

   # Configure AWS Parameter Store and Secrets Manager
   # (Contact repository maintainer for configuration details)
   ```

4. **Deploy infrastructure**
   ```bash
   cd infra
   npm install
   cdk deploy --context environment=dev
   ```

5. **Deploy frontend to AWS Amplify**
   - Connect your GitHub repository to AWS Amplify
   - Configure build settings using `react-frontend/amplify.yml`
   - Set environment variables from CDK outputs

## 📁 Project Structure

```
amplify-template/
├── code/
│   ├── lambda/              # Lambda functions
│   │   ├── shared/          # Shared utilities (sidecar_manager)
│   │   ├── query/           # RAG query endpoint
│   │   ├── ingest/          # Document ingestion
│   │   ├── profile-management/  # User profile CRUD
│   │   ├── document-*/      # Document operations (upload, list, analysis)
│   │   ├── roadmap-*/       # Roadmap generation and management
│   │   ├── admin-*/         # Admin analytics and activity logs
│   │   ├── feedback/        # User feedback collection
│   │   └── user-*/          # User management (registration, deletion)
│   └── tests/               # Backend tests
│       ├── unit/            # Unit tests
│       └── integration/     # Integration tests
├── infra/
│   ├── lib/
│   │   ├── constructs/      # Reusable CDK constructs
│   │   ├── utils/           # CDK utilities
│   │   └── backend-stack.ts # Main infrastructure stack
│   └── bin/                 # CDK app entry point
├── react-frontend/          # React frontend application
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API services
│   │   ├── contexts/        # React contexts
│   │   └── auth/            # Authentication
│   ├── public/              # Static assets
│   └── amplify.yml          # Amplify deployment config
├── scripts/
│   ├── deployment/          # Production deployment scripts
│   └── *.py, *.sh           # Various utility scripts
├── README.md                # This file
├── TEMPLATE-SETUP.md        # Template customization guide
└── SERVICES.md              # AWS services documentation
```

## 📚 Documentation

### Core Documentation
- [Services Reference](SERVICES.md) - Complete AWS services and architecture documentation
- [Template Setup Guide](TEMPLATE-SETUP.md) - How to customize this template for your use case
- [Deployment Guide](DEPLOYMENT.md) - Production deployment instructions

## 🔧 API Usage

### Query the Knowledge Base

```bash
POST /docs
Content-Type: application/json
x-api-key: YOUR_API_KEY

{
  "query": "What is machine learning?",
  "max_tokens": 1000,
  "temperature": 0.7
}
```

### Manage Web Crawler URLs

```bash
# Add/Update URLs
POST /web-urls
Content-Type: application/json
x-api-key: YOUR_API_KEY

{
  "urls": ["https://example.com", "https://docs.example.com"]
}

# Get configured URLs
GET /urls
x-api-key: YOUR_API_KEY
```

## 🏃‍♂️ Development

### Lambda Functions

Lambda functions are organized by purpose:

- `query/` - RAG query processing and AI generation
- `ingest/` - Document ingestion from S3 with sidecar pattern
- `document-upload/` - Presigned URL generation for uploads
- `document-list/` - List/get/delete document operations
- `document-analysis/` - AI-powered document data extraction
- `profile-management/` - User family profile CRUD operations
- `feedback/` - User feedback collection and management
- `shared/` - Shared utilities (sidecar_manager, etc.)

### Adding Dependencies

Shared dependencies are in `code/lambda/shared/requirements.txt`. To add:

1. Edit `code/lambda/shared/requirements.txt`
2. Redeploy: `cd infra && cdk deploy --context environment=dev`

### Running Tests

```bash
# Unit tests
cd code
python -c "import sys; import os; sys.path.insert(0, os.path.join(os.getcwd(), 'lambda')); import pytest; pytest.main(['-v', 'tests/unit/'])"

# Integration tests (requires deployed stack)
python -m pytest tests/integration/ -v
```

### Local Development

```bash
# Frontend
cd react-frontend
npm start

# CDK development
cd infra
npm test              # Run tests
npx cdk synth        # Generate CloudFormation
npx cdk diff         # Check differences
```

## 📊 Monitoring

### CloudWatch Logs
- All Lambda functions log to CloudWatch
- API Gateway access logs enabled
- Structured logging for better searchability

### DynamoDB Logging
- All API requests/responses logged
- Query for usage analytics and debugging

### QuickSight Analytics Dashboard
- Real-time usage metrics and performance monitoring
- Model usage distribution and cost tracking
- Response time trends and success rate analysis
- See [QuickSight Setup Guide](docs/quicksight-setup.md) for configuration

### Cost Monitoring
- All resources tagged for cost allocation
- CloudWatch billing alarms available

## 🎯 Key Features

- **Onboarding Flow**: Multi-step profile creation for wellness journey
- **Document Management**: Upload, analyze, and extract insights from wellness plans, fitness assessments, health records
- **AI Chat Interface**: RAG-powered Q&A with Claude AI models for personalized wellness guidance
- **Personalized Roadmap**: Customized wellness recommendations based on user profile and goals
- **Feedback System**: User feedback collection on AI responses
- **User Profiles**: Comprehensive user and family member profile management with Pydantic validation
- **Sidecar Pattern**: Metadata and processing status tracking for all documents
- **Admin Dashboard**: Activity logging, analytics, and user management
- **AWS Amplify**: Automated GitHub → Amplify deployment pipeline

## 🔒 Security & Compliance

### Data Isolation & Privacy

**Multi-Tenant User Isolation** 🔐
- **Knowledge Base Filtering**: Every query is automatically filtered by `userId` - users can ONLY retrieve their own uploaded documents
- **Profile Isolation**: Family profiles are isolated by Cognito user ID - no cross-user data leakage
- **Document Metadata**: All documents tagged with `userid` at upload time (server-side, tamper-proof)
- **DynamoDB Partitioning**: All tables use `userId` as partition key for automatic data isolation
- **API Gateway Authentication**: Cognito JWT validation ensures users can't spoof identity
- **Server-Side Filtering**: User isolation enforced in Lambda code, not client-controlled

**How It Works:**
1. User uploads document → Lambda tags with `userid` metadata (extracted from verified JWT)
2. User queries chat → Lambda adds `userid` filter to Bedrock Knowledge Base query
3. Knowledge Base → Returns ONLY documents matching the user's ID
4. Result → Zero cross-user data exposure, even in shared vector store

### Additional Security Features

- **End-to-end Encryption**: Data encrypted at rest (S3, DynamoDB) and in transit (TLS)
- **HIPAA-Ready Architecture**: Designed for healthcare data with proper isolation
- **MFA Support**: Optional multi-factor authentication (TOTP) for users
- **Cognito Authentication**: Secure user authentication and authorization with JWT tokens
- **IAM Least Privilege**: Fine-grained permissions for all Lambda functions and services
- **Bedrock Guardrails**: Content safety filters for PII redaction and harmful content blocking
- **Secrets Management**: API keys and credentials stored in AWS Secrets Manager
- **Pre-Signed URLs**: Time-limited (15 min) upload URLs prevent unauthorized access
- **Admin Access Control**: Cognito groups for admin-only endpoints (analytics, user deletion)
- **Activity Logging**: All user actions logged to DynamoDB for audit trail (GDPR compliance)

## 🚢 Deployment

### Deploy to Development
```bash
./scripts/utilities/setup-parameters.sh dev
./scripts/utilities/setup-secrets.sh dev
cd infra && cdk deploy --context environment=dev
```

### Deploy to Production
```bash
./scripts/utilities/setup-parameters.sh prod
./scripts/utilities/setup-secrets.sh prod
cd infra && cdk deploy --context environment=prod
```

### Frontend Deployment (AWS Amplify)
1. Connect GitHub repository to Amplify
2. Configure build settings using `react-frontend/amplify.yml`
3. Set environment variables from CDK outputs
4. Amplify handles CI/CD automatically on git push

## 🧹 Cleanup

To remove all resources:

```bash
cd infra
cdk destroy --context environment=dev  # or prod
```

⚠️ **Warning**: This permanently deletes all data including documents in S3.

## 🆘 Support

- **Documentation**: Review [SERVICES.md](SERVICES.md) for AWS infrastructure details
- **Template Customization**: See [TEMPLATE-SETUP.md](TEMPLATE-SETUP.md) for customization guide
- **Issues**: Submit detailed reproduction steps via GitHub Issues
- **Questions**: Contact RevStar team at support@revstar.com

## 📝 Template Customization

This is a **template repository** - it's designed to be customized for your specific use case. The current implementation is themed for wellness/health applications, but can be adapted for:

- Healthcare coaching
- Educational platforms
- Business consulting
- Financial advisory
- And any other vertical requiring AI-powered support

See [TEMPLATE-SETUP.md](TEMPLATE-SETUP.md) for detailed customization instructions.