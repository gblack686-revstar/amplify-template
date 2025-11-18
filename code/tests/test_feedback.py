"""
Tests for Feedback Lambda function
"""
import os
import sys

# Add the feedback Lambda directory to Python path
feedback_lambda_path = os.path.join(os.path.dirname(__file__), '..', 'lambda', 'feedback')
sys.path.insert(0, feedback_lambda_path)

# Set environment variables before importing index
os.environ['FEEDBACK_TABLE_NAME'] = 'test-feedback-table'
os.environ['LOGGING_TABLE_NAME'] = 'test-logging-table'

import json
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from index import lambda_handler, get_user_id_from_event


@pytest.fixture
def mock_dynamodb_table():
    """Mock DynamoDB table"""
    with patch('index.feedback_table') as mock_table:
        yield mock_table


@pytest.fixture
def mock_event_post():
    """Mock API Gateway POST event"""
    return {
        'httpMethod': 'POST',
        'body': json.dumps({
            'messageId': 'msg-123',
            'sessionId': 'session-456',
            'feedbackType': 'positive',
            'comment': 'Very helpful'
        }),
        'requestContext': {
            'authorizer': {
                'claims': {
                    'sub': 'user-123',
                    'cognito:username': 'testuser'
                }
            }
        }
    }


@pytest.fixture
def mock_event_get():
    """Mock API Gateway GET event"""
    return {
        'httpMethod': 'GET',
        'pathParameters': {
            'messageId': 'msg-123'
        },
        'requestContext': {
            'authorizer': {
                'claims': {
                    'sub': 'user-123'
                }
            }
        }
    }


@pytest.fixture
def mock_event_put():
    """Mock API Gateway PUT event"""
    return {
        'httpMethod': 'PUT',
        'pathParameters': {
            'messageId': 'msg-123'
        },
        'body': json.dumps({
            'feedbackType': 'negative',
            'comment': 'Not helpful'
        }),
        'requestContext': {
            'authorizer': {
                'claims': {
                    'sub': 'user-123'
                }
            }
        }
    }


@pytest.fixture
def mock_event_delete():
    """Mock API Gateway DELETE event"""
    return {
        'httpMethod': 'DELETE',
        'pathParameters': {
            'messageId': 'msg-123'
        },
        'requestContext': {
            'authorizer': {
                'claims': {
                    'sub': 'user-123'
                }
            }
        }
    }


class TestGetUserId:
    """Tests for get_user_id_from_event function"""

    def test_get_user_id_from_sub(self):
        """Should extract user ID from sub claim"""
        event = {
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'sub': 'user-123'
                    }
                }
            }
        }
        user_id = get_user_id_from_event(event)
        assert user_id == 'user-123'

    def test_get_user_id_from_cognito_username(self):
        """Should extract user ID from cognito:username when sub is missing"""
        event = {
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'cognito:username': 'testuser'
                    }
                }
            }
        }
        user_id = get_user_id_from_event(event)
        assert user_id == 'testuser'

    def test_get_user_id_missing_claims(self):
        """Should raise ValueError when claims are missing"""
        event = {
            'requestContext': {
                'authorizer': {}
            }
        }
        with pytest.raises(ValueError, match="Invalid authorization context"):
            get_user_id_from_event(event)

    def test_get_user_id_no_user_id(self):
        """Should raise ValueError when no user ID in claims"""
        event = {
            'requestContext': {
                'authorizer': {
                    'claims': {}
                }
            }
        }
        with pytest.raises(ValueError, match="Could not extract userId"):
            get_user_id_from_event(event)


class TestPostFeedback:
    """Tests for POST /feedback endpoint"""

    @patch('index.uuid.uuid4')
    @patch('index.datetime')
    def test_submit_feedback_success(self, mock_datetime, mock_uuid, mock_event_post, mock_dynamodb_table):
        """Should successfully submit new feedback"""
        mock_uuid.return_value = 'feedback-789'
        mock_datetime.utcnow.return_value.isoformat.return_value = '2025-10-16T10:00:00Z'
        mock_dynamodb_table.get_item.return_value = {}  # No existing feedback

        response = lambda_handler(mock_event_post, None)

        assert response['statusCode'] == 201
        body = json.loads(response['body'])
        assert body['feedbackId'] == 'feedback-789'
        assert body['messageId'] == 'msg-123'
        assert body['feedbackType'] == 'positive'
        assert 'timestamp' in body

        # Verify DynamoDB put_item was called
        mock_dynamodb_table.put_item.assert_called_once()
        call_args = mock_dynamodb_table.put_item.call_args[1]
        assert call_args['Item']['userId'] == 'user-123'
        assert call_args['Item']['messageId'] == 'msg-123'
        assert call_args['Item']['feedbackType'] == 'positive'
        assert call_args['Item']['comment'] == 'Very helpful'

    def test_submit_feedback_missing_message_id(self, mock_dynamodb_table):
        """Should return 400 when messageId is missing"""
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                'feedbackType': 'positive'
            }),
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'messageId' in body['error']

    def test_submit_feedback_invalid_type(self, mock_dynamodb_table):
        """Should return 400 when feedbackType is invalid"""
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                'messageId': 'msg-123',
                'feedbackType': 'invalid'
            }),
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'positive' in body['error'] or 'negative' in body['error']

    def test_submit_feedback_already_exists(self, mock_event_post, mock_dynamodb_table):
        """Should return 409 when feedback already exists"""
        mock_dynamodb_table.get_item.return_value = {
            'Item': {
                'userId': 'user-123',
                'messageId': 'msg-123',
                'feedbackType': 'positive'
            }
        }

        response = lambda_handler(mock_event_post, None)

        assert response['statusCode'] == 409
        body = json.loads(response['body'])
        assert 'already exists' in body['error']

    def test_submit_feedback_invalid_json(self, mock_dynamodb_table):
        """Should return 400 when body is invalid JSON"""
        event = {
            'httpMethod': 'POST',
            'body': 'invalid json',
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'JSON' in body['error']


class TestGetFeedback:
    """Tests for GET /feedback/{messageId} endpoint"""

    def test_get_feedback_success(self, mock_event_get, mock_dynamodb_table):
        """Should successfully retrieve feedback"""
        mock_dynamodb_table.get_item.return_value = {
            'Item': {
                'userId': 'user-123',
                'messageId': 'msg-123',
                'feedbackId': 'feedback-789',
                'feedbackType': 'positive',
                'comment': 'Helpful',
                'createdAt': '2025-10-16T10:00:00Z'
            }
        }

        response = lambda_handler(mock_event_get, None)

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['feedbackId'] == 'feedback-789'
        assert body['messageId'] == 'msg-123'
        assert body['feedbackType'] == 'positive'
        assert body['comment'] == 'Helpful'

    def test_get_feedback_not_found(self, mock_event_get, mock_dynamodb_table):
        """Should return 404 when feedback not found"""
        mock_dynamodb_table.get_item.return_value = {}

        response = lambda_handler(mock_event_get, None)

        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert 'not found' in body['error']

    def test_get_feedback_missing_message_id(self, mock_dynamodb_table):
        """Should return 400 when messageId is missing"""
        event = {
            'httpMethod': 'GET',
            'pathParameters': {},
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'messageId' in body['error']


class TestUpdateFeedback:
    """Tests for PUT /feedback/{messageId} endpoint"""

    @patch('index.datetime')
    def test_update_feedback_success(self, mock_datetime, mock_event_put, mock_dynamodb_table):
        """Should successfully update feedback"""
        mock_datetime.utcnow.return_value.isoformat.return_value = '2025-10-16T10:05:00Z'
        mock_dynamodb_table.get_item.return_value = {
            'Item': {
                'userId': 'user-123',
                'messageId': 'msg-123',
                'feedbackType': 'positive'
            }
        }

        response = lambda_handler(mock_event_put, None)

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['messageId'] == 'msg-123'
        assert body['feedbackType'] == 'negative'

        # Verify update_item was called
        mock_dynamodb_table.update_item.assert_called_once()

    def test_update_feedback_not_found(self, mock_event_put, mock_dynamodb_table):
        """Should return 404 when feedback doesn't exist"""
        mock_dynamodb_table.get_item.return_value = {}

        response = lambda_handler(mock_event_put, None)

        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert 'not found' in body['error']

    def test_update_feedback_missing_type(self, mock_dynamodb_table):
        """Should return 400 when feedbackType is missing"""
        event = {
            'httpMethod': 'PUT',
            'pathParameters': {'messageId': 'msg-123'},
            'body': json.dumps({}),
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'feedbackType' in body['error']


class TestDeleteFeedback:
    """Tests for DELETE /feedback/{messageId} endpoint"""

    def test_delete_feedback_success(self, mock_event_delete, mock_dynamodb_table):
        """Should successfully delete feedback"""
        mock_dynamodb_table.get_item.return_value = {
            'Item': {
                'userId': 'user-123',
                'messageId': 'msg-123'
            }
        }

        response = lambda_handler(mock_event_delete, None)

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'deleted successfully' in body['message']
        assert body['messageId'] == 'msg-123'

        # Verify delete_item was called
        mock_dynamodb_table.delete_item.assert_called_once_with(
            Key={'userId': 'user-123', 'messageId': 'msg-123'}
        )

    def test_delete_feedback_not_found(self, mock_event_delete, mock_dynamodb_table):
        """Should return 404 when feedback doesn't exist"""
        mock_dynamodb_table.get_item.return_value = {}

        response = lambda_handler(mock_event_delete, None)

        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert 'not found' in body['error']

    def test_delete_feedback_missing_message_id(self, mock_dynamodb_table):
        """Should return 400 when messageId is missing"""
        event = {
            'httpMethod': 'DELETE',
            'pathParameters': {},
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'messageId' in body['error']


class TestErrorHandling:
    """Tests for error handling"""

    def test_missing_authorization(self, mock_dynamodb_table):
        """Should return 401 when authorization is missing"""
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({'messageId': 'msg-123', 'feedbackType': 'positive'}),
            'requestContext': {}
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 401

    def test_dynamodb_error(self, mock_event_post, mock_dynamodb_table):
        """Should return 500 when DynamoDB operation fails"""
        mock_dynamodb_table.get_item.side_effect = Exception('DynamoDB error')

        response = lambda_handler(mock_event_post, None)

        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert 'Failed to submit feedback' in body['error']

    def test_unsupported_http_method(self, mock_dynamodb_table):
        """Should return 405 for unsupported HTTP methods"""
        event = {
            'httpMethod': 'PATCH',
            'requestContext': {
                'authorizer': {
                    'claims': {'sub': 'user-123'}
                }
            }
        }

        response = lambda_handler(event, None)

        assert response['statusCode'] == 405
        body = json.loads(response['body'])
        assert 'not allowed' in body['error']


class TestCORSHeaders:
    """Tests for CORS headers"""

    def test_response_has_cors_headers(self, mock_event_get, mock_dynamodb_table):
        """Should include CORS headers in response"""
        mock_dynamodb_table.get_item.return_value = {}

        response = lambda_handler(mock_event_get, None)

        assert 'headers' in response
        assert 'Content-Type' in response['headers']
        assert response['headers']['Content-Type'] == 'application/json'
