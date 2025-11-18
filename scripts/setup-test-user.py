"""
Script to create a test Cognito user for E2E testing
"""
import json
import os
import boto3
from pathlib import Path

# Get User Pool ID from environment or discover it
USER_POOL_ID = os.environ.get('USER_POOL_ID')
CLIENT_ID = os.environ.get('CLIENT_ID')

if not USER_POOL_ID:
    # Try to get from deployment outputs
    try:
        deployment_outputs_path = Path(__file__).parent.parent / 'client-deployments' / 'parenting-autism' / 'cdk-outputs.json'
        with open(deployment_outputs_path, 'r') as f:
            outputs = json.load(f)['LlmOpsQuickStartStack']
        USER_POOL_ID = outputs.get('UserPoolId')
        CLIENT_ID = outputs.get('UserPoolClientId')
    except:
        pass

if not USER_POOL_ID:
    # Discover User Pool by listing
    cognito = boto3.client('cognito-idp', region_name='us-east-1')
    pools = cognito.list_user_pools(MaxResults=10)
    for pool in pools['UserPools']:
        if 'LlmOpsQuickStartStack' in pool['Name']:
            USER_POOL_ID = pool['Id']
            # Get client ID from pool
            clients = cognito.list_user_pool_clients(UserPoolId=USER_POOL_ID, MaxResults=10)
            if clients['UserPoolClients']:
                CLIENT_ID = clients['UserPoolClients'][0]['ClientId']
            break

if not USER_POOL_ID or not CLIENT_ID:
    print("ERROR: Could not find User Pool ID or Client ID")
    print("Please set USER_POOL_ID and CLIENT_ID environment variables")
    exit(1)

# Test user credentials
TEST_USERNAME = 'testuser@example.com'
TEST_PASSWORD = 'TestPassword123!'

def create_test_user():
    """Create a test user in Cognito User Pool"""
    cognito = boto3.client('cognito-idp', region_name='us-east-1')

    try:
        # Create user
        print(f"Creating test user: {TEST_USERNAME}")
        response = cognito.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=TEST_USERNAME,
            UserAttributes=[
                {'Name': 'email', 'Value': TEST_USERNAME},
                {'Name': 'email_verified', 'Value': 'true'}
            ],
            MessageAction='SUPPRESS',  # Don't send welcome email
            TemporaryPassword=TEST_PASSWORD
        )
        print(f"[OK] User created: {response['User']['Username']}")

        # Set permanent password
        print("Setting permanent password...")
        cognito.admin_set_user_password(
            UserPoolId=USER_POOL_ID,
            Username=TEST_USERNAME,
            Password=TEST_PASSWORD,
            Permanent=True
        )
        print("[OK] Password set")

        # Get user details
        user_details = cognito.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=TEST_USERNAME
        )

        print("\n" + "="*60)
        print("TEST USER CREATED SUCCESSFULLY")
        print("="*60)
        print(f"Username: {TEST_USERNAME}")
        print(f"Password: {TEST_PASSWORD}")
        print(f"User Pool ID: {USER_POOL_ID}")
        print(f"Client ID: {CLIENT_ID}")
        print(f"Status: {user_details['UserStatus']}")
        print("="*60)

        # Get client secret from deployment outputs
        CLIENT_SECRET = None
        try:
            deployment_outputs_path = Path(__file__).parent.parent / 'client-deployments' / 'parenting-autism' / 'cdk-outputs.json'
            with open(deployment_outputs_path, 'r') as f:
                outputs = json.load(f)['LlmOpsQuickStartStack']
            CLIENT_SECRET = outputs.get('UserPoolClientSecret')
        except Exception as e:
            print(f"[WARNING] Could not retrieve client secret from outputs: {e}")

        # Save credentials to file for E2E tests
        test_creds_path = Path(__file__).parent.parent / 'code' / 'tests' / '.test-credentials.json'
        test_creds = {
            'username': TEST_USERNAME,
            'password': TEST_PASSWORD,
            'user_pool_id': USER_POOL_ID,
            'client_id': CLIENT_ID,
            'client_secret': CLIENT_SECRET,
            'region': 'us-east-1'
        }

        with open(test_creds_path, 'w') as f:
            json.dump(test_creds, f, indent=2)
        print(f"\n[OK] Credentials saved to: {test_creds_path}")

        return True

    except cognito.exceptions.UsernameExistsException:
        print(f"User {TEST_USERNAME} already exists")
        print("Updating password...")

        # Update password for existing user
        cognito.admin_set_user_password(
            UserPoolId=USER_POOL_ID,
            Username=TEST_USERNAME,
            Password=TEST_PASSWORD,
            Permanent=True
        )
        print("[OK] Password updated")

        # Get client secret from deployment outputs
        CLIENT_SECRET = None
        try:
            deployment_outputs_path = Path(__file__).parent.parent / 'client-deployments' / 'parenting-autism' / 'cdk-outputs.json'
            with open(deployment_outputs_path, 'r') as f:
                outputs = json.load(f)['LlmOpsQuickStartStack']
            CLIENT_SECRET = outputs.get('UserPoolClientSecret')
        except Exception as e:
            print(f"[WARNING] Could not retrieve client secret from outputs: {e}")

        # Save credentials
        test_creds_path = Path(__file__).parent.parent / 'code' / 'tests' / '.test-credentials.json'
        test_creds = {
            'username': TEST_USERNAME,
            'password': TEST_PASSWORD,
            'user_pool_id': USER_POOL_ID,
            'client_id': CLIENT_ID,
            'client_secret': CLIENT_SECRET,
            'region': 'us-east-1'
        }

        with open(test_creds_path, 'w') as f:
            json.dump(test_creds, f, indent=2)
        print(f"[OK] Credentials saved to: {test_creds_path}")

        return True

    except Exception as e:
        print(f"[ERROR] Error creating user: {e}")
        return False

def test_authentication():
    """Test authentication with the created user"""
    cognito = boto3.client('cognito-idp', region_name='us-east-1')

    try:
        print("\nTesting authentication...")
        response = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow='ADMIN_NO_SRP_AUTH',
            AuthParameters={
                'USERNAME': TEST_USERNAME,
                'PASSWORD': TEST_PASSWORD
            }
        )

        if 'AuthenticationResult' in response:
            access_token = response['AuthenticationResult']['AccessToken']
            id_token = response['AuthenticationResult']['IdToken']
            print("[OK] Authentication successful")
            print(f"Access Token (first 50 chars): {access_token[:50]}...")
            print(f"ID Token (first 50 chars): {id_token[:50]}...")
            return True
        else:
            print("[ERROR] Authentication failed - no tokens returned")
            return False

    except Exception as e:
        print(f"[ERROR] Authentication test failed: {e}")
        return False

if __name__ == '__main__':
    print("Setting up test Cognito user...")
    print(f"User Pool ID: {USER_POOL_ID}")
    print(f"Client ID: {CLIENT_ID}")
    print()

    if create_test_user():
        test_authentication()
        print("\n[OK] Test user setup complete!")
    else:
        print("\n[ERROR] Test user setup failed")
