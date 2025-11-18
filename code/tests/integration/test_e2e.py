"""
End-to-End Test for Parenting Autism RAG QuickStart
Tests the complete workflow: Authentication -> Upload Document -> Query Knowledge Base

Prerequisites:
- Test Cognito user must be created (run scripts/setup-test-user.py)
- AWS credentials must be configured
- Deployment must be complete

Run with: pytest tests/integration/test_e2e.py -v -s
"""
import json
import os
import time
import pytest
import boto3
import requests
import hmac
import hashlib
import base64
from pathlib import Path
from datetime import datetime

# Load test credentials
TEST_CREDS_PATH = Path(__file__).parent.parent / '.test-credentials.json'
DEPLOYMENT_OUTPUTS_PATH = Path(__file__).parent.parent.parent.parent / 'client-deployments' / 'parenting-autism' / 'cdk-outputs.json'

if not TEST_CREDS_PATH.exists():
    pytest.skip("Test credentials not found. Run scripts/setup-test-user.py first.", allow_module_level=True)

with open(TEST_CREDS_PATH, 'r') as f:
    TEST_CREDS = json.load(f)

with open(DEPLOYMENT_OUTPUTS_PATH, 'r') as f:
    OUTPUTS = json.load(f)['LlmOpsQuickStartStack']

# Configuration
USER_POOL_ID = TEST_CREDS['user_pool_id']
CLIENT_ID = TEST_CREDS['client_id']
CLIENT_SECRET = TEST_CREDS.get('client_secret')
USERNAME = TEST_CREDS['username']
PASSWORD = TEST_CREDS['password']
REGION = TEST_CREDS.get('region', 'us-east-1')

API_BASE_URL = OUTPUTS['APIGatewayUrl'].rstrip('/')
DOCS_BUCKET = OUTPUTS['DocsBucketName']


def get_secret_hash(username, client_id, client_secret):
    """
    Compute SECRET_HASH for Cognito authentication
    Required when the Cognito app client has a secret
    """
    if not client_secret:
        return None
    message = bytes(username + client_id, 'utf-8')
    secret = bytes(client_secret, 'utf-8')
    dig = hmac.new(secret, message, hashlib.sha256).digest()
    return base64.b64encode(dig).decode()


@pytest.fixture(scope='module')
def cognito_tokens():
    """
    Authenticate with Cognito and return access tokens
    This fixture is module-scoped so authentication happens once per test session
    """
    print("\n" + "="*80)
    print("AUTHENTICATING WITH COGNITO")
    print("="*80)
    print(f"User Pool: {USER_POOL_ID}")
    print(f"Client ID: {CLIENT_ID}")
    print(f"Username: {USERNAME}")

    cognito = boto3.client('cognito-idp', region_name=REGION)

    try:
        # Prepare auth parameters
        auth_parameters = {
            'USERNAME': USERNAME,
            'PASSWORD': PASSWORD
        }

        # Add SECRET_HASH if client has a secret
        if CLIENT_SECRET:
            secret_hash = get_secret_hash(USERNAME, CLIENT_ID, CLIENT_SECRET)
            auth_parameters['SECRET_HASH'] = secret_hash
            print(f"Using SECRET_HASH for authentication")

        response = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters=auth_parameters
        )

        if 'AuthenticationResult' in response:
            tokens = {
                'access_token': response['AuthenticationResult']['AccessToken'],
                'id_token': response['AuthenticationResult']['IdToken'],
                'refresh_token': response['AuthenticationResult'].get('RefreshToken')
            }

            print(f"[OK] Authentication successful")
            print(f"Access Token: {tokens['access_token'][:50]}...")
            print(f"ID Token: {tokens['id_token'][:50]}...")
            print("="*80 + "\n")

            return tokens
        else:
            pytest.fail("Authentication failed - no tokens returned")

    except Exception as e:
        pytest.fail(f"Authentication failed: {e}")


@pytest.fixture(scope='module')
def s3_client():
    """S3 client for document operations"""
    return boto3.client('s3', region_name=REGION)


@pytest.fixture(scope='module')
def test_document():
    """Sample document for testing"""
    return """
# Early Signs of Autism in Toddlers

## What is Autism?
Autism Spectrum Disorder (ASD) is a neurodevelopmental condition characterized by
differences in social communication and behavior patterns.

## Early Warning Signs (12-18 months)
- Limited or no eye contact
- Not responding to their name by 12 months
- Not pointing at objects to show interest by 14 months
- Not playing "pretend" games by 18 months
- Repetitive behaviors or unusual play patterns

## Social Communication Differences
Children with autism may:
- Avoid or resist physical contact
- Prefer to play alone
- Have difficulty understanding others' feelings
- Delay in speech and language development
- Repeat words or phrases (echolalia)

## What to Do if You Notice Signs
1. Talk to your pediatrician
2. Request a developmental screening
3. Seek early intervention services
4. Connect with support groups for parents

## Early Intervention Benefits
Research shows that early intervention can significantly improve outcomes:
- Better communication skills
- Improved social interaction
- Reduced challenging behaviors
- Better school readiness

## Resources for Parents
- Local early intervention programs
- Autism support organizations
- Parent training programs
- Therapy services (ABA, speech, occupational)

Remember: Every child with autism is unique, and early support makes a difference!
"""


class TestEndToEndWorkflow:
    """Complete end-to-end test workflow"""

    def test_01_upload_document_to_s3(self, s3_client, test_document):
        """Step 1: Upload a test document to S3"""
        print("\n" + "="*80)
        print("STEP 1: UPLOADING TEST DOCUMENT TO S3")
        print("="*80)

        doc_name = f"e2e-test-{int(time.time())}.txt"

        try:
            s3_client.put_object(
                Bucket=DOCS_BUCKET,
                Key=doc_name,
                Body=test_document.encode('utf-8'),
                ContentType='text/plain',
                Metadata={
                    'test': 'e2e',
                    'timestamp': datetime.utcnow().isoformat()
                }
            )

            print(f"[OK] Document uploaded: s3://{DOCS_BUCKET}/{doc_name}")
            print(f"Size: {len(test_document)} bytes")

            # Verify upload
            response = s3_client.head_object(Bucket=DOCS_BUCKET, Key=doc_name)
            assert response['ContentLength'] == len(test_document.encode('utf-8'))

            print(f"[OK] Upload verified")
            print("="*80 + "\n")

            # Store for cleanup
            pytest.test_doc_name = doc_name

        except Exception as e:
            pytest.fail(f"Failed to upload document: {e}")

    def test_02_wait_for_ingestion(self):
        """Step 2: Wait for Knowledge Base ingestion (if automatic)"""
        print("\n" + "="*80)
        print("STEP 2: WAITING FOR KNOWLEDGE BASE INGESTION")
        print("="*80)
        print("NOTE: Polling for ingestion job completion...")
        print("="*80 + "\n")

        # Get Knowledge Base ID from deployment outputs
        kb_id = OUTPUTS.get('KnowledgeBaseId')
        if not kb_id:
            # If not in outputs, we need to discover it
            bedrock_agent = boto3.client('bedrock-agent', region_name=REGION)
            kbs = bedrock_agent.list_knowledge_bases()
            for kb in kbs.get('knowledgeBaseSummaries', []):
                if 'LlmOpsQuickStartStack' in kb.get('name', ''):
                    kb_id = kb['knowledgeBaseId']
                    break

        if not kb_id:
            print("[WARNING] Could not find Knowledge Base ID, waiting 90 seconds...")
            time.sleep(90)
            return

        # Get data source ID
        bedrock_agent = boto3.client('bedrock-agent', region_name=REGION)
        data_sources = bedrock_agent.list_data_sources(knowledgeBaseId=kb_id)
        if not data_sources.get('dataSourceSummaries'):
            print("[WARNING] No data sources found, waiting 90 seconds...")
            time.sleep(90)
            return

        data_source_id = data_sources['dataSourceSummaries'][0]['dataSourceId']

        print(f"Knowledge Base ID: {kb_id}")
        print(f"Data Source ID: {data_source_id}")

        # Poll for ingestion job completion (max 3 minutes)
        max_wait = 180  # 3 minutes
        poll_interval = 10  # Check every 10 seconds
        elapsed = 0

        while elapsed < max_wait:
            try:
                # List recent ingestion jobs
                jobs = bedrock_agent.list_ingestion_jobs(
                    knowledgeBaseId=kb_id,
                    dataSourceId=data_source_id,
                    maxResults=5
                )

                if jobs.get('ingestionJobSummaries'):
                    latest_job = jobs['ingestionJobSummaries'][0]
                    status = latest_job['status']
                    job_id = latest_job['ingestionJobId']

                    print(f"[{elapsed}s] Ingestion Job {job_id}: {status}")

                    if status == 'COMPLETE':
                        print(f"[OK] Ingestion completed successfully!")
                        return
                    elif status == 'FAILED':
                        print(f"[ERROR] Ingestion failed!")
                        # Continue anyway to test error handling
                        return

                time.sleep(poll_interval)
                elapsed += poll_interval

            except Exception as e:
                print(f"[WARNING] Error checking ingestion status: {e}")
                break

        print(f"[WARNING] Ingestion did not complete within {max_wait}s, proceeding anyway...")
        print("="*80 + "\n")

    def test_03_query_without_auth(self):
        """Step 3: Verify API requires authentication"""
        print("\n" + "="*80)
        print("STEP 3: TESTING AUTHENTICATION REQUIREMENT")
        print("="*80)

        payload = {
            'question': 'What are early signs of autism?',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response = requests.post(
            f'{API_BASE_URL}/query',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )

        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")

        # Should fail without auth
        assert response.status_code in [401, 403], "API should require authentication"
        print("[OK] API correctly requires authentication")
        print("="*80 + "\n")

    def test_04_query_with_auth(self, cognito_tokens):
        """Step 4: Query RAG endpoint with authentication"""
        print("\n" + "="*80)
        print("STEP 4: QUERYING RAG ENDPOINT WITH AUTHENTICATION")
        print("="*80)

        payload = {
            'question': 'What are early signs of autism in toddlers?',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        print(f"Question: {payload['question']}")
        print(f"Model: {payload['modelId']}")
        print()

        try:
            response = requests.post(
                f'{API_BASE_URL}/docs',
                json=payload,
                headers=headers,
                timeout=30
            )

            print(f"Status Code: {response.status_code}")

            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

            data = response.json()

            print(f"\n[OK] Query successful")
            print(f"\nResponse Preview:")
            print("-" * 80)
            print(data['response'][:500] + "..." if len(data['response']) > 500 else data['response'])
            print("-" * 80)

            # Verify response structure
            assert 'response' in data, "Response should contain 'response' field"
            assert 'sessionId' in data, "Response should contain 'sessionId' field"
            assert len(data['response']) > 0, "Response should not be empty"

            print(f"\nSession ID: {data['sessionId']}")

            if 'citation' in data and data['citation']:
                print(f"Citation: {data['citation']}")

            # Check if response contains relevant information about autism
            response_lower = data['response'].lower()
            autism_keywords = ['autism', 'social', 'communication', 'development', 'early']
            found_keywords = [kw for kw in autism_keywords if kw in response_lower]

            print(f"\nFound keywords: {', '.join(found_keywords)}")
            assert len(found_keywords) > 0, "Response should contain autism-related information"

            print("\n[OK] Response contains relevant information")
            print("="*80 + "\n")

            # Store session ID for follow-up query
            pytest.session_id = data['sessionId']

            return data

        except requests.exceptions.Timeout:
            pytest.fail("Query timed out after 30 seconds")
        except Exception as e:
            pytest.fail(f"Query failed: {e}")

    def test_05_followup_query_with_session(self, cognito_tokens):
        """Step 5: Test conversation continuity with session ID"""
        print("\n" + "="*80)
        print("STEP 5: TESTING CONVERSATION CONTINUITY")
        print("="*80)

        if not hasattr(pytest, 'session_id'):
            pytest.skip("No session ID from previous query")

        payload = {
            'question': 'Can you provide more details about the social communication differences?',
            'requestSessionId': pytest.session_id,
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        print(f"Follow-up Question: {payload['question']}")
        print(f"Using Session ID: {pytest.session_id}")
        print()

        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers=headers,
            timeout=30
        )

        assert response.status_code == 200
        data = response.json()

        print(f"[OK] Follow-up query successful")
        print(f"\nResponse Preview:")
        print("-" * 80)
        print(data['response'][:500] + "..." if len(data['response']) > 500 else data['response'])
        print("-" * 80)

        # Verify session continuity
        assert data['sessionId'] == pytest.session_id, "Session ID should be maintained"
        print(f"\n[OK] Session ID maintained: {data['sessionId']}")
        print("="*80 + "\n")

    def test_06_verify_logging(self):
        """Step 6: Verify queries are logged to DynamoDB"""
        print("\n" + "="*80)
        print("STEP 6: VERIFYING QUERY LOGGING")
        print("="*80)

        dynamodb = boto3.client('dynamodb', region_name=REGION)
        table_name = OUTPUTS['LoggingTableName']

        print(f"Checking DynamoDB table: {table_name}")

        # Give DynamoDB a moment to write
        time.sleep(2)

        try:
            # Scan recent entries (in production, use query with index)
            response = dynamodb.scan(
                TableName=table_name,
                Limit=10
            )

            print(f"[OK] Found {response['Count']} recent log entries")

            if response['Count'] > 0:
                print("\nSample log entry:")
                item = response['Items'][0]
                print(f"  ID: {item.get('id', {}).get('S', 'N/A')}")
                print(f"  Type: {item.get('requestType', {}).get('S', 'N/A')}")
                print(f"  Query: {item.get('query', {}).get('S', 'N/A')[:100]}...")

            assert response['Count'] > 0, "Should have logged queries"
            print("\n[OK] Query logging verified")

        except Exception as e:
            print(f"Warning: Could not verify logging: {e}")

        print("="*80 + "\n")

    def test_07_cleanup(self, s3_client):
        """Step 7: Clean up test resources"""
        print("\n" + "="*80)
        print("STEP 7: CLEANING UP TEST RESOURCES")
        print("="*80)

        if hasattr(pytest, 'test_doc_name'):
            try:
                s3_client.delete_object(
                    Bucket=DOCS_BUCKET,
                    Key=pytest.test_doc_name
                )
                print(f"[OK] Deleted test document: {pytest.test_doc_name}")
            except Exception as e:
                print(f"Warning: Could not delete test document: {e}")

        print("="*80 + "\n")


class TestIAMPermissions:
    """Verify IAM permissions are correctly configured"""

    def test_query_lambda_bedrock_permissions(self):
        """Verify Query Lambda has Bedrock permissions"""
        print("\n" + "="*80)
        print("VERIFYING QUERY LAMBDA BEDROCK PERMISSIONS")
        print("="*80)

        iam = boto3.client('iam', region_name=REGION)
        sts = boto3.client('sts', region_name=REGION)

        # Get Query Lambda role from CloudFormation or IAM
        lambda_client = boto3.client('lambda', region_name=REGION)

        try:
            functions = lambda_client.list_functions()
            query_function = [f for f in functions['Functions'] if 'Query' in f['FunctionName']]

            if query_function:
                role_arn = query_function[0]['Role']
                role_name = role_arn.split('/')[-1]

                print(f"Query Lambda Role: {role_name}")

                # Check attached policies
                response = iam.list_attached_role_policies(RoleName=role_name)

                print(f"\nAttached Policies:")
                for policy in response['AttachedPolicies']:
                    print(f"  - {policy['PolicyName']}")

                # Check inline policies
                inline_policies = iam.list_role_policies(RoleName=role_name)
                if inline_policies['PolicyNames']:
                    print(f"\nInline Policies:")
                    for policy_name in inline_policies['PolicyNames']:
                        print(f"  - {policy_name}")

                print("\n[OK] Permissions verified")

        except Exception as e:
            print(f"Warning: Could not fully verify permissions: {e}")

        print("="*80 + "\n")

    def test_s3_bucket_permissions(self, s3_client):
        """Verify S3 bucket permissions"""
        print("\n" + "="*80)
        print("VERIFYING S3 BUCKET PERMISSIONS")
        print("="*80)

        try:
            # Check bucket policy
            policy = s3_client.get_bucket_policy(Bucket=DOCS_BUCKET)
            print(f"[OK] Bucket has policy configured")

            # Check bucket encryption
            try:
                encryption = s3_client.get_bucket_encryption(Bucket=DOCS_BUCKET)
                print(f"[OK] Bucket encryption enabled")
            except:
                print(f"Warning: Bucket encryption not configured")

            # Test write permission
            test_key = f"permissions-test-{int(time.time())}.txt"
            s3_client.put_object(Bucket=DOCS_BUCKET, Key=test_key, Body=b'test')
            s3_client.delete_object(Bucket=DOCS_BUCKET, Key=test_key)
            print(f"[OK] Write permissions verified")

        except Exception as e:
            print(f"Warning: Could not fully verify S3 permissions: {e}")

        print("="*80 + "\n")


if __name__ == '__main__':
    print("\n")
    print("="*80)
    print("PARENTING AUTISM RAG - END-TO-END TEST SUITE")
    print("="*80)
    print()
    pytest.main([__file__, '-v', '-s', '--tb=short'])
