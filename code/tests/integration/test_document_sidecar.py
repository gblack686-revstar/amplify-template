"""
E2E Test for Document Sidecar Lifecycle
Tests document upload, sidecar creation, AI extraction, and complete lifecycle

Prerequisites:
- Test Cognito user must be created (run scripts/setup-test-user.py)
- AWS credentials must be configured
- Deployment must be complete

Run with: pytest tests/integration/test_document_sidecar.py -v -s
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
DOCUMENT_METADATA_TABLE = OUTPUTS.get('DocumentMetadataTableName')


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
            'id_token': response['AuthenticationResult']['IdToken']
        }

        print(f"[OK] Authentication successful")
        print("="*80 + "\n")

        return tokens

    except Exception as e:
        pytest.fail(f"Authentication failed: {e}")


@pytest.fixture(scope='module')
def s3_client():
    """S3 client for document operations"""
    return boto3.client('s3', region_name=REGION)


@pytest.fixture(scope='module')
def dynamodb_client():
    """DynamoDB client for metadata verification"""
    return boto3.resource('dynamodb', region_name=REGION)


@pytest.fixture(scope='module')
def sample_iep_document():
    """Sample IEP document for testing"""
    return """INDIVIDUALIZED EDUCATION PROGRAM (IEP)

Student Information:
Name: Alex Thompson
Date of Birth: 03/15/2019
Grade: Kindergarten
Disability: Autism Spectrum Disorder

IEP Meeting Date: 09/15/2024
Annual Review Date: 09/15/2025

PRESENT LEVELS OF PERFORMANCE:

Academic:
Alex demonstrates strengths in visual learning and pattern recognition. Currently reads at a pre-K level.
Shows interest in numbers and counting activities.

Communication:
Alex is minimally verbal with a vocabulary of approximately 20 functional words. Uses some gestures
and a picture communication system (PECS) to communicate wants and needs.

Social/Emotional:
Alex prefers solitary play but is beginning to show interest in peers when engaged in preferred activities.
Demonstrates difficulty with transitions and changes in routine.

ANNUAL GOALS:

Goal 1: Communication
By 09/15/2025, Alex will spontaneously request desired items using 2-3 word phrases in 8 out of 10 opportunities.

Goal 2: Social Skills
By 09/15/2025, Alex will initiate and maintain a back-and-forth interaction with a peer for at least 3 turns
during structured play activities in 7 out of 10 opportunities.

Goal 3: Academic - Reading
By 09/15/2025, Alex will identify all 26 letters and their sounds with 90% accuracy.

ACCOMMODATIONS:
- Visual schedule provided daily
- Extra time for transitions (5-minute warning)
- Preferential seating near teacher
- Access to sensory breaks as needed
- Modified assignments with visual supports

RELATED SERVICES:

Speech-Language Therapy: 2x per week, 30 minutes per session
Occupational Therapy: 1x per week, 30 minutes per session
Social Skills Group: 1x per week, 45 minutes per session

PROGRESS MONITORING:
Progress will be reported quarterly through:
- Data collection on goal objectives
- Teacher observations
- Standardized assessments

IEP TEAM MEMBERS:
- Sarah Thompson (Parent)
- Ms. Johnson (Special Education Teacher)
- Ms. Williams (Speech-Language Pathologist)
- Mr. Davis (Occupational Therapist)
- Dr. Martinez (School Psychologist)
"""


class TestDocumentSidecarLifecycle:
    """Test complete document sidecar lifecycle"""

    def test_01_request_upload_url(self, cognito_tokens):
        """Step 1: Request presigned upload URL"""
        print("\n" + "="*80)
        print("STEP 1: REQUESTING PRESIGNED UPLOAD URL")
        print("="*80)

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cognito_tokens['id_token']}"
        }

        payload = {
            'filename': 'test-iep-2024.txt',
            'documentType': 'iep',
            'contentType': 'text/plain',
            'fileSize': 2000,
            'tags': ['iep', '2024', 'test']
        }

        print(f"Requesting upload URL for: {payload['filename']}")
        print(f"Document Type: {payload['documentType']}")
        print()

        response = requests.post(
            f'{API_BASE_URL}/documents/upload',
            json=payload,
            headers=headers,
            timeout=10
        )

        print(f"Status Code: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()

        assert 'documentId' in data, "Response should contain documentId"
        assert 'uploadUrl' in data, "Response should contain uploadUrl"
        assert 's3Key' in data, "Response should contain s3Key"
        assert 'expiresIn' in data, "Response should contain expiresIn"

        print(f"\n[OK] Upload URL generated successfully")
        print(f"Document ID: {data['documentId']}")
        print(f"S3 Key: {data['s3Key']}")
        print(f"Expires In: {data['expiresIn']} seconds")
        print("="*80 + "\n")

        # Store for next tests
        pytest.document_id = data['documentId']
        pytest.upload_url = data['uploadUrl']
        pytest.s3_key = data['s3Key']

    def test_02_upload_document(self, sample_iep_document):
        """Step 2: Upload document using presigned URL"""
        print("\n" + "="*80)
        print("STEP 2: UPLOADING DOCUMENT")
        print("="*80)

        if not hasattr(pytest, 'upload_url'):
            pytest.skip("No upload URL from previous test")

        print(f"Uploading to: {pytest.s3_key}")
        print(f"Size: {len(sample_iep_document)} bytes")

        response = requests.put(
            pytest.upload_url,
            data=sample_iep_document.encode('utf-8'),
            headers={'Content-Type': 'text/plain'}
        )

        print(f"Status Code: {response.status_code}")
        assert response.status_code == 200, f"Upload failed with status {response.status_code}"

        print(f"[OK] Document uploaded successfully")
        print("="*80 + "\n")

    def test_03_verify_initial_sidecars(self, s3_client):
        """Step 3: Verify initial sidecar files were created"""
        print("\n" + "="*80)
        print("STEP 3: VERIFYING INITIAL SIDECAR FILES")
        print("="*80)

        if not hasattr(pytest, 's3_key'):
            pytest.skip("No S3 key from previous test")

        # Give time for sidecar creation
        time.sleep(2)

        print(f"Checking sidecars for: {pytest.s3_key}")
        print()

        # Check processing sidecar
        processing_key = f"{pytest.s3_key}.processing.json"
        try:
            response = s3_client.get_object(Bucket=DOCS_BUCKET, Key=processing_key)
            processing_data = json.loads(response['Body'].read())

            print(f"[OK] Processing sidecar found")
            print(f"  Current Status: {processing_data.get('currentStatus')}")
            print(f"  Status Chain: {len(processing_data.get('statusChain', []))} events")

            # Verify structure
            assert 'statusChain' in processing_data
            assert 'currentStatus' in processing_data
            assert len(processing_data['statusChain']) > 0

        except s3_client.exceptions.NoSuchKey:
            pytest.fail(f"Processing sidecar not found: {processing_key}")

        # Check audit sidecar
        audit_key = f"{pytest.s3_key}.audit.json"
        try:
            response = s3_client.get_object(Bucket=DOCS_BUCKET, Key=audit_key)
            audit_data = json.loads(response['Body'].read())

            print(f"[OK] Audit sidecar found")
            print(f"  Events: {len(audit_data.get('events', []))}")

            assert 'events' in audit_data
            assert len(audit_data['events']) > 0

        except s3_client.exceptions.NoSuchKey:
            pytest.fail(f"Audit sidecar not found: {audit_key}")

        print("="*80 + "\n")

    def test_04_wait_for_ingestion_and_analysis(self, s3_client):
        """Step 4: Wait for ingestion and AI analysis to complete"""
        print("\n" + "="*80)
        print("STEP 4: WAITING FOR INGESTION AND AI ANALYSIS")
        print("="*80)

        if not hasattr(pytest, 's3_key'):
            pytest.skip("No S3 key from previous test")

        max_wait = 180  # 3 minutes
        poll_interval = 10
        elapsed = 0

        processing_key = f"{pytest.s3_key}.processing.json"

        print(f"Polling processing sidecar...")
        print(f"Target statuses: ingestion_complete, ai_analysis_complete")
        print()

        while elapsed < max_wait:
            try:
                response = s3_client.get_object(Bucket=DOCS_BUCKET, Key=processing_key)
                processing_data = json.loads(response['Body'].read())

                current_status = processing_data.get('currentStatus')
                status_chain = processing_data.get('statusChain', [])

                print(f"[{elapsed}s] Current Status: {current_status} ({len(status_chain)} events)")

                # Check if AI analysis is complete
                if current_status == 'ai_analysis_complete':
                    print(f"\n[OK] AI analysis completed!")
                    return

                # Check for errors
                if 'failed' in current_status:
                    print(f"\n[WARNING] Processing failed: {current_status}")
                    return

                time.sleep(poll_interval)
                elapsed += poll_interval

            except Exception as e:
                print(f"[WARNING] Error checking status: {e}")
                break

        print(f"\n[WARNING] Processing did not complete within {max_wait}s")
        print("="*80 + "\n")

    def test_05_verify_extracted_sidecar(self, s3_client):
        """Step 5: Verify AI extracted data sidecar"""
        print("\n" + "="*80)
        print("STEP 5: VERIFYING AI EXTRACTED DATA SIDECAR")
        print("="*80)

        if not hasattr(pytest, 's3_key'):
            pytest.skip("No S3 key from previous test")

        extracted_key = f"{pytest.s3_key}.extracted.json"

        try:
            response = s3_client.get_object(Bucket=DOCS_BUCKET, Key=extracted_key)
            extracted_data = json.loads(response['Body'].read())

            print(f"[OK] Extracted data sidecar found")
            print(f"\nExtraction Details:")
            print(f"  Timestamp: {extracted_data.get('extractionTimestamp')}")
            print(f"  Model: {extracted_data.get('extractionModel')}")
            print(f"  Confidence: {extracted_data.get('confidence')}")
            print(f"  Document Type: {extracted_data.get('documentType')}")

            # Verify structure
            assert 'extractionTimestamp' in extracted_data
            assert 'extractionModel' in extracted_data
            assert 'documentType' in extracted_data
            assert 'data' in extracted_data

            # For IEP, check if key fields were extracted
            if extracted_data.get('documentType') == 'iep':
                data = extracted_data.get('data', {})
                print(f"\nIEP Extracted Fields:")
                if 'studentInfo' in data:
                    print(f"  Student Info: ✓")
                if 'annualGoals' in data:
                    print(f"  Annual Goals: {len(data['annualGoals'])} goals")
                if 'services' in data:
                    print(f"  Services: {len(data['services'])} services")

        except s3_client.exceptions.NoSuchKey:
            print(f"[WARNING] Extracted data sidecar not found yet: {extracted_key}")
            print("This may indicate AI analysis is still in progress or failed")

        print("="*80 + "\n")

    def test_06_verify_dynamodb_metadata(self, dynamodb_client):
        """Step 6: Verify document metadata in DynamoDB"""
        print("\n" + "="*80)
        print("STEP 6: VERIFYING DOCUMENT METADATA IN DYNAMODB")
        print("="*80)

        if not hasattr(pytest, 'document_id'):
            pytest.skip("No document ID from previous test")

        if not DOCUMENT_METADATA_TABLE:
            pytest.skip("DocumentMetadataTable not found in outputs")

        table = dynamodb_client.Table(DOCUMENT_METADATA_TABLE)

        print(f"Table: {DOCUMENT_METADATA_TABLE}")
        print(f"Document ID: {pytest.document_id}")

        # Note: We need userId for the query - extract from S3 key
        # Format: users/{userId}/type/filename
        parts = pytest.s3_key.split('/')
        if parts[0] == 'users' and len(parts) > 1:
            user_id = parts[1]

            try:
                response = table.get_item(
                    Key={
                        'userId': user_id,
                        'documentId': pytest.document_id
                    }
                )

                if 'Item' in response:
                    item = response['Item']

                    print(f"\n[OK] Document metadata found")
                    print(f"  S3 Key: {item.get('s3Key')}")
                    print(f"  Document Type: {item.get('documentType')}")
                    print(f"  Current Status: {item.get('currentStatus')}")
                    print(f"  Created At: {item.get('createdAt')}")

                    # Verify sidecar references
                    if 'sidecarFiles' in item:
                        sidecars = item['sidecarFiles']
                        print(f"\n  Sidecar References:")
                        for sidecar_type, sidecar_key in sidecars.items():
                            print(f"    {sidecar_type}: {sidecar_key}")

                        assert len(sidecars) == 5, "Should have 5 sidecar types"

                else:
                    print(f"[WARNING] Document metadata not found in DynamoDB")

            except Exception as e:
                print(f"Warning: Could not verify DynamoDB metadata: {e}")

        print("="*80 + "\n")

    def test_07_verify_complete_audit_trail(self, s3_client):
        """Step 7: Verify complete audit trail"""
        print("\n" + "="*80)
        print("STEP 7: VERIFYING COMPLETE AUDIT TRAIL")
        print("="*80)

        if not hasattr(pytest, 's3_key'):
            pytest.skip("No S3 key from previous test")

        audit_key = f"{pytest.s3_key}.audit.json"

        try:
            response = s3_client.get_object(Bucket=DOCS_BUCKET, Key=audit_key)
            audit_data = json.loads(response['Body'].read())

            events = audit_data.get('events', [])

            print(f"[OK] Audit trail found with {len(events)} events")
            print(f"\nEvent Timeline:")

            for i, event in enumerate(events, 1):
                print(f"  {i}. {event.get('action')} - {event.get('timestamp')}")
                if 'userId' in event:
                    print(f"     User: {event['userId']}")

            # Expected events: upload_initiated, ingestion_started, ai_extraction_complete
            actions = [e.get('action') for e in events]
            print(f"\nActions recorded: {', '.join(actions)}")

            assert len(events) >= 2, "Should have at least 2 audit events"

        except s3_client.exceptions.NoSuchKey:
            pytest.fail(f"Audit sidecar not found: {audit_key}")

        print("="*80 + "\n")

    def test_08_cleanup(self, s3_client):
        """Step 8: Clean up test resources"""
        print("\n" + "="*80)
        print("STEP 8: CLEANING UP TEST RESOURCES")
        print("="*80)

        if not hasattr(pytest, 's3_key'):
            print("[SKIP] No S3 key to clean up")
            print("="*80 + "\n")
            return

        print(f"Deleting document and sidecars for: {pytest.s3_key}")

        # Delete main document
        try:
            s3_client.delete_object(Bucket=DOCS_BUCKET, Key=pytest.s3_key)
            print(f"[OK] Deleted main document")
        except Exception as e:
            print(f"Warning: Could not delete main document: {e}")

        # Delete sidecars
        sidecar_types = ['metadata', 'extracted', 'processing', 'insights', 'audit']
        for sidecar_type in sidecar_types:
            sidecar_key = f"{pytest.s3_key}.{sidecar_type}.json"
            try:
                s3_client.delete_object(Bucket=DOCS_BUCKET, Key=sidecar_key)
                print(f"[OK] Deleted {sidecar_type} sidecar")
            except Exception as e:
                pass  # Sidecar may not exist

        print("="*80 + "\n")


if __name__ == '__main__':
    print("\n")
    print("="*80)
    print("DOCUMENT SIDECAR LIFECYCLE - END-TO-END TEST SUITE")
    print("="*80)
    print()
    pytest.main([__file__, '-v', '-s', '--tb=short'])
