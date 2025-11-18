"""
Unit tests for Ingest Lambda function
Tests the Knowledge Base ingestion job handler with mocked AWS services
"""
import json
import os
import sys
import pytest
from unittest.mock import Mock, patch
from datetime import datetime

# Set up environment variables BEFORE importing the module
os.environ['KNOWLEDGE_BASE_ID'] = 'test-kb-id-789'
os.environ['DATA_SOURCE_ID'] = 'test-ds-id-456'

# Add the lambda directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/ingest'))

# Import the lambda handler
import index


@pytest.fixture
def lambda_context():
    """Mock Lambda context"""
    context = Mock()
    context.function_name = 'test-ingest-function'
    context.memory_limit_in_mb = 128
    context.invoked_function_arn = 'arn:aws:lambda:us-east-1:123456789012:function:test-ingest-function'
    context.aws_request_id = 'test-request-id-12345'
    return context


@pytest.fixture
def mock_env_vars():
    """Set up environment variables"""
    os.environ['KNOWLEDGE_BASE_ID'] = 'test-kb-id-789'
    os.environ['DATA_SOURCE_ID'] = 'test-ds-id-456'
    yield
    # Cleanup
    del os.environ['KNOWLEDGE_BASE_ID']
    del os.environ['DATA_SOURCE_ID']


@pytest.fixture
def ingest_event():
    """Sample S3 event that triggers ingestion"""
    return {
        'Records': [
            {
                'eventVersion': '2.1',
                'eventSource': 'aws:s3',
                'eventName': 'ObjectCreated:Put',
                's3': {
                    'bucket': {
                        'name': 'test-docs-bucket'
                    },
                    'object': {
                        'key': 'documents/test-file.pdf'
                    }
                }
            }
        ]
    }


@pytest.fixture
def mock_ingestion_response():
    """Mock successful ingestion job response"""
    return {
        'ingestionJob': {
            'knowledgeBaseId': 'test-kb-id-789',
            'dataSourceId': 'test-ds-id-456',
            'ingestionJobId': 'job-12345',
            'description': 'Ingestion job for documents',
            'status': 'STARTING',
            'statistics': {
                'numberOfDocumentsScanned': 0,
                'numberOfNewDocumentsIndexed': 0,
                'numberOfModifiedDocumentsIndexed': 0,
                'numberOfDocumentsDeleted': 0,
                'numberOfDocumentsFailed': 0
            },
            'startedAt': datetime(2025, 10, 6, 12, 0, 0),
            'updatedAt': datetime(2025, 10, 6, 12, 0, 0)
        }
    }


class TestIngestLambda:
    """Test suite for Ingest Lambda function"""

    def test_lambda_handler_success(self, ingest_event, lambda_context, mock_env_vars, mock_ingestion_response):
        """Test successful ingestion job start"""
        with patch.object(index, 'bedrock_agent') as mock_bedrock_agent:

            # Mock start_ingestion_job
            mock_bedrock_agent.start_ingestion_job.return_value = mock_ingestion_response

            # Execute
            response = index.lambda_handler(ingest_event, lambda_context)

            # Parse response
            response_data = json.loads(response)

            # Assertions
            assert 'ingestionJob' in response_data
            assert response_data['ingestionJob']['ingestionJobId'] == 'job-12345'
            assert response_data['ingestionJob']['status'] == 'STARTING'
            assert response_data['ingestionJob']['knowledgeBaseId'] == 'test-kb-id-789'
            assert response_data['ingestionJob']['dataSourceId'] == 'test-ds-id-456'

            # Verify Bedrock agent was called with correct parameters
            mock_bedrock_agent.start_ingestion_job.assert_called_once()
            call_args = mock_bedrock_agent.start_ingestion_job.call_args[1]
            assert call_args['knowledgeBaseId'] == 'test-kb-id-789'
            assert call_args['dataSourceId'] == 'test-ds-id-456'
            assert call_args['clientToken'] == 'test-request-id-12345'

    def test_lambda_handler_error(self, ingest_event, lambda_context, mock_env_vars):
        """Test error handling when ingestion job fails to start"""
        with patch.object(index, 'bedrock_agent') as mock_bedrock_agent:

            # Mock failure
            mock_bedrock_agent.start_ingestion_job.side_effect = Exception("Service unavailable")

            # Execute
            response = index.lambda_handler(ingest_event, lambda_context)

            # Parse response
            response_data = json.loads(response)

            # Assertions
            assert 'error' in response_data
            assert 'Service unavailable' in response_data['error']

    def test_lambda_handler_missing_env_vars(self, ingest_event, lambda_context):
        """Test error when environment variables are missing"""
        # Don't set environment variables

        with patch.object(index, 'bedrock_agent') as mock_bedrock_agent:

            # This should fail because env vars are None
            mock_bedrock_agent.start_ingestion_job.side_effect = Exception("Missing required parameters")

            response = index.lambda_handler(ingest_event, lambda_context)

            response_data = json.loads(response)
            assert 'error' in response_data

    def test_datetime_converter(self):
        """Test datetime serialization helper"""
        test_datetime = datetime(2025, 10, 6, 12, 30, 45)

        result = index.datetime_converter(test_datetime)

        assert result == '2025-10-06T12:30:45'

    def test_datetime_converter_invalid_type(self):
        """Test datetime converter with invalid type"""
        with pytest.raises(TypeError):
            index.datetime_converter("not a datetime")

    def test_lambda_handler_with_client_token(self, ingest_event, lambda_context, mock_env_vars, mock_ingestion_response):
        """Test that client token from request ID is used for idempotency"""
        with patch.object(index, 'bedrock_agent') as mock_bedrock_agent:

            mock_bedrock_agent.start_ingestion_job.return_value = mock_ingestion_response

            # Execute twice with same context
            response1 = index.lambda_handler(ingest_event, lambda_context)

            # Verify client token was used
            call_args = mock_bedrock_agent.start_ingestion_job.call_args[1]
            assert call_args['clientToken'] == lambda_context.aws_request_id

    def test_ingestion_job_response_structure(self, ingest_event, lambda_context, mock_env_vars, mock_ingestion_response):
        """Test that response structure matches AWS Bedrock ingestion job format"""
        with patch.object(index, 'bedrock_agent') as mock_bedrock_agent:

            mock_bedrock_agent.start_ingestion_job.return_value = mock_ingestion_response

            response = index.lambda_handler(ingest_event, lambda_context)
            response_data = json.loads(response)

            # Verify response structure
            assert 'ingestionJob' in response_data
            job_data = response_data['ingestionJob']

            # Verify required fields
            assert 'knowledgeBaseId' in job_data
            assert 'dataSourceId' in job_data
            assert 'ingestionJobId' in job_data
            assert 'status' in job_data
            assert 'statistics' in job_data

            # Verify statistics structure
            stats = job_data['statistics']
            assert 'numberOfDocumentsScanned' in stats
            assert 'numberOfNewDocumentsIndexed' in stats
            assert 'numberOfModifiedDocumentsIndexed' in stats
            assert 'numberOfDocumentsDeleted' in stats
            assert 'numberOfDocumentsFailed' in stats
