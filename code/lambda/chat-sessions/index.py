"""
Chat Sessions Lambda
Handles CRUD operations for chat sessions and messages
"""
import json
import os
import boto3
from datetime import datetime
import logging
from typing import Dict, Any
import uuid
from decimal import Decimal

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

CHAT_SESSIONS_TABLE = os.environ.get('CHAT_SESSIONS_TABLE_NAME')

chat_sessions_table = dynamodb.Table(CHAT_SESSIONS_TABLE)


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal types to JSON"""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def get_user_id_from_event(event: Dict[str, Any]) -> str:
    """Extract userId from Cognito authorizer context"""
    try:
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims.get('sub') or claims.get('cognito:username')
        if not user_id:
            raise ValueError("Could not extract userId from token")
        return user_id
    except (KeyError, TypeError) as e:
        logger.error(f"Error extracting userId: {str(e)}")
        raise ValueError("Invalid authorization context")


def make_response(status_code: int, body: Any) -> Dict[str, Any]:
    """Create standardized API response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }


def handle_list_sessions(user_id: str) -> Dict[str, Any]:
    """Handle GET /chat/sessions - List all sessions for user"""
    try:
        # Query using timestamp-index to get sessions sorted by updatedAt DESC
        response = chat_sessions_table.query(
            IndexName='timestamp-index',
            KeyConditionExpression='userId = :userId',
            ExpressionAttributeValues={':userId': user_id},
            ScanIndexForward=False  # Sort DESC by updatedAt
        )

        sessions = response.get('Items', [])
        return make_response(200, sessions)

    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to list sessions'})


def handle_get_session(user_id: str, session_id: str) -> Dict[str, Any]:
    """Handle GET /chat/sessions/{sessionId} - Get specific session"""
    try:
        response = chat_sessions_table.get_item(
            Key={'userId': user_id, 'sessionId': session_id}
        )

        if 'Item' not in response:
            return make_response(404, {'error': 'Session not found'})

        return make_response(200, response['Item'])

    except Exception as e:
        logger.error(f"Error getting session: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to get session'})


def handle_create_session(user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle POST /chat/sessions - Create new session"""
    title = body.get('title', 'New Conversation')

    session_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()

    session_item = {
        'userId': user_id,
        'sessionId': session_id,
        'title': title,
        'messages': [],
        'createdAt': timestamp,
        'updatedAt': timestamp
    }

    chat_sessions_table.put_item(Item=session_item)
    return make_response(201, session_item)


def handle_update_session(user_id: str, session_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle PUT /chat/sessions/{sessionId} - Update session"""
    if not session_id:
        return make_response(400, {'error': 'sessionId is required'})

    # Check if session exists
    existing_response = chat_sessions_table.get_item(
        Key={'userId': user_id, 'sessionId': session_id}
    )

    if 'Item' not in existing_response:
        return make_response(404, {'error': 'Session not found'})

    timestamp = datetime.utcnow().isoformat()
    session = existing_response['Item']

    # Update title if provided
    if 'title' in body:
        session['title'] = body['title']

    # Add single message if provided (for incremental updates)
    if 'message' in body:
        message = body['message']
        if 'messages' not in session:
            session['messages'] = []
        session['messages'].append(message)

    # Replace entire messages array if provided (for bulk updates)
    if 'messages' in body:
        session['messages'] = body['messages']

    # Update timestamp
    session['updatedAt'] = timestamp

    # Save updated session
    chat_sessions_table.put_item(Item=session)
    return make_response(200, session)


def handle_delete_session(user_id: str, session_id: str) -> Dict[str, Any]:
    """Handle DELETE /chat/sessions/{sessionId} - Delete session"""
    if not session_id:
        return make_response(400, {'error': 'sessionId is required'})

    try:
        # Check if session exists
        response = chat_sessions_table.get_item(
            Key={'userId': user_id, 'sessionId': session_id}
        )

        if 'Item' not in response:
            return make_response(404, {'error': 'Session not found'})

        # Delete session
        chat_sessions_table.delete_item(
            Key={'userId': user_id, 'sessionId': session_id}
        )

        return make_response(200, {
            'message': 'Session deleted successfully',
            'sessionId': session_id
        })

    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to delete session'})


def lambda_handler(event, context):
    """
    Handle chat session operations

    GET /chat/sessions - List all sessions for user (sorted by updatedAt DESC)
    POST /chat/sessions - Create new session
    GET /chat/sessions/{sessionId} - Get specific session with messages
    PUT /chat/sessions/{sessionId} - Update session (add message or update metadata)
    DELETE /chat/sessions/{sessionId} - Delete session

    Request body for POST:
    {
        "title": "string" (optional, defaults to "New Conversation")
    }

    Request body for PUT:
    {
        "title": "string" (optional, to rename session),
        "message": {
            "id": "string",
            "role": "user" | "assistant",
            "content": "string",
            "timestamp": "string"
        } (optional, to add message)
    }
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        user_id = get_user_id_from_event(event)
        http_method = event.get('httpMethod', 'GET')
        path_parameters = event.get('pathParameters') or {}
        session_id = path_parameters.get('sessionId')

        # Route to specific handler based on HTTP method
        if http_method == 'GET':
            if not session_id:
                return handle_list_sessions(user_id)
            else:
                return handle_get_session(user_id, session_id)

        elif http_method == 'POST':
            try:
                body = json.loads(event.get('body', '{}'))
                return handle_create_session(user_id, body)
            except json.JSONDecodeError:
                return make_response(400, {'error': 'Invalid JSON in request body'})
            except Exception as e:
                logger.error(f"Error creating session: {str(e)}", exc_info=True)
                return make_response(500, {'error': 'Failed to create session'})

        elif http_method == 'PUT':
            try:
                body = json.loads(event.get('body', '{}'))
                return handle_update_session(user_id, session_id, body)
            except json.JSONDecodeError:
                return make_response(400, {'error': 'Invalid JSON in request body'})
            except Exception as e:
                logger.error(f"Error updating session: {str(e)}", exc_info=True)
                return make_response(500, {'error': 'Failed to update session'})

        elif http_method == 'DELETE':
            return handle_delete_session(user_id, session_id)

        else:
            return make_response(405, {'error': 'Method not allowed'})

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return make_response(401, {'error': str(e)})
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Internal server error'})
