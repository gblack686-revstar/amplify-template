# RevStar Wellness Navigator - Infrastructure

This CDK project sets up a complete serverless wellness application infrastructure using Amazon Bedrock for AI-powered guidance with RAG capabilities. The infrastructure includes:

- **Amazon Bedrock** - Claude AI models with Knowledge Base for document retrieval
- **Amazon Cognito** - User authentication with MFA support
- **API Gateway** - RESTful API with JWT authorization
- **AWS Lambda** - 18+ serverless functions for core application logic
- **Amazon S3** - Document storage with pre-signed URLs
- **DynamoDB** - User profiles, chat sessions, roadmap items, and activity logs
- **Amazon SES** - Email verification and MFA delivery
- **OpenSearch Serverless** - Vector storage for document embeddings
- **CloudWatch** - Logging and monitoring with 7-day retention

## Prerequisites

- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) v2.x installed
- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm installed
- Python 3.12 installed
- TypeScript installed globally: `npm install -g typescript`

## Architecture Overview

### Lambda Functions

All Lambda functions are implemented in Python 3.12 and are located in `../code/lambda/`:

**Core Application Functions:**
- `query/` - AI chat with RAG, Knowledge Base retrieval, session management
- `profile-management/` - User profile CRUD operations with Pydantic validation
- `roadmap-management/` - Roadmap item CRUD (goals, milestones, progress tracking)
- `roadmap-transform/` - AI-powered recommendation generation using Claude
- `document-upload/` - Pre-signed URL generation for S3 uploads
- `document-analysis/` - Document processing and status tracking
- `session-manager/` - Chat session CRUD operations
- `title-generator/` - AI-powered session title generation
- `feedback/` - User feedback collection (thumbs up/down)

**Admin & Analytics Functions:**
- `admin-analytics/` - Dashboard metrics and KPIs
- `admin-activity-log/` - Activity log retrieval with filtering
- `user-deletion/` - GDPR-compliant user data deletion

**Knowledge Base Functions:**
- `ingest/` - Trigger Knowledge Base sync when documents are uploaded
- `ingestion-status-checker/` - Monitor sync job status

**Cognito Triggers:**
- `post-confirmation-trigger/` - Initialize user profile after signup
- `custom-message/` - Customize email templates for verification and MFA

### Shared Dependencies

All Lambda functions share common dependencies defined in `../code/lambda/requirements.txt`:
- `boto3` - AWS SDK
- `pydantic` - Data validation
- `aws-lambda-powertools` - Logging and tracing

The CDK deployment automatically bundles these dependencies with each Lambda function.

## Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Bootstrap CDK (First Time Only)

```bash
npx cdk bootstrap
```

### 3. Deploy the Stack

```bash
npx cdk deploy --all
```

The deployment will create:
- Cognito User Pool with admin and users groups
- API Gateway with 30+ endpoints
- 18 Lambda functions with appropriate IAM roles
- 7 DynamoDB tables (profiles, sessions, roadmaps, documents, feedback, insights, logging)
- S3 bucket with CORS configuration
- Bedrock Knowledge Base with OpenSearch Serverless
- SES email configuration
- CloudWatch log groups with 7-day retention

### 4. Post-Deployment Configuration

After deployment:

1. **Verify SES Email Address**
   ```bash
   aws ses verify-email-identity --email-address your-email@example.com
   ```

2. **Create First Admin User**
   ```bash
   cd ../scripts
   ./create-test-user.sh
   ```

3. **Get API Outputs**
   ```bash
   npx cdk deploy --outputs-file ../react-frontend/cdk-outputs.json
   ```

## API Endpoints

The API Gateway exposes the following endpoints (all require JWT authorization unless noted):

### Authentication
- `POST /auth/register` - User registration (no auth required)

### Profile Management
- `GET /profile` - Get user profile
- `POST /profile` - Create user profile
- `PUT /profile` - Update user profile

### Chat & Sessions
- `POST /chat/sessions` - Create new chat session
- `GET /chat/sessions` - List all user sessions
- `GET /chat/sessions/{sessionId}` - Get session messages
- `PUT /chat/sessions/{sessionId}` - Update session metadata
- `DELETE /chat/sessions/{sessionId}` - Delete session
- `POST /query` - Submit chat query with RAG
- `POST /generate-title` - Generate session title

### Roadmap Management
- `GET /roadmap` - Get all roadmap items
- `POST /roadmap` - Create roadmap item
- `PUT /roadmap/{itemId}` - Update roadmap item
- `DELETE /roadmap/{itemId}` - Delete roadmap item
- `POST /roadmap-transform` - Generate AI recommendations

### Document Management
- `POST /documents/upload` - Get pre-signed upload URL
- `GET /documents` - List user documents
- `GET /documents/{documentId}/status` - Check processing status
- `DELETE /documents/{docId}` - Delete document

### Feedback
- `POST /feedback` - Submit feedback
- `GET /feedback/{messageId}` - Get feedback for message
- `PUT /feedback/{messageId}` - Update feedback
- `DELETE /feedback/{messageId}` - Delete feedback

### Admin Endpoints (Requires admin group membership)
- `GET /admin/analytics` - Get dashboard analytics
- `GET /admin/activity-log` - Get activity logs
- `DELETE /admin/delete-user` - Delete user (GDPR)

### Activity Logging
- `POST /activity-log` - Log user activity

## Configuration

### Environment Variables

The CDK stack configures the following environment variables for Lambda functions:

- `DOCS_BUCKET_NAME` - S3 bucket for document storage
- `KNOWLEDGE_BASE_ID` - Bedrock Knowledge Base ID
- `USER_PROFILES_TABLE_NAME` - DynamoDB user profiles table
- `CHAT_SESSIONS_TABLE_NAME` - DynamoDB chat sessions table
- `ROADMAP_ITEMS_TABLE_NAME` - DynamoDB roadmap items table
- `LOGGING_TABLE_NAME` - DynamoDB activity logging table
- `USER_POOL_ID` - Cognito User Pool ID

### Customization

You can customize the stack by modifying `lib/backend-stack.ts`:

- Lambda memory and timeout settings
- Bedrock model selections (Claude Sonnet, Haiku, Titan Embeddings)
- DynamoDB billing mode and capacity
- CloudWatch log retention periods
- Cognito MFA settings
- SES email addresses

## Database Schema

### DynamoDB Tables

**user-profiles**
```
PK: userId
Attributes: profile{}, onboarding_completed, createdAt, updatedAt
```

**chat-sessions**
```
PK: userId
SK: sessionId
Attributes: messages[], metadata{}, createdAt
```

**roadmap-items**
```
PK: userId
SK: itemId
Attributes: title, description, category, status, dueDate, notes[]
```

**document-metadata**
```
PK: userId
SK: documentId
Attributes: fileName, fileSize, s3Key, status, createdAt
```

**feedback**
```
PK: userId
SK: feedbackId
Attributes: messageId, helpful (boolean), createdAt
```

**LoggingTable**
```
PK: id
SK: timestamp
GSI: userId-timestamp-index
Attributes: requestType, metadata{}
```

## Monitoring & Observability

### CloudWatch Logs

All Lambda functions log to CloudWatch with 7-day retention:
```
/aws/lambda/LlmOpsQuickStartStack-{function-name}
```

### Activity Logging

User activities are logged to `LoggingTable` for admin dashboard analytics:
- User signups
- Onboarding completions
- Document uploads
- Chat sessions
- Roadmap interactions
- Feedback submissions

## Cost Optimization

### Estimated Monthly Costs (50-200 users)

- **Bedrock**: $80-250 (Claude API calls + embeddings)
- **OpenSearch Serverless**: $150-300 (2-8 OCUs)
- **Lambda**: $15-40 (invocations + duration)
- **DynamoDB**: $5-20 (on-demand pricing)
- **S3**: $5-15 (storage + requests)
- **Other Services**: $20-30 (API Gateway, CloudWatch, Cognito, SES)

**Total: $275-655/month** (depending on usage)

### Cost Optimization Tips

1. Use on-demand DynamoDB pricing (included)
2. Lambda memory optimization (configured to 1024 MB)
3. CloudWatch 7-day retention (configured)
4. S3 lifecycle policies for document cleanup (configure as needed)
5. Bedrock prompt optimization to reduce tokens

## Security

### IAM Least Privilege

Each Lambda function has minimal IAM permissions:
- Query Lambda: Read-only access to Bedrock KB, DynamoDB sessions, S3 documents
- Profile Lambda: Read/write to user-profiles table only
- Document Upload: Generate pre-signed URLs, write to S3 and DynamoDB
- Admin Functions: Cross-table read access for analytics

### Data Isolation

- All DynamoDB queries filtered by `userId` from Cognito JWT
- S3 objects prefixed with `userId/documentId/`
- API Gateway JWT validation on all endpoints
- Cognito groups for admin role separation

### Encryption

- DynamoDB tables encrypted at rest
- S3 server-side encryption (SSE-S3)
- HTTPS-only API endpoints
- Pre-signed URLs with 15-minute expiry

## Troubleshooting

### Common Issues

**Issue**: Lambda timeout errors
**Solution**: Increase timeout in `lib/backend-stack.ts` or optimize Lambda code

**Issue**: Knowledge Base sync fails
**Solution**: Check CloudWatch logs for `ingestion-status-checker` Lambda

**Issue**: SES emails not sending
**Solution**: Verify email addresses in SES console (sandbox mode requires verification)

**Issue**: API Gateway 401 errors
**Solution**: Check Cognito JWT token validity and User Pool configuration

### Useful Commands

```bash
# View stack outputs
npx cdk deploy --outputs-file outputs.json

# Diff changes before deploy
npx cdk diff

# Synthesize CloudFormation template
npx cdk synth

# Destroy all resources
npx cdk destroy --all
```

## Development Workflow

1. **Make code changes** in `../code/lambda/`
2. **Test locally** using sample events
3. **Deploy changes**: `npx cdk deploy`
4. **Monitor logs**: Check CloudWatch for errors
5. **Iterate** based on feedback

## Cleanup

To delete all resources:

```bash
npx cdk destroy --all
```

**Warning**: This will permanently delete:
- All DynamoDB data (profiles, sessions, roadmaps)
- All S3 documents
- All CloudWatch logs
- Cognito User Pool and all users

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon Bedrock Developer Guide](https://docs.aws.amazon.com/bedrock/)
- [API Gateway with Cognito Authorization](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

---

**Project**: RevStar Wellness Navigator
**Stack Name**: LlmOpsQuickStartStack
**Last Updated**: January 2025
