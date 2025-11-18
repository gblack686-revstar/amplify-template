# End-to-End Testing Guide

This guide explains how to set up and run the comprehensive E2E tests for the Parenting Autism RAG QuickStart.

## Prerequisites

1. **AWS Deployment Complete**
   - Run `cdk deploy` in the `infra/` directory
   - Verify all resources are created

2. **AWS Credentials Configured**
   - Ensure your AWS CLI is configured with appropriate credentials
   - Account: 909899699131
   - Region: us-east-1

3. **Python Dependencies Installed**
   ```bash
   cd code/tests
   pip install -r requirements-test.txt
   ```

## Setup Steps

### 1. Create Test Cognito User

Run the setup script to create a test user in Cognito:

```bash
cd quickstart-parenting-autism
python scripts/setup-test-user.py
```

This script will:
- Discover or use the deployed Cognito User Pool
- Create a test user: `testuser@example.com`
- Set password: `TestPassword123!`
- Save credentials to `code/tests/.test-credentials.json`
- Test authentication to verify setup

**Output:**
```
============================================================
TEST USER CREATED SUCCESSFULLY
============================================================
Username: testuser@example.com
Password: TestPassword123!
User Pool ID: us-east-1_XXXXXXXXX
Client ID: xxxxxxxxxxxxx
Status: CONFIRMED
============================================================
```

### 2. Verify IAM Permissions

The E2E tests will verify that Lambda functions have proper permissions:

**Query Lambda needs:**
- `bedrock:InvokeModel` - For direct model calls
- `bedrock:Retrieve` - For Knowledge Base queries
- `bedrock:RetrieveAndGenerate` - For RAG queries
- `dynamodb:PutItem` - For logging requests
- `dynamodb:UpdateItem` - For logging responses

**Ingest Lambda needs:**
- `bedrock:StartIngestionJob` - For triggering Knowledge Base ingestion
- `s3:GetObject` - For reading uploaded documents

### 3. Review Test Configuration

Check that `code/tests/.test-credentials.json` exists:

```json
{
  "username": "testuser@example.com",
  "password": "TestPassword123!",
  "user_pool_id": "us-east-1_XXXXXXXXX",
  "client_id": "xxxxxxxxxxxxx",
  "region": "us-east-1"
}
```

**Important:** Add `.test-credentials.json` to `.gitignore` to avoid committing credentials!

## Running E2E Tests

### Run All E2E Tests

```bash
cd code
pytest tests/integration/test_e2e.py -v -s
```

The `-s` flag shows print statements for detailed test progress.

### Run Specific Test Classes

```bash
# Test only the main workflow
pytest tests/integration/test_e2e.py::TestEndToEndWorkflow -v -s

# Test only IAM permissions
pytest tests/integration/test_e2e.py::TestIAMPermissions -v -s
```

### Run Specific Tests

```bash
# Test only authentication
pytest tests/integration/test_e2e.py::TestEndToEndWorkflow::test_04_query_with_auth -v -s

# Test only document upload
pytest tests/integration/test_e2e.py::TestEndToEndWorkflow::test_01_upload_document_to_s3 -v -s
```

## Test Flow

The E2E tests run in sequence:

1. **Document Upload** - Uploads a test document to S3
2. **Ingestion Wait** - Waits for Knowledge Base to ingest the document
3. **Auth Test** - Verifies API requires authentication (should fail without token)
4. **Query Test** - Queries RAG endpoint with proper authentication
5. **Follow-up Query** - Tests conversation continuity with session ID
6. **Logging Verification** - Checks that queries are logged to DynamoDB
7. **Cleanup** - Removes test document from S3

## Expected Output

```
============================================================
PARENTING AUTISM RAG - END-TO-END TEST SUITE
============================================================

============================================================
AUTHENTICATING WITH COGNITO
============================================================
User Pool: us-east-1_XXXXXXXXX
Client ID: xxxxxxxxxxxxx
Username: testuser@example.com
[OK] Authentication successful
Access Token: eyJraWQiOiJxxx...
ID Token: eyJraWQiOiJxxx...
============================================================

============================================================
STEP 1: UPLOADING TEST DOCUMENT TO S3
============================================================
[OK] Document uploaded: s3://bucket-name/e2e-test-1728xxx.txt
Size: 1234 bytes
[OK] Upload verified
============================================================

============================================================
STEP 2: WAITING FOR KNOWLEDGE BASE INGESTION
============================================================
NOTE: Automatic ingestion via S3 triggers may take 1-2 minutes
For testing, we'll wait 30 seconds for initial ingestion...
============================================================

============================================================
STEP 3: TESTING AUTHENTICATION REQUIREMENT
============================================================
Status Code: 403
Response: {"message":"Missing Authentication Token"}
[OK] API correctly requires authentication
============================================================

============================================================
STEP 4: QUERYING RAG ENDPOINT WITH AUTHENTICATION
============================================================
Question: What are early signs of autism in toddlers?
Model: us.anthropic.claude-3-7-sonnet-20250219-v1:0

Status Code: 200

[OK] Query successful

Response Preview:
--------------------------------------------------------------------------------
Early signs of autism in toddlers typically appear between 12-18 months and may
include: limited or no eye contact, not responding to their name by 12 months...
--------------------------------------------------------------------------------

Session ID: abc-123-def-456
Citation: s3://bucket-name/e2e-test-1728xxx.txt

Found keywords: autism, social, communication, development, early

[OK] Response contains relevant information
============================================================

...

PASSED
```

## Troubleshooting

### Test Credentials Not Found

```
ERROR: Test credentials not found. Run scripts/setup-test-user.py first.
```

**Solution:** Run the setup script:
```bash
python scripts/setup-test-user.py
```

### Authentication Failed

```
ERROR: Authentication failed: An error occurred (NotAuthorizedException)
```

**Solution:**
1. Verify User Pool ID and Client ID are correct
2. Check that the user exists in Cognito
3. Verify password meets requirements

### API Returns 403

```
ERROR: Expected 200, got 403: {"message":"Missing Authentication Token"}
```

**Solution:**
1. Check that the Cognito Authorizer is configured on API Gateway
2. Verify the ID token is being sent in the Authorization header
3. Check API Gateway logs in CloudWatch

### Query Timeout

```
ERROR: Query timed out after 30 seconds
```

**Solution:**
1. Increase timeout in test configuration
2. Check Lambda function logs in CloudWatch
3. Verify Bedrock model access is configured

### No Documents in Knowledge Base

If queries don't return relevant information:

1. **Check S3 Bucket:**
   ```bash
   aws s3 ls s3://your-docs-bucket/
   ```

2. **Trigger Manual Ingestion:**
   ```bash
   aws bedrock-agent start-ingestion-job \
     --knowledge-base-id your-kb-id \
     --data-source-id your-ds-id
   ```

3. **Wait for Ingestion:**
   Knowledge Base ingestion can take 5-10 minutes for new documents.

## CI/CD Integration

To run E2E tests in CI/CD:

1. Store test credentials as secrets
2. Use AWS IAM roles for authentication
3. Run tests after deployment:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    USER_POOL_ID: ${{ secrets.USER_POOL_ID }}
    CLIENT_ID: ${{ secrets.CLIENT_ID }}
  run: |
    cd code
    pytest tests/integration/test_e2e.py -v
```

## Cleanup

To remove the test user:

```bash
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com \
  --region us-east-1
```

## Security Notes

- **Never commit** `.test-credentials.json` to version control
- **Use separate** test users for different environments
- **Rotate passwords** regularly
- **Delete test users** when no longer needed
- **Monitor** CloudWatch logs for suspicious activity

## Support

For issues or questions:
1. Check CloudWatch logs for Lambda functions
2. Review API Gateway execution logs
3. Verify Bedrock Knowledge Base ingestion status
4. Contact the QuickStart team

---

**Last Updated:** October 2025
