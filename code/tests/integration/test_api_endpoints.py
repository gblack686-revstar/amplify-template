"""
Integration tests for API Gateway endpoints
Tests the deployed RAG API with real AWS services
"""
import json
import os
import time
import requests
import pytest
import boto3
import hmac
import hashlib
import base64
from datetime import datetime
from pathlib import Path

# Load deployment outputs
DEPLOYMENT_OUTPUTS_PATH = os.path.join(
    os.path.dirname(__file__),
    '../../../client-deployments/parenting-autism/cdk-outputs.json'
)

with open(DEPLOYMENT_OUTPUTS_PATH, 'r') as f:
    outputs = json.load(f)['LlmOpsQuickStartStack']

API_BASE_URL = outputs['APIGatewayUrl'].rstrip('/')
DOCS_BUCKET = outputs['DocsBucketName']
LOGGING_TABLE = outputs['LoggingTableName']

# Load test credentials
TEST_CREDS_PATH = Path(__file__).parent.parent / '.test-credentials.json'

if not TEST_CREDS_PATH.exists():
    pytest.skip("Test credentials not found. Run scripts/setup-test-user.py first.", allow_module_level=True)

with open(TEST_CREDS_PATH, 'r') as f:
    TEST_CREDS = json.load(f)

USER_POOL_ID = TEST_CREDS['user_pool_id']
CLIENT_ID = TEST_CREDS['client_id']
CLIENT_SECRET = TEST_CREDS.get('client_secret')
USERNAME = TEST_CREDS['username']
PASSWORD = TEST_CREDS['password']
REGION = TEST_CREDS.get('region', 'us-east-1')


def get_secret_hash(username, client_id, client_secret):
    """Compute SECRET_HASH for Cognito authentication"""
    if not client_secret:
        return None
    message = bytes(username + client_id, 'utf-8')
    secret = bytes(client_secret, 'utf-8')
    dig = hmac.new(secret, message, hashlib.sha256).digest()
    return base64.b64encode(dig).decode()


@pytest.fixture(scope='module')
def cognito_tokens():
    """Authenticate with Cognito and return access tokens"""
    cognito = boto3.client('cognito-idp', region_name=REGION)

    try:
        auth_parameters = {
            'USERNAME': USERNAME,
            'PASSWORD': PASSWORD
        }

        if CLIENT_SECRET:
            secret_hash = get_secret_hash(USERNAME, CLIENT_ID, CLIENT_SECRET)
            auth_parameters['SECRET_HASH'] = secret_hash

        response = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters=auth_parameters
        )

        if 'AuthenticationResult' in response:
            return {
                'access_token': response['AuthenticationResult']['AccessToken'],
                'id_token': response['AuthenticationResult']['IdToken'],
                'refresh_token': response['AuthenticationResult'].get('RefreshToken')
            }
        else:
            pytest.fail("Authentication failed - no tokens returned")

    except Exception as e:
        pytest.fail(f"Authentication failed: {e}")


@pytest.fixture
def dynamodb_client():
    """DynamoDB client for verifying logs"""
    return boto3.client('dynamodb', region_name='us-east-1')


@pytest.fixture
def s3_client():
    """S3 client for testing document uploads"""
    return boto3.client('s3', region_name='us-east-1')


class TestQueryEndpoint:
    """Integration tests for the /docs endpoint"""

    def test_query_endpoint_basic(self, cognito_tokens):
        """Test basic query to RAG endpoint"""
        payload = {
            'question': 'What is autism?',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {cognito_tokens['id_token']}"
            }
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert 'response' in data, "Response should contain 'response' field"
        assert 'sessionId' in data, "Response should contain 'sessionId' field"
        assert len(data['response']) > 0, "Response text should not be empty"

        print(f"Response: {data['response'][:200]}...")
        print(f"Session ID: {data['sessionId']}")

    def test_query_endpoint_missing_question(self, cognito_tokens):
        """Test query endpoint with missing question parameter"""
        payload = {
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {cognito_tokens['id_token']}"
            }
        )

        assert response.status_code == 400, f"Expected 400 for missing question, got {response.status_code}"

        data = response.json()
        assert 'response' in data
        assert 'required' in data['response'].lower() or 'missing' in data['response'].lower()

    def test_query_endpoint_with_session(self, cognito_tokens):
        """Test query continuation with session ID"""
        # First query
        payload1 = {
            'question': 'What is autism?',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        response1 = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload1,
            headers=headers
        )

        assert response1.status_code == 200, f"Expected 200, got {response1.status_code}: {response1.text}"
        data1 = response1.json()
        session_id = data1['sessionId']

        # Follow-up query with session
        payload2 = {
            'question': 'Tell me more about that',
            'requestSessionId': session_id,
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response2 = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload2,
            headers=headers
        )

        assert response2.status_code == 200
        data2 = response2.json()
        assert data2['sessionId'] == session_id, "Session ID should be preserved"
        assert len(data2['response']) > 0

    def test_query_endpoint_with_citation(self, cognito_tokens):
        """Test that query returns citations from Knowledge Base"""
        payload = {
            'question': 'What are the symptoms of autism?',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {cognito_tokens['id_token']}"
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Citation may be present if Knowledge Base has documents
        if 'citation' in data:
            assert data['citation'] is not None
            print(f"Citation: {data['citation']}")

    def test_query_logging_to_dynamodb(self, cognito_tokens, dynamodb_client):
        """Test that queries are logged to DynamoDB"""
        # Make a unique query
        unique_query = f"Test query at {datetime.utcnow().isoformat()}"
        payload = {
            'question': unique_query,
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {cognito_tokens['id_token']}"
            }
        )

        assert response.status_code == 200

        # Wait for DynamoDB write (increased from 2s)
        time.sleep(5)

        # Scan for the query in DynamoDB with pagination support
        found = False
        scan_kwargs = {
            'TableName': LOGGING_TABLE,
            'FilterExpression': 'contains(#q, :query)',
            'ExpressionAttributeNames': {'#q': 'query'},
            'ExpressionAttributeValues': {':query': {'S': unique_query}},
            'Limit': 50
        }

        # Handle pagination
        for attempt in range(3):
            response = dynamodb_client.scan(**scan_kwargs)
            if response['Count'] > 0:
                found = True
                break
            if 'LastEvaluatedKey' in response:
                scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
            else:
                break

        assert found, "Query should be logged in DynamoDB"

        # Verify log entry structure
        item = response['Items'][0]
        assert 'id' in item
        assert 'query' in item
        assert 'requestType' in item
        assert item['requestType']['S'] == 'query'


class TestHealthCheck:
    """Integration tests for health check endpoints"""

    def test_root_endpoint(self):
        """Test root endpoint returns 200"""
        response = requests.get(API_BASE_URL)

        # Should return 200 or 404 depending on configuration
        assert response.status_code in [200, 404, 403]

    def test_cors_headers(self, cognito_tokens):
        """Test CORS headers are present"""
        payload = {
            'question': 'Test',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {cognito_tokens['id_token']}"
            }
        )

        assert response.status_code == 200
        assert 'Access-Control-Allow-Origin' in response.headers or \
               'access-control-allow-origin' in response.headers


class TestPerformance:
    """Performance integration tests"""

    def test_query_response_time(self, cognito_tokens):
        """Test query response time is reasonable"""
        payload = {
            'question': 'What is autism?',
            'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
        }

        start_time = time.time()
        response = requests.post(
            f'{API_BASE_URL}/docs',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {cognito_tokens['id_token']}"
            },
            timeout=30  # 30 second timeout
        )
        end_time = time.time()

        assert response.status_code == 200

        response_time = end_time - start_time
        print(f"Response time: {response_time:.2f} seconds")

        # Bedrock queries can take time, but should complete within 30 seconds
        assert response_time < 30, f"Query took too long: {response_time:.2f} seconds"

    @pytest.mark.skip(reason="Load test - run manually")
    def test_concurrent_queries(self, cognito_tokens):
        """Test handling of concurrent queries (manual load test)"""
        import concurrent.futures

        def make_query(i):
            payload = {
                'question': f'What is autism? Query {i}',
                'modelId': 'anthropic.claude-3-haiku-20240307-v1:0'
            }
            response = requests.post(
                f'{API_BASE_URL}/docs',
                json=payload,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f"Bearer {cognito_tokens['id_token']}"
                }
            )
            return response.status_code

        # Test 5 concurrent queries
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_query, i) for i in range(5)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        # All should succeed
        assert all(status == 200 for status in results)


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
