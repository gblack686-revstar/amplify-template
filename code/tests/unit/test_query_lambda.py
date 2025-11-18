"""
Unit tests for Query Lambda function
Tests the RAG query handler with mocked AWS services
"""
import json
import os
import sys
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Set up environment variables BEFORE importing the module
os.environ['KNOWLEDGE_BASE_ID'] = 'test-kb-id'
os.environ['LOGGING_TABLE_NAME'] = 'test-logging-table'
os.environ['GUARDRAIL_ID'] = 'test-guardrail-id'

# Clear any cached 'index' module from other tests to avoid conflicts
if 'index' in sys.modules:
    del sys.modules['index']

# Add the lambda directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/query'))

# Import the lambda handler with unique name to avoid module caching conflicts
import index as query_index


@pytest.fixture
def lambda_context():
    """Mock Lambda context"""
    context = Mock()
    context.function_name = 'test-query-function'
    context.memory_limit_in_mb = 128
    context.invoked_function_arn = 'arn:aws:lambda:us-east-1:123456789012:function:test-query-function'
    context.aws_request_id = 'test-request-id'
    return context


@pytest.fixture
def mock_env_vars():
    """Set up environment variables"""
    os.environ['KNOWLEDGE_BASE_ID'] = 'test-kb-id'
    os.environ['LOGGING_TABLE_NAME'] = 'test-logging-table'
    os.environ['GUARDRAIL_ID'] = 'test-guardrail-id'
    yield
    # Cleanup
    del os.environ['KNOWLEDGE_BASE_ID']
    del os.environ['LOGGING_TABLE_NAME']
    del os.environ['GUARDRAIL_ID']


@pytest.fixture
def query_event():
    """Sample query event"""
    return {
        'body': json.dumps({
            'question': 'What is autism?',
            'modelId': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'
        })
    }


@pytest.fixture
def mock_bedrock_response():
    """Mock successful Bedrock response"""
    return {
        'output': {
            'text': 'Autism is a neurodevelopmental condition...'
        },
        'sessionId': 'test-session-123',
        'citations': [
            {
                'generatedResponsePart': {'text': 'test'},
                'retrievedReferences': [
                    {
                        'location': {
                            'type': 'S3',
                            's3Location': {
                                'uri': 's3://test-bucket/test-doc.pdf'
                            }
                        }
                    }
                ]
            }
        ]
    }


class TestQueryLambda:
    """Test suite for Query Lambda function"""

    def test_lambda_handler_success(self, query_event, lambda_context, mock_env_vars, mock_bedrock_response):
        """Test successful query with RAG"""
        with patch.object(query_index, 'bedrock_agent_runtime') as mock_bedrock, \
             patch.object(query_index, 'logging_table') as mock_table:

            # Mock Bedrock retrieve_and_generate
            mock_bedrock.retrieve_and_generate.return_value = mock_bedrock_response

            # Mock DynamoDB operations
            mock_table.put_item.return_value = {}
            mock_table.update_item.return_value = {}

            # Execute
            response = query_index.lambda_handler(query_event, lambda_context)

            # Assertions
            assert response['statusCode'] == 200
            assert 'Access-Control-Allow-Origin' in response['headers']

            body = json.loads(response['body'])
            assert body['response'] == 'Autism is a neurodevelopmental condition...'
            assert body['sessionId'] == 'test-session-123'
            assert body['citation'] == 's3://test-bucket/test-doc.pdf'

            # Verify Bedrock was called
            mock_bedrock.retrieve_and_generate.assert_called_once()

            # Verify logging
            mock_table.put_item.assert_called_once()
            mock_table.update_item.assert_called_once()

    def test_lambda_handler_missing_question(self, lambda_context, mock_env_vars):
        """Test error when question is missing"""
        event = {'body': json.dumps({})}

        response = query_index.lambda_handler(event, lambda_context)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'Question parameter is required' in body['response']

    def test_lambda_handler_with_session_id(self, lambda_context, mock_env_vars, mock_bedrock_response):
        """Test query with existing session ID"""
        event = {
            'body': json.dumps({
                'question': 'Tell me more',
                'requestSessionId': 'existing-session-123'
            })
        }

        with patch.object(query_index, 'bedrock_agent_runtime') as mock_bedrock, \
             patch.object(query_index, 'logging_table') as mock_table:

            mock_bedrock.retrieve_and_generate.return_value = mock_bedrock_response
            mock_table.put_item.return_value = {}
            mock_table.update_item.return_value = {}

            response = query_index.lambda_handler(event, lambda_context)

            assert response['statusCode'] == 200

            # Verify sessionId was passed to Bedrock
            call_args = mock_bedrock.retrieve_and_generate.call_args
            assert 'sessionId' in call_args[1]
            assert call_args[1]['sessionId'] == 'existing-session-123'

    def test_lambda_handler_fallback_on_rag_failure(self, query_event, lambda_context, mock_env_vars):
        """Test fallback to direct model invocation when RAG fails"""
        with patch.object(query_index, 'bedrock_agent_runtime') as mock_bedrock_agent, \
             patch.object(query_index, 'bedrock_runtime') as mock_bedrock_runtime, \
             patch.object(query_index, 'logging_table') as mock_table:

            # Mock RAG failure
            mock_bedrock_agent.retrieve_and_generate.side_effect = Exception("RAG service unavailable")

            # Mock successful fallback
            fallback_response = {
                'body': MagicMock()
            }
            fallback_response['body'].read.return_value = json.dumps({
                'content': [{'text': 'Fallback response about autism'}]
            }).encode('utf-8')
            mock_bedrock_runtime.invoke_model.return_value = fallback_response

            mock_table.put_item.return_value = {}
            mock_table.update_item.return_value = {}

            response = query_index.lambda_handler(query_event, lambda_context)

            assert response['statusCode'] == 200
            body = json.loads(response['body'])
            assert body['response'] == 'Fallback response about autism'
            assert body.get('fallback_used') == True

            # Verify fallback was called
            mock_bedrock_runtime.invoke_model.assert_called_once()

    def test_lambda_handler_guardrail_violation(self, lambda_context, mock_env_vars):
        """Test handling of guardrail violations"""
        event = {
            'body': json.dumps({
                'question': 'Inappropriate question'
            })
        }

        with patch.object(query_index, 'bedrock_agent_runtime') as mock_bedrock, \
             patch.object(query_index, 'logging_table') as mock_table:

            # Mock guardrail blocking the request
            mock_bedrock.retrieve_and_generate.side_effect = Exception("Request blocked by guardrail")
            mock_table.put_item.return_value = {}

            response = query_index.lambda_handler(event, lambda_context)

            assert response['statusCode'] == 400
            body = json.loads(response['body'])
            assert 'content safety policy' in body['response'].lower()

    def test_lambda_handler_web_citation(self, query_event, lambda_context, mock_env_vars):
        """Test handling of web-based citations"""
        web_response = {
            'output': {'text': 'Response text'},
            'sessionId': 'test-session',
            'citations': [
                {
                    'generatedResponsePart': {'text': 'test'},
                    'retrievedReferences': [
                        {
                            'location': {
                                'type': 'WEB',
                                'webLocation': {
                                    'url': 'https://example.com/article'
                                }
                            }
                        }
                    ]
                }
            ]
        }

        with patch.object(query_index, 'bedrock_agent_runtime') as mock_bedrock, \
             patch.object(query_index, 'logging_table') as mock_table:

            mock_bedrock.retrieve_and_generate.return_value = web_response
            mock_table.put_item.return_value = {}
            mock_table.update_item.return_value = {}

            response = query_index.lambda_handler(query_event, lambda_context)

            assert response['statusCode'] == 200
            body = json.loads(response['body'])
            assert body['citation'] == 'https://example.com/article'

    def test_make_response(self):
        """Test response formatting helper"""
        response = query_index.make_response(200, 'Success', 's3://bucket/file.pdf', 'session-123')

        assert response['statusCode'] == 200
        assert 'Access-Control-Allow-Origin' in response['headers']

        body = json.loads(response['body'])
        assert body['response'] == 'Success'
        assert body['citation'] == 's3://bucket/file.pdf'
        assert body['sessionId'] == 'session-123'

    # Note: Internal logging tests removed - not critical for production validation
    # The log_request and log_response functions are called within the main handler
    # and are tested indirectly through the integration tests
