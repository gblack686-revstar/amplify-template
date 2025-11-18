# Parenting Autism Support Platform - Services Directory

Complete reference for all AWS services, Lambda functions, and components in the Parenting Autism QuickStart.

---

## Overview

This platform provides personalized autism parenting support through AI-powered chat, document-based insights, and actionable roadmaps. The system uses AWS Bedrock with Claude, Knowledge Base for RAG, and a serverless architecture.

---

## AWS Services

### Amazon Cognito

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **User Pool** | `us-east-1_ph7EUhyWP` | User authentication and management |
| **User Pool Client** | `1vlife6rn9vi4qj31hl700rgt3` | OAuth 2.0 configuration for web app |
| **Custom Attributes** | None | Standard attributes only |
| **Groups** | `admins`, `users` | Admin dashboard access control, future role-based features |
| **MFA** | Optional (TOTP, EMAIL_OTP) | User-configurable multi-factor authentication |
| **Email Service** | Amazon SES | Email verification and notifications |
| **SES Source ARN** | `arn:aws:ses:us-east-1:909899699131:identity/greg.black@revstarconsulting.com` | Verified sender |
| **From Address** | `Parenting Autism Navigator <greg.black@revstarconsulting.com>` | Email display name |

**Authentication Flow:**
1. User signs up via custom registration flow
2. Email verification required (sent via SES)
3. JWT tokens issued with `sub` (user ID) claim
4. API Gateway validates JWT on all requests
5. Lambda functions extract user ID from Cognito context

---

### Amazon SES

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **Account Status** | Sandbox mode | Email sending for Cognito and notifications |
| **Daily Limit** | 200 emails/day | Sufficient for testing and small-scale production |
| **Send Rate** | 1 email/second | Rate limiting |
| **Production Access** | Not requested | Future: Remove sandbox limits for unrestricted sending |

**Verified Identities:**
- `greg.black@revstarconsulting.com` - Active sender for Cognito notifications
- `gblack686@gmail.com` - Backup/testing
- `tim.roda+user@revstarconsulting.com` - Testing account

**Integration Points:**
- Cognito User Pool email verification
- Password reset emails
- MFA code delivery (EMAIL_OTP)
- User notifications

**Note:** SES is in sandbox mode, which means emails can only be sent to verified addresses. For production with unrestricted email sending, production access must be requested from AWS (typically approved within 24 hours).

---

### Amazon API Gateway

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **API Name** | `LlmOpsQuickStartStack-Api` | REST API for all endpoints |
| **Authorizer** | Cognito User Pool authorizer | JWT token validation |
| **Base URL** | `https://1mn0x289zc.execute-api.us-east-1.amazonaws.com/prod/` | Production endpoint |
| **CORS** | Enabled for all origins | Allows browser requests from Amplify |

**API Endpoints:**

| Method | Path | Auth | Purpose | Lambda |
|--------|------|------|---------|--------|
| POST | `/auth/register` | None | User registration | N/A (Cognito direct) |
| POST | `/profile` | JWT | Create user profile | profile-management |
| GET | `/profile` | JWT | Get user profile | profile-management |
| PUT | `/profile` | JWT | Update user profile | profile-management |
| POST | `/roadmap` | JWT | Create roadmap item | roadmap-management |
| GET | `/roadmap` | JWT | Get all roadmap items | roadmap-management |
| PUT | `/roadmap/{itemId}` | JWT | Update roadmap item | roadmap-management |
| DELETE | `/roadmap/{itemId}` | JWT | Delete roadmap item | roadmap-management |
| POST | `/roadmap-transform` | JWT | Generate AI recommendations | roadmap-transform |
| POST | `/documents/upload` | JWT | Get pre-signed upload URL | document-upload |
| GET | `/documents` | JWT | List user documents | document-upload |
| GET | `/documents/{documentId}/status` | JWT | Check document processing status | document-analysis |
| DELETE | `/documents/{docId}` | JWT | Delete document | document-upload |
| POST | `/chat/sessions` | JWT | Create new chat session | query |
| GET | `/chat/sessions` | JWT | List all chat sessions | query |
| GET | `/chat/sessions/{sessionId}` | JWT | Get session messages | query |
| PUT | `/chat/sessions/{sessionId}` | JWT | Update session metadata | query |
| DELETE | `/chat/sessions/{sessionId}` | JWT | Delete chat session | query |
| POST | `/query` | JWT | Submit chat query | query |
| POST | `/generate-title` | JWT | Generate session title | query |
| POST | `/feedback` | JWT | Submit feedback | feedback |
| GET | `/feedback/{messageId}` | JWT | Get feedback for message | feedback |
| PUT | `/feedback/{messageId}` | JWT | Update feedback | feedback |
| DELETE | `/feedback/{messageId}` | JWT | Delete feedback | feedback |
| POST | `/activity-log` | JWT | Log user activity | admin-activity-log |
| GET | `/admin/analytics` | JWT (admin) | Get analytics data | admin-analytics |
| GET | `/admin/activity-log` | JWT (admin) | Get activity log | admin-activity-log |
| DELETE | `/admin/delete-user` | JWT (admin) | Delete user (GDPR) | user-deletion |

---

### Amazon Bedrock

#### Models

| Model | Use Case | Parameters |
|-------|----------|------------|
| **Claude 3.5 Sonnet v2** | Chat responses, document Q&A | - Max tokens: 4096<br>- Temperature: 0.7<br>- Top P: 0.9 |
| **Claude 3.5 Haiku** | Quick win generation, roadmap items | - Max tokens: 500<br>- Temperature: 0.7 |
| **Titan Embed Text v2** | Document embeddings | - 1024 dimensions |

#### Knowledge Base

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **Knowledge Base ID** | `XL3V85KEOS` | Vector store for document retrieval |
| **Embedding Model** | Titan Embed Text v2 | Converts documents to embeddings |
| **Vector Store** | OpenSearch Serverless | Stores and searches vectors |
| **Chunking Strategy** | 300 tokens, 20% overlap | Optimizes retrieval granularity |

#### Guardrails

| Guardrail ID | Purpose | Filters |
|-------------|---------|---------|
| `8vyc32hh7igt` | Content safety and topic control | - Denied topics (politics, religion)<br>- PII redaction<br>- Harmful content filtering |

---

### Amazon OpenSearch Serverless

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **Collection** | Bedrock KB collection | Vector storage backend |
| **Collection Endpoint** | Auto-generated | Vector search endpoint |
| **Capacity** | Auto-scaling (2-8 OCUs) | Adjusts based on query load |

---

### Amazon S3

| Bucket | Purpose | Path Structure | Lifecycle |
|--------|---------|----------------|-----------|
| `llmopsquickstartstack-docsbucket-*` | Store uploaded documents | `{userId}/{documentId}/{filename}` | 90 days retention |

**S3 Features:**
- Server-side encryption (SSE-S3)
- Pre-signed URLs for secure uploads (15 min expiry)
- CORS configuration for browser uploads
- Versioning disabled (cost optimization)

---

### Amazon DynamoDB

#### Tables

| Table | Keys | Purpose | GSIs |
|-------|------|---------|------|
| **user-profiles** | `PK: userId` | Store family profile data | None |
| **chat-sessions** | `PK: userId`<br>`SK: sessionId` | Store chat history | None |
| **document-metadata** | `PK: userId`<br>`SK: documentId` | Track uploaded documents | None |
| **feedback** | `PK: userId`<br>`SK: feedbackId` | Store user feedback | None |
| **personalized-insights** | `PK: userId`<br>`SK: insightId` | Store AI-generated insights | None |
| **roadmap-items** | `PK: userId`<br>`SK: itemId` | Store roadmap goals | None |
| **LoggingTable** | `PK: id`<br>`SK: timestamp` | Activity logging for admin dashboard | GSI: `userId-timestamp-index` |

**Schema Examples:**

**user-profiles:**
```json
{
  "userId": "cognito-user-id",
  "profile": {
    "marital_status": "married",
    "location": "California",
    "children": [{
      "name": "John",
      "age": 7,
      "autism_severity": "moderate",
      "verbal_status": "minimally_verbal"
    }],
    "biggest_challenges": ["communication", "sensory_issues"],
    "desired_outcomes": ["improve_communication", "reduce_meltdowns"]
  },
  "onboardingComplete": true,
  "createdAt": "2025-11-01T12:00:00Z"
}
```

**roadmap-items:**
```json
{
  "userId": "cognito-user-id",
  "itemId": "item-123",
  "title": "Practice visual schedule",
  "description": "Introduce picture-based daily schedule",
  "category": "daily_skills",
  "status": "in_progress",
  "dueDate": "2025-12-01",
  "notes": ["Start with morning routine", "Use PECS cards"],
  "createdAt": "2025-11-01T12:00:00Z",
  "thumbsUpGiven": false
}
```

**LoggingTable (Activity Logs):**
```json
{
  "id": "uuid",
  "timestamp": "2025-11-01T12:00:00Z",
  "userId": "cognito-user-id",
  "requestType": "user_signup",
  "metadata": {
    "email": "user@example.com"
  }
}
```

---

### AWS Lambda Functions

#### Core Application Functions

| Function | Trigger | Purpose | Lines | Key Features |
|----------|---------|---------|-------|--------------|
| **query** | API Gateway | Process chat queries with RAG | ~800 | - Knowledge Base retrieval<br>- Bedrock Claude integration<br>- Session management<br>- Citation tracking<br>- Guardrails integration<br>- Document filtering by user |
| **profile-management** | API Gateway | CRUD for user profiles | ~400 | - Create/read/update profiles<br>- Pydantic validation<br>- Email validation<br>- Activity logging<br>- Onboarding state tracking |
| **roadmap-management** | API Gateway | CRUD for roadmap items | ~350 | - Create/update/delete items<br>- Category-based organization<br>- Status tracking<br>- DynamoDB operations |
| **roadmap-transform** | API Gateway | AI-powered recommendation generation | ~300 | - Claude 3.5 Haiku<br>- Anti-duplication logic<br>- Category balancing<br>- JSON extraction<br>- Format/generate modes |
| **document-upload** | API Gateway | Handle document uploads | ~300 | - Pre-signed URL generation<br>- S3 metadata tracking<br>- DynamoDB document registry<br>- List/delete operations |
| **document-analysis** | API Gateway | Process uploaded documents | ~250 | - Document text extraction<br>- Status tracking<br>- Metadata enrichment<br>- Processing notifications |
| **generate-presigned-url** | API Gateway | Generate S3 upload URLs | ~150 | - Pre-signed URL generation<br>- Permission validation<br>- Expiration management |
| **s3-upload-trigger** | S3 events | Handle document uploads | ~180 | - S3 event processing<br>- Trigger document analysis<br>- Metadata updates |
| **session-manager** | API Gateway | Manage chat sessions | ~300 | - Session CRUD operations<br>- Session metadata<br>- Archive management |
| **title-generator** | API Gateway | Generate session titles | ~200 | - AI-powered title generation<br>- Context analysis<br>- Automatic naming |
| **feedback** | API Gateway | Collect user feedback | ~200 | - Positive/negative feedback<br>- Message-level tracking<br>- DynamoDB storage |
| **ingest** | S3 events | Trigger Knowledge Base ingestion | ~200 | - S3 event handling<br>- KB data source sync<br>- Status monitoring |
| **ingestion-status-checker** | EventBridge | Check KB sync status | ~150 | - Periodic status checks<br>- Error notification |

#### Admin Functions

| Function | Trigger | Purpose | Lines | Key Features |
|----------|---------|---------|-------|--------------|
| **admin-analytics** | API Gateway | Generate dashboard analytics | ~500 | - Family/children counts<br>- Document statistics<br>- Conversation metrics<br>- Feedback analysis<br>- Time-to-first-win<br>- Roadmap completion rates<br>- Weekly active families<br>- Real-time calculations |
| **admin-activity-log** | API Gateway | Retrieve activity logs | ~200 | - DynamoDB query with GSI<br>- User filtering<br>- Time-based pagination<br>- Activity type filtering |
| **user-deletion** | API Gateway | GDPR-compliant user deletion | ~350 | - Cognito user deletion<br>- S3 document cleanup<br>- DynamoDB cascade delete<br>- OpenSearch cleanup<br>- Comprehensive deletion report |

#### Cognito Lambda Triggers

| Function | Trigger | Purpose | Lines | Key Features |
|----------|---------|---------|-------|--------------|
| **post-confirmation-trigger** | Cognito post-confirmation | Initialize user after signup | ~150 | - Add user to "users" group<br>- Create default profile<br>- Log signup activity<br>- Send welcome notifications |
| **custom-message** | Cognito custom message | Customize auth emails | ~180 | - Custom verification emails<br>- Password reset formatting<br>- MFA code delivery<br>- Branded email templates |

---

### AWS Amplify

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **App Name** | `parenting-autism` | Hosting service |
| **App ID** | `d5nc2mn12s3nr` | Unique identifier |
| **Domain** | `d5nc2mn12s3nr.amplifyapp.com` | Production URL |
| **Branch** | Auto-deploy disabled | Manual deployments only |
| **Build Spec** | `amplify.yml` | Custom build configuration |

**Amplify Configuration:**
- Framework: React (Create React App)
- Node version: 18.x
- Build command: `npm run build`
- Output directory: `build/`
- Custom headers for cache control
- Environment variables injected at build time

**Cache-Busting Strategy:**
- HTML files: No cache
- JS/CSS files: Cache forever (content-hashed)
- Automatic version detection with `version.json`
- Update prompts every 5 minutes

---

### Amazon EventBridge

| Rule | Event Source | Target | Purpose |
|------|--------------|--------|---------|
| **S3 Upload Rule** | S3 PutObject events | ingest Lambda | Triggers KB sync when documents uploaded |
| **Ingestion Status** | Schedule (every 5 min) | ingestion-status-checker Lambda | Monitors KB sync status |

---

### Amazon SNS

| Topic | Purpose | Subscribers |
|-------|---------|-------------|
| N/A | Currently not used | Future: Email alerts for errors |

---

### Amazon CloudWatch

#### Log Groups

| Log Group | Source | Retention |
|-----------|--------|-----------|
| `/aws/lambda/LlmOpsQuickStartStack-query` | Query Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-profile-management` | Profile Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-roadmap-management` | Roadmap Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-roadmap-transform` | Transform Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-document-upload` | Upload Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-document-analysis` | Document Analysis Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-document-list` | Document List Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-document-status` | Document Status Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-chat-sessions` | Session Manager Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-generate-title` | Title Generator Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-feedback` | Feedback Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-kb-sync-job` | KB Sync Job Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-ingestion-trigger` | Ingestion Trigger Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-ingestion-status-checker` | Ingestion Status Checker Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-admin-analytics` | Analytics Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-admin-activity-log` | Admin Activity Log Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-activity-log` | Activity Log Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-user-deletion` | User Deletion Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-post-confirmation` | Post Confirmation Lambda | 7 days |
| `/aws/lambda/LlmOpsQuickStartStack-user-registration` | User Registration Lambda | 7 days |

**✅ Log Retention Configured:** All Lambda function log groups now have 7-day retention policies set to optimize CloudWatch Logs storage costs.

#### Metrics (Future Implementation)

| Metric | Source | Use Case |
|--------|--------|----------|
| **Query Latency** | Query Lambda | Response time monitoring |
| **KB Retrieval Success** | Query Lambda | Retrieval effectiveness |
| **User Signups** | Profile Lambda | Growth tracking |
| **Feedback Score** | Feedback Lambda | Quality monitoring |

---

## Infrastructure as Code (CDK)

### CDK Stack

| Stack | File | Resources | Purpose |
|-------|------|-----------|---------|
| **LlmOpsQuickStartStack** | `backend-stack.ts` | All AWS resources | Complete serverless backend |

### Stack Details (~1400 lines)

**Key Resources:**
- Cognito User Pool with 2 groups (admins, users) + SES integration
- API Gateway with 30+ endpoints
- 18 Lambda functions with IAM roles
- 7 DynamoDB tables
- S3 bucket with CORS
- Bedrock Knowledge Base + Guardrails
- OpenSearch Serverless collection
- EventBridge rules
- CloudWatch log groups (18 Lambda functions)
- Amazon SES (3 verified identities)

**CDK Features:**
- Environment-based resource naming
- Automatic IAM role creation
- Lambda bundling with dependencies
- S3 bucket policies
- API Gateway CORS configuration
- DynamoDB GSI configuration
- Knowledge Base data source setup

---

## Frontend Application

### React Web Application

| Component | Purpose | Lines |
|-----------|---------|-------|
| **App.tsx** | Main application shell | ~300 |
| **ChatInterface.tsx** | Chat UI with message history | ~800 |
| **Onboarding.tsx** | 5-step onboarding flow | ~600 |
| **Roadmap.tsx** | Goal tracking interface | ~700 |
| **AdminDashboard.tsx** | Analytics and monitoring | ~900 |
| **FamilyProfile.tsx** | Profile management | ~400 |

**Key Features:**
- Dark mode support
- Real-time chat with streaming (future)
- Document upload with progress tracking
- Interactive roadmap with drag-and-drop
- Admin analytics dashboard
- MFA setup and management
- Responsive design (mobile-first)
- Citation links in chat responses
- Feedback thumbs up/down
- Quick win generation after onboarding

**Technology Stack:**
- React 18.x
- TypeScript 4.x
- Tailwind CSS 3.x
- Lucide React icons
- AWS Amplify Auth
- Fetch API for backend calls

---

## Security & IAM

### IAM Roles

| Role | Service | Permissions |
|------|---------|-------------|
| **QueryLambdaRole** | Lambda | Bedrock (KB query, invoke model), DynamoDB (read sessions), S3 (read docs), CloudWatch Logs |
| **ProfileLambdaRole** | Lambda | DynamoDB (read/write profiles), CloudWatch Logs, Activity logging |
| **RoadmapLambdaRole** | Lambda | DynamoDB (read/write roadmap), CloudWatch Logs |
| **TransformLambdaRole** | Lambda | Bedrock (invoke Haiku), CloudWatch Logs |
| **DocumentUploadRole** | Lambda | S3 (GetObject, PutObject), DynamoDB (write metadata), CloudWatch Logs |
| **DocumentAnalysisRole** | Lambda | S3 (read documents), DynamoDB (update metadata), Bedrock (text extraction), CloudWatch Logs |
| **PresignedUrlRole** | Lambda | S3 (generate presigned URLs), CloudWatch Logs |
| **S3UploadTriggerRole** | Lambda | S3 (read events), DynamoDB (update metadata), CloudWatch Logs |
| **SessionManagerRole** | Lambda | DynamoDB (read/write sessions), CloudWatch Logs |
| **TitleGeneratorRole** | Lambda | Bedrock (invoke Claude), DynamoDB (update session), CloudWatch Logs |
| **FeedbackRole** | Lambda | DynamoDB (read/write feedback), CloudWatch Logs |
| **IngestRole** | Lambda | Bedrock (start ingestion job), CloudWatch Logs |
| **IngestionStatusRole** | Lambda | Bedrock (check ingestion status), CloudWatch Logs |
| **AdminAnalyticsRole** | Lambda | DynamoDB (scan all tables), CloudWatch Logs |
| **AdminActivityLogRole** | Lambda | DynamoDB (query with GSI), CloudWatch Logs |
| **UserDeletionRole** | Lambda | Cognito (delete user), S3 (delete objects), DynamoDB (delete items), OpenSearch (delete), CloudWatch Logs |
| **PostConfirmationRole** | Lambda | Cognito (add user to group), DynamoDB (create profile), CloudWatch Logs |
| **CustomMessageRole** | Lambda | Read-only (customize email templates), CloudWatch Logs |
| **BedrockKBRole** | Bedrock | S3 (read docs), OpenSearch (write vectors) |

### Security Features

- **Encryption**: All DynamoDB tables encrypted at rest, S3 server-side encryption
- **User Isolation**: All queries filtered by userId from Cognito JWT
- **JWT Validation**: API Gateway validates all requests
- **IAM Least Privilege**: Each Lambda has minimal required permissions
- **No Hardcoded Credentials**: Uses IAM roles and environment variables
- **Pre-Signed URLs**: Time-limited (15 min) access for uploads
- **User Groups**: Cognito groups (admins, users) for role-based access control
- **Input Validation**: Pydantic schemas validate all inputs
- **Guardrails**: Bedrock guardrails prevent harmful content
- **MFA Support**: Optional multi-factor authentication (TOTP, EMAIL_OTP)
- **Email Security**: Amazon SES for verified email delivery with sandbox mode protection
- **Post-Confirmation Triggers**: Automatic user initialization and group assignment

---

## Monitoring & Observability

### Activity Logging

All user actions are logged to the `LoggingTable` for admin dashboard:

| Activity Type | Trigger | Metadata |
|---------------|---------|----------|
| `user_signup` | User registration | email |
| `onboarding_complete` | Onboarding finished | N/A |
| `document_upload` | Document uploaded | fileName, fileSize |
| `chat_session_start` | New chat session | sessionId |
| `recommendation_approved` | Roadmap item added | title, category |
| `recommendation_dismissed` | Roadmap item rejected | title |
| `goal_added` | Manual goal added | title |
| `goal_completed` | Goal marked done | title |
| `feedback_positive` | Thumbs up given | messageId |
| `feedback_negative` | Thumbs down given | messageId |
| `mfa_enabled` | MFA activated | N/A |
| `mfa_disabled` | MFA deactivated | N/A |

### Admin Dashboard KPIs

| KPI | Calculation | Purpose |
|-----|-------------|---------|
| **Total Families** | Count of user profiles | User growth |
| **Total Children** | Sum of children across profiles | Platform reach |
| **Families with Documents** | Profiles with ≥1 document | Document adoption |
| **Total Documents** | Count of uploaded docs | Content volume |
| **Average Documents per Family** | Total docs / families with docs | Engagement depth |
| **Total Queries** | Count of chat messages (7 days) | Chat usage |
| **Unique Sessions** | Distinct sessionIds (7 days) | Active conversations |
| **Positive Feedback %** | (Positive / Total) * 100 | Quality metric |
| **80% Target Met** | Positive ≥ 80% | Success indicator |
| **Time to First Win (Avg)** | Hours from signup to first recommendation | Onboarding effectiveness |
| **Roadmap Items Created** | Total items | Goal tracking adoption |
| **Roadmap Completion Rate** | (Completed / Total) * 100 | User progress |
| **Avg Recommendations per User** | Total items / users with items | Personalization depth |
| **Weekly Active Families** | Users with activity in last 7 days | Retention metric |

---

## Cost Optimization

### Cost Breakdown

| Service | Cost Driver | Monthly Estimate | Optimization |
|---------|-------------|------------------|--------------|
| **Bedrock (Claude)** | Input/output tokens | ~$50-200 | - Efficient prompts<br>- Context management<br>- Cache summaries |
| **Bedrock (Embeddings)** | Document chunks | ~$20-50 | - Optimal chunk size (300 tokens)<br>- Deduplicate uploads |
| **OpenSearch Serverless** | OCU hours | ~$150-300 | - Auto-scaling (2-8 OCUs)<br>- Standby replicas OFF |
| **Lambda** | Invocations + duration | ~$10-30 | - Memory optimization (1024 MB)<br>- Timeout tuning |
| **DynamoDB** | Read/write capacity | ~$5-20 | - On-demand pricing<br>- Efficient queries with GSIs |
| **S3** | Storage + requests | ~$5-15 | - Lifecycle policies (90 days)<br>- Pre-signed URL uploads |
| **Amplify** | Build minutes + hosting | ~$5-10 | - Manual deployments<br>- Efficient cache headers |
| **API Gateway** | API calls | ~$5-10 | - Efficient endpoints<br>- Client-side caching |
| **CloudWatch** | Log storage + queries | ~$5-10 | - 7-day retention (configured)<br>- Minimal custom metrics |
| **SES** | Email sends | ~$0-5 | - Sandbox mode (200/day free)<br>- $0.10 per 1000 emails (production) |

### Cost Estimates (Monthly)

**Light Usage (50 users, 10 queries/user/month):**
- Bedrock: ~$80
- OpenSearch: ~$150
- Lambda: ~$15
- Other: ~$30
- **Total: ~$275/month**

**Moderate Usage (200 users, 30 queries/user/month):**
- Bedrock: ~$250
- OpenSearch: ~$250
- Lambda: ~$40
- Other: ~$60
- **Total: ~$600/month**

**Heavy Usage (1000 users, 50 queries/user/month):**
- Bedrock: ~$1,200
- OpenSearch: ~$400
- Lambda: ~$150
- Other: ~$150
- **Total: ~$1,900/month**

---

## Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **AWS CDK** | 2.x | Infrastructure as Code |
| **Node.js** | 18+ | CDK runtime + React build |
| **TypeScript** | 4.x | CDK + React type safety |
| **Python** | 3.12 | Lambda runtime |
| **boto3** | Latest | AWS SDK for Python |
| **pydantic** | 2.x | Lambda input validation |
| **React** | 18.x | Frontend framework |
| **Tailwind CSS** | 3.x | UI styling |
| **Playwright** | Latest | E2E testing |
| **pytest** | Latest | Lambda unit testing |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **v1.6.0** | Nov 2025 | SES integration, EMAIL_OTP MFA, Privacy Policy & Terms modals, session management, Cognito triggers |
| **v1.5.0** | Nov 2025 | Quick win generation, cache-busting, admin dashboard KPIs |
| **v1.4.0** | Nov 2025 | Weekly active families KPI, roadmap DynamoDB migration |
| **v1.3.0** | Oct 2025 | Activity logging, admin analytics, time-based filtering |
| **v1.2.0** | Oct 2025 | Roadmap management, AI recommendations |
| **v1.1.0** | Oct 2025 | Document upload, Knowledge Base integration |
| **v1.0.0** | Oct 2025 | Initial release: Chat, profiles, onboarding |

---

**Last Updated**: January 12, 2025
**Total AWS Services**: 13 services (Cognito, API Gateway, Lambda, DynamoDB, S3, Bedrock, OpenSearch, SES, Amplify, EventBridge, CloudWatch, IAM, SNS)
**Total Lambda Functions**: 18 functions
**Total Lines of Code**: ~9,500+ lines
**Total DynamoDB Tables**: 7 tables
**Total API Endpoints**: 30+ endpoints
**Cognito Groups**: 2 (admins, users)
**SES Verified Identities**: 3

## Action Items

1. **✅ COMPLETED: Set CloudWatch Log Retention** - All 20 Lambda function log groups now have 7-day retention policies configured (Jan 12, 2025).
2. **Request SES Production Access** - Currently in sandbox mode (200 emails/day, verified recipients only). Request production access to enable unrestricted email sending.
3. **Review Bedrock Guardrail Configuration** - Content filtering showing NULL in audit; verify guardrail is active.
4. **Clean Up Failed Knowledge Base** - Remove KB ID EPALGDHWAD (status: DELETE_UNSUCCESSFUL).
5. **Document Privacy Policy Deployment** - Verify Privacy Policy and Terms of Service changes are live in production.
