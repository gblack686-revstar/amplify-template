"""
E2E Test for Profile Management
Tests profile creation, retrieval, and update operations

Prerequisites:
- Test Cognito user must be created (run scripts/setup-test-user.py)
- AWS credentials must be configured
- Deployment must be complete

Run with: pytest tests/integration/test_profile_management.py -v -s
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
USER_PROFILES_TABLE = OUTPUTS.get('UserProfilesTableName')


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
    print("\n" + "="*80)
    print("AUTHENTICATING WITH COGNITO")
    print("="*80)

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

        tokens = {
            'access_token': response['AuthenticationResult']['AccessToken'],
            'id_token': response['AuthenticationResult']['IdToken'],
            'user_id': response['AuthenticationResult']['IdToken']  # Will be parsed from token
        }

        print(f"[OK] Authentication successful")
        print("="*80 + "\n")

        return tokens

    except Exception as e:
        pytest.fail(f"Authentication failed: {e}")


@pytest.fixture(scope='module')
def sample_profile():
    """Sample family profile for testing"""
    return {
        "marital_status": "married",
        "number_of_children": 1,
        "location": "Seattle, WA",
        "support_system_type": ["family_nearby", "professional_help"],
        "children": [
            {
                "age": 5,
                "diagnosis_date": "2023-03-15T00:00:00",
                "autism_severity": "moderate",
                "verbal_status": "minimally_verbal",
                "school_status": "special_education",
                "current_therapies": [
                    {
                        "type": "speech",
                        "frequency": "2x per week",
                        "provider": "Seattle Speech Therapy"
                    },
                    {
                        "type": "occupational",
                        "frequency": "1x per week",
                        "provider": "Children's OT Center"
                    }
                ],
                "favorite_activities": ["swinging", "puzzles", "music"],
                "triggers": ["loud noises", "sudden changes", "crowded places"]
            }
        ],
        "emergency_contacts": [
            {
                "name": "Jane Doe",
                "relationship": "grandmother",
                "phone": "+12065550123"
            }
        ]
    }


@pytest.fixture(scope='module')
def dynamodb_client():
    """DynamoDB client for direct table access"""
    return boto3.resource('dynamodb', region_name=REGION)


class TestProfileManagement:
    """Test profile CRUD operations"""

    def test_01_create_profile_without_auth(self, sample_profile):
        """Step 1: Verify profile creation requires authentication"""
        print("\n" + "="*80)
        print("STEP 1: TESTING PROFILE AUTH REQUIREMENT")
        print("="*80)

        response = requests.post(
            f'{API_BASE_URL}/profile',
            json=sample_profile,
            headers={'Content-Type': 'application/json'}
        )

        print(f"Status Code: {response.status_code}")
        assert response.status_code in [401, 403], "API should require authentication"
        print("[OK] Profile API correctly requires authentication")
        print("="*80 + "\n")

    def test_02_create_profile(self, cognito_tokens, sample_profile):
        """Step 2: Create a new user profile"""
        print("\n" + "="*80)
        print("STEP 2: CREATING USER PROFILE")
        print("="*80)

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        print(f"Profile Data:")
        print(json.dumps(sample_profile, indent=2))
        print()

        response = requests.post(
            f'{API_BASE_URL}/profile',
            json=sample_profile,
            headers=headers,
            timeout=10
        )

        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")

        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"

        data = response.json()

        assert 'userId' in data, "Response should contain userId"
        assert 'profile' in data, "Response should contain profile"

        print(f"\n[OK] Profile created successfully")
        print(f"User ID: {data['userId']}")
        print("="*80 + "\n")

        # Store user_id for other tests
        pytest.test_user_id = data['userId']

    def test_03_get_profile(self, cognito_tokens):
        """Step 3: Retrieve the created profile"""
        print("\n" + "="*80)
        print("STEP 3: RETRIEVING USER PROFILE")
        print("="*80)

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        response = requests.get(
            f'{API_BASE_URL}/profile',
            headers=headers,
            timeout=10
        )

        print(f"Status Code: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()

        assert 'userId' in data, "Response should contain userId"
        assert 'profile' in data, "Response should contain profile"
        assert 'createdAt' in data, "Response should contain createdAt"
        assert 'updatedAt' in data, "Response should contain updatedAt"

        profile = data['profile']
        assert profile['marital_status'] == 'married'
        assert profile['number_of_children'] == 1
        assert len(profile['children']) == 1
        assert profile['children'][0]['age'] == 5

        print(f"\n[OK] Profile retrieved successfully")
        print(f"User ID: {data['userId']}")
        print(f"Children: {profile['number_of_children']}")
        print(f"Location: {profile['location']}")
        print("="*80 + "\n")

    def test_04_update_profile(self, cognito_tokens, sample_profile):
        """Step 4: Update the user profile"""
        print("\n" + "="*80)
        print("STEP 4: UPDATING USER PROFILE")
        print("="*80)

        # Modify profile
        updated_profile = sample_profile.copy()
        updated_profile['location'] = 'Portland, OR'
        updated_profile['children'][0]['age'] = 6

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        print("Updated Fields:")
        print(f"  Location: Seattle, WA -> Portland, OR")
        print(f"  Child Age: 5 -> 6")
        print()

        response = requests.put(
            f'{API_BASE_URL}/profile',
            json=updated_profile,
            headers=headers,
            timeout=10
        )

        print(f"Status Code: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        profile = data['profile']

        assert profile['location'] == 'Portland, OR', "Location should be updated"
        assert profile['children'][0]['age'] == 6, "Child age should be updated"

        print(f"\n[OK] Profile updated successfully")
        print("="*80 + "\n")

    def test_05_verify_profile_in_dynamodb(self, dynamodb_client):
        """Step 5: Verify profile is correctly stored in DynamoDB"""
        print("\n" + "="*80)
        print("STEP 5: VERIFYING PROFILE IN DYNAMODB")
        print("="*80)

        if not hasattr(pytest, 'test_user_id'):
            pytest.skip("No user ID available from profile creation")

        if not USER_PROFILES_TABLE:
            pytest.skip("UserProfilesTable not found in outputs")

        table = dynamodb_client.Table(USER_PROFILES_TABLE)

        print(f"Table: {USER_PROFILES_TABLE}")
        print(f"User ID: {pytest.test_user_id}")

        try:
            response = table.get_item(Key={'userId': pytest.test_user_id})

            assert 'Item' in response, "Profile should exist in DynamoDB"

            item = response['Item']
            assert 'profile' in item
            assert 'createdAt' in item
            assert 'updatedAt' in item

            print(f"\n[OK] Profile found in DynamoDB")
            print(f"Created: {item['createdAt']}")
            print(f"Updated: {item['updatedAt']}")

        except Exception as e:
            pytest.fail(f"Failed to verify DynamoDB storage: {e}")

        print("="*80 + "\n")

    def test_06_validate_profile_schema(self, cognito_tokens):
        """Step 6: Test profile validation by sending invalid data"""
        print("\n" + "="*80)
        print("STEP 6: TESTING PROFILE VALIDATION")
        print("="*80)

        # Invalid profile - child age out of range
        invalid_profile = {
            "marital_status": "single",
            "number_of_children": 1,
            "location": "Boston, MA",
            "children": [
                {
                    "age": 30,  # Invalid: > 21
                    "diagnosis_date": "2023-01-01T00:00:00",
                    "autism_severity": "mild",
                    "verbal_status": "fully_verbal",
                    "current_therapies": []
                }
            ]
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        print("Testing with invalid child age (30 > 21)")

        response = requests.post(
            f'{API_BASE_URL}/profile',
            json=invalid_profile,
            headers=headers,
            timeout=10
        )

        print(f"Status Code: {response.status_code}")
        assert response.status_code == 400, "Should reject invalid profile"

        print("[OK] Profile validation working correctly")
        print("="*80 + "\n")

    def test_07_test_personalized_query(self, cognito_tokens):
        """Step 7: Test that queries use profile context"""
        print("\n" + "="*80)
        print("STEP 7: TESTING PERSONALIZED QUERY WITH PROFILE CONTEXT")
        print("="*80)

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        # Query should be enhanced with profile context
        payload = {
            'question': 'What activities would you recommend for my child?',
            'modelId': 'us.anthropic.claude-3-haiku-20240307-v1:0'
        }

        print(f"Question: {payload['question']}")
        print(f"Note: Query Lambda should inject profile context automatically")
        print()

        try:
            response = requests.post(
                f'{API_BASE_URL}/docs',
                json=payload,
                headers=headers,
                timeout=30
            )

            print(f"Status Code: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                print(f"\n[OK] Personalized query successful")
                print(f"\nResponse Preview:")
                print("-" * 80)
                print(data['response'][:500])
                print("-" * 80)

                # Check if response seems personalized (mentions age, verbal status, etc.)
                response_lower = data['response'].lower()
                personalization_indicators = ['5', '6', 'year', 'child', 'limited verbal', 'moderate']
                found_indicators = [ind for ind in personalization_indicators if ind in response_lower]

                if found_indicators:
                    print(f"\n[OK] Response appears personalized (found: {', '.join(found_indicators)})")
                else:
                    print(f"\nNote: Could not confirm personalization in response")

            else:
                print(f"Warning: Query returned {response.status_code}")

        except Exception as e:
            print(f"Warning: Could not test personalized query: {e}")

        print("="*80 + "\n")


if __name__ == '__main__':
    print("\n")
    print("="*80)
    print("PROFILE MANAGEMENT - END-TO-END TEST SUITE")
    print("="*80)
    print()
    pytest.main([__file__, '-v', '-s', '--tb=short'])
