"""
Integration tests for Knowledge Base ingestion and retrieval
Tests the document upload, ingestion, and RAG query flow
"""
import json
import os
import time
import pytest
import boto3
from datetime import datetime

# Load deployment outputs
DEPLOYMENT_OUTPUTS_PATH = os.path.join(
    os.path.dirname(__file__),
    '../../../client-deployments/parenting-autism/cdk-outputs.json'
)

with open(DEPLOYMENT_OUTPUTS_PATH, 'r') as f:
    outputs = json.load(f)['LlmOpsQuickStartStack']

DOCS_BUCKET = outputs['DocsBucketName']


@pytest.fixture
def s3_client():
    """S3 client for document operations"""
    return boto3.client('s3', region_name='us-east-1')


@pytest.fixture
def bedrock_agent_client():
    """Bedrock Agent client for Knowledge Base operations"""
    return boto3.client('bedrock-agent', region_name='us-east-1')


@pytest.fixture
def sample_document():
    """Sample document content for testing"""
    return """
# Understanding Autism Spectrum Disorder

Autism Spectrum Disorder (ASD) is a developmental disability that can cause significant social,
communication, and behavioral challenges. The term "spectrum" reflects the wide variation in
challenges and strengths possessed by each person with autism.

## Common Signs and Symptoms

People with ASD may:
- Have difficulty with communication and interaction with other people
- Have restricted interests and repetitive behaviors
- Have symptoms that affect their ability to function in school, work, and other areas of life

## Early Signs in Children

Some early signs of autism in young children include:
- Not responding to their name by 12 months
- Not pointing at distant objects by 14 months
- Not playing pretend games by 18 months
- Avoiding eye contact and preferring to be alone
- Having delayed speech and language skills

## Diagnosis and Treatment

There is no medical test for autism. Diagnosis is based on observing behavior and development.
Early intervention can improve outcomes significantly. Treatment may include behavioral therapy,
speech therapy, occupational therapy, and educational interventions.

## Support for Families

Families of children with autism benefit from:
- Education about the disorder
- Support groups
- Respite care services
- Individualized education programs (IEPs)
- Behavioral and developmental interventions

## Resources

For more information, consult with healthcare providers, autism specialists, and organizations
like the Autism Society and Autism Speaks.
"""


class TestDocumentIngestion:
    """Integration tests for document upload and ingestion"""

    def test_upload_document_to_s3(self, s3_client, sample_document):
        """Test uploading a document to the docs bucket"""
        # Create a unique document name
        doc_name = f"test-doc-{int(time.time())}.txt"

        # Upload to S3
        s3_client.put_object(
            Bucket=DOCS_BUCKET,
            Key=doc_name,
            Body=sample_document.encode('utf-8'),
            ContentType='text/plain'
        )

        # Verify upload
        response = s3_client.head_object(Bucket=DOCS_BUCKET, Key=doc_name)
        assert response['ContentLength'] > 0

        print(f"Uploaded document: s3://{DOCS_BUCKET}/{doc_name}")

        # Cleanup
        s3_client.delete_object(Bucket=DOCS_BUCKET, Key=doc_name)

    def test_list_documents_in_bucket(self, s3_client):
        """Test listing documents in the docs bucket"""
        response = s3_client.list_objects_v2(Bucket=DOCS_BUCKET, MaxKeys=10)

        # Bucket should exist and be accessible
        assert 'Contents' in response or 'KeyCount' in response

        if 'Contents' in response:
            print(f"Found {len(response['Contents'])} documents in bucket")
            for obj in response['Contents'][:5]:
                print(f"  - {obj['Key']} ({obj['Size']} bytes)")

    def test_document_metadata(self, s3_client, sample_document):
        """Test setting and retrieving document metadata"""
        doc_name = f"test-metadata-{int(time.time())}.txt"

        # Upload with metadata
        s3_client.put_object(
            Bucket=DOCS_BUCKET,
            Key=doc_name,
            Body=sample_document.encode('utf-8'),
            ContentType='text/plain',
            Metadata={
                'source': 'integration-test',
                'category': 'autism-information',
                'version': '1.0'
            }
        )

        # Retrieve metadata
        response = s3_client.head_object(Bucket=DOCS_BUCKET, Key=doc_name)
        assert 'Metadata' in response
        assert response['Metadata']['source'] == 'integration-test'
        assert response['Metadata']['category'] == 'autism-information'

        # Cleanup
        s3_client.delete_object(Bucket=DOCS_BUCKET, Key=doc_name)


class TestKnowledgeBaseOperations:
    """Integration tests for Knowledge Base operations"""

    @pytest.mark.skip(reason="Requires Knowledge Base ID - implement after KB setup")
    def test_start_ingestion_job(self, bedrock_agent_client):
        """Test starting a Knowledge Base ingestion job"""
        # Note: This requires KNOWLEDGE_BASE_ID and DATA_SOURCE_ID from environment
        # In practice, these would come from the CDK outputs or environment variables

        kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
        ds_id = os.environ.get('DATA_SOURCE_ID')

        if not kb_id or not ds_id:
            pytest.skip("Knowledge Base and Data Source IDs not configured")

        response = bedrock_agent_client.start_ingestion_job(
            knowledgeBaseId=kb_id,
            dataSourceId=ds_id,
            description='Integration test ingestion job'
        )

        assert 'ingestionJob' in response
        job = response['ingestionJob']
        assert job['status'] in ['STARTING', 'IN_PROGRESS']
        assert job['knowledgeBaseId'] == kb_id

        print(f"Started ingestion job: {job['ingestionJobId']}")
        print(f"Status: {job['status']}")

    @pytest.mark.skip(reason="Requires Knowledge Base ID - implement after KB setup")
    def test_list_ingestion_jobs(self, bedrock_agent_client):
        """Test listing Knowledge Base ingestion jobs"""
        kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
        ds_id = os.environ.get('DATA_SOURCE_ID')

        if not kb_id or not ds_id:
            pytest.skip("Knowledge Base and Data Source IDs not configured")

        response = bedrock_agent_client.list_ingestion_jobs(
            knowledgeBaseId=kb_id,
            dataSourceId=ds_id,
            maxResults=10
        )

        assert 'ingestionJobSummaries' in response

        if response['ingestionJobSummaries']:
            print(f"Found {len(response['ingestionJobSummaries'])} ingestion jobs")
            for job in response['ingestionJobSummaries'][:3]:
                print(f"  - {job['ingestionJobId']}: {job['status']}")


class TestEndToEndFlow:
    """End-to-end integration tests"""

    @pytest.mark.skip(reason="Long-running test - run manually")
    def test_full_ingestion_and_query_flow(self, s3_client, sample_document):
        """
        Test the complete flow:
        1. Upload document to S3
        2. Wait for ingestion (triggered by S3 event)
        3. Query the Knowledge Base
        4. Verify response contains information from the document
        """
        import requests

        # 1. Upload document
        doc_name = f"test-e2e-{int(time.time())}.txt"
        s3_client.put_object(
            Bucket=DOCS_BUCKET,
            Key=doc_name,
            Body=sample_document.encode('utf-8'),
            ContentType='text/plain'
        )
        print(f"Uploaded document: {doc_name}")

        # 2. Wait for ingestion (Knowledge Base sync can take several minutes)
        print("Waiting for Knowledge Base ingestion (this may take 5-10 minutes)...")
        time.sleep(300)  # Wait 5 minutes

        # 3. Query the API
        api_url = outputs['APIGatewayUrl'].rstrip('/')
        payload = {
            'question': 'What are early signs of autism in children?',
            'modelId': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'
        }

        response = requests.post(
            f'{api_url}/query',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )

        assert response.status_code == 200
        data = response.json()

        # 4. Verify response
        response_text = data['response'].lower()

        # The response should contain information from our document
        # Check for key phrases that are in the uploaded document
        assert any(phrase in response_text for phrase in [
            'autism', 'developmental', 'communication', 'social'
        ]), "Response should contain autism-related information"

        print(f"Query response: {data['response'][:200]}...")

        if 'citation' in data and data['citation']:
            print(f"Citation: {data['citation']}")
            # Check if our document is cited
            assert doc_name in data['citation'] or \
                   DOCS_BUCKET in data['citation'], \
                   "Response should cite our uploaded document"

        # Cleanup
        s3_client.delete_object(Bucket=DOCS_BUCKET, Key=doc_name)


class TestBucketConfiguration:
    """Test S3 bucket configuration and permissions"""

    def test_bucket_exists(self, s3_client):
        """Test that the docs bucket exists and is accessible"""
        response = s3_client.head_bucket(Bucket=DOCS_BUCKET)
        assert response['ResponseMetadata']['HTTPStatusCode'] == 200

    def test_bucket_versioning(self, s3_client):
        """Test bucket versioning configuration"""
        try:
            response = s3_client.get_bucket_versioning(Bucket=DOCS_BUCKET)
            # Versioning may or may not be enabled
            print(f"Versioning status: {response.get('Status', 'Not Enabled')}")
        except Exception as e:
            pytest.skip(f"Could not check versioning: {e}")

    def test_bucket_encryption(self, s3_client):
        """Test bucket encryption configuration"""
        try:
            response = s3_client.get_bucket_encryption(Bucket=DOCS_BUCKET)
            assert 'ServerSideEncryptionConfiguration' in response
            print("Bucket encryption is enabled")
        except s3_client.exceptions.ServerSideEncryptionConfigurationNotFoundError:
            print("Warning: Bucket encryption is not enabled")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
