"""
Feedback Lambda
Handles user feedback (thumbs up/down) for AI responses
"""
import json
import os
import boto3
from datetime import datetime, timedelta, timezone
import logging
from typing import Dict, Any
import uuid

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

FEEDBACK_TABLE = os.environ.get('FEEDBACK_TABLE_NAME')
LOGGING_TABLE = os.environ.get('LOGGING_TABLE_NAME')

feedback_table = dynamodb.Table(FEEDBACK_TABLE)
logging_table = dynamodb.Table(LOGGING_TABLE)


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


def make_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create standardized API response"""
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body)
    }


def log_feedback_activity(user_id: str, activity_type: str, metadata: Dict[str, Any]) -> None:
    """Log feedback activity to logging table"""
    try:
        activity_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        ttl = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())

        logging_table.put_item(Item={
            'id': activity_id,
            'timestamp': timestamp,
            'requestType': activity_type,
            'userId': user_id,
            'metadata': metadata,
            'ttl': ttl
        })
        logger.info(f"Logged activity: {activity_type} for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to log activity: {str(e)}")
        # Don't fail the request if logging fails


def handle_post_feedback(user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle POST - Submit new feedback"""
    message_id = body.get('messageId')
    session_id = body.get('sessionId')
    feedback_type = body.get('feedbackType')
    comment = body.get('comment', '')
    object_type = body.get('objectType', 'chat_message')

    if not message_id or not feedback_type:
        return make_response(400, {'error': 'messageId and feedbackType are required'})

    if feedback_type not in ['positive', 'negative']:
        return make_response(400, {'error': 'feedbackType must be "positive" or "negative"'})

    # Check if feedback already exists
    try:
        existing_response = feedback_table.get_item(
            Key={'userId': user_id, 'messageId': message_id}
        )
        if 'Item' in existing_response:
            return make_response(409, {'error': 'Feedback already exists for this message. Use PUT to update.'})
    except Exception as e:
        logger.error(f"Error checking existing feedback: {str(e)}")
        return make_response(500, {'error': 'Failed to submit feedback'})

    feedback_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    # Store feedback in DynamoDB
    feedback_item = {
        'userId': user_id,
        'messageId': message_id,
        'feedbackId': feedback_id,
        'sessionId': session_id or 'unknown',
        'feedbackType': feedback_type,
        'objectType': object_type,
        'comment': comment,
        'createdAt': timestamp,
        'updatedAt': timestamp
    }

    feedback_table.put_item(Item=feedback_item)

    # Log activity for admin dashboard
    activity_type = f'feedback_{feedback_type}'
    log_feedback_activity(user_id, activity_type, {
        'messageId': message_id,
        'sessionId': session_id,
        'feedbackId': feedback_id,
        'objectType': object_type,
        'comment': comment
    })

    return make_response(201, {
        'feedbackId': feedback_id,
        'messageId': message_id,
        'feedbackType': feedback_type,
        'timestamp': timestamp,
        'message': 'Feedback submitted successfully'
    })


def handle_get_feedback(user_id: str, message_id: str) -> Dict[str, Any]:
    """Handle GET - Get feedback for a message"""
    if not message_id:
        return make_response(400, {'error': 'messageId is required'})

    try:
        response = feedback_table.get_item(
            Key={'userId': user_id, 'messageId': message_id}
        )

        if 'Item' not in response:
            return make_response(404, {'error': 'Feedback not found'})

        item = response['Item']
        return make_response(200, {
            'feedbackId': item['feedbackId'],
            'messageId': item['messageId'],
            'feedbackType': item['feedbackType'],
            'comment': item.get('comment', ''),
            'timestamp': item['createdAt']
        })

    except Exception as e:
        logger.error(f"Error getting feedback: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to retrieve feedback'})


def handle_put_feedback(user_id: str, message_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle PUT - Update existing feedback"""
    if not message_id:
        return make_response(400, {'error': 'messageId is required'})

    feedback_type = body.get('feedbackType')
    comment = body.get('comment')

    if not feedback_type:
        return make_response(400, {'error': 'feedbackType is required'})

    if feedback_type not in ['positive', 'negative']:
        return make_response(400, {'error': 'feedbackType must be "positive" or "negative"'})

    # Check if feedback exists
    existing_response = feedback_table.get_item(
        Key={'userId': user_id, 'messageId': message_id}
    )

    if 'Item' not in existing_response:
        return make_response(404, {'error': 'Feedback not found'})

    timestamp = datetime.now(timezone.utc).isoformat()

    # Update feedback
    update_expression = 'SET feedbackType = :type, updatedAt = :updated'
    expression_values = {
        ':type': feedback_type,
        ':updated': timestamp
    }

    if comment is not None:
        update_expression += ', #cmt = :comment'
        expression_values[':comment'] = comment

    feedback_table.update_item(
        Key={'userId': user_id, 'messageId': message_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames={'#cmt': 'comment'} if comment is not None else None
    )

    # Log activity for admin dashboard
    activity_type = f'feedback_{feedback_type}_updated'
    log_feedback_activity(user_id, activity_type, {
        'messageId': message_id,
        'feedbackId': existing_response['Item'].get('feedbackId', ''),
        'comment': comment
    })

    return make_response(200, {
        'messageId': message_id,
        'feedbackType': feedback_type,
        'timestamp': timestamp,
        'message': 'Feedback updated successfully'
    })


def handle_delete_feedback(user_id: str, message_id: str) -> Dict[str, Any]:
    """Handle DELETE - Delete feedback"""
    if not message_id:
        return make_response(400, {'error': 'messageId is required'})

    try:
        # Check if feedback exists
        response = feedback_table.get_item(
            Key={'userId': user_id, 'messageId': message_id}
        )

        if 'Item' not in response:
            return make_response(404, {'error': 'Feedback not found'})

        # Store feedback details before deletion for logging
        deleted_feedback = response['Item']

        # Delete feedback
        feedback_table.delete_item(
            Key={'userId': user_id, 'messageId': message_id}
        )

        # Log activity for admin dashboard
        log_feedback_activity(user_id, 'feedback_deleted', {
            'messageId': message_id,
            'feedbackId': deleted_feedback.get('feedbackId', ''),
            'feedbackType': deleted_feedback.get('feedbackType', '')
        })

        return make_response(200, {
            'message': 'Feedback deleted successfully',
            'messageId': message_id
        })

    except Exception as e:
        logger.error(f"Error deleting feedback: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to delete feedback'})


def lambda_handler(event, context):
    """
    Handle feedback operations

    POST /feedback - Submit new feedback
    GET /feedback/{messageId} - Get feedback for a message
    PUT /feedback/{messageId} - Update existing feedback
    DELETE /feedback/{messageId} - Delete feedback

    Request body for POST/PUT:
    {
        "messageId": "string",
        "sessionId": "string",
        "feedbackType": "positive" | "negative",
        "comment": "string" (optional),
        "objectType": "chat_message" | "recommendation" | "roadmap_item" (optional, defaults to "chat_message")
    }
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        user_id = get_user_id_from_event(event)
        http_method = event.get('httpMethod', 'GET')
        path_parameters = event.get('pathParameters') or {}
        message_id = path_parameters.get('messageId')

        # Route to specific handler based on HTTP method
        if http_method == 'POST':
            try:
                body = json.loads(event.get('body', '{}'))
                return handle_post_feedback(user_id, body)
            except json.JSONDecodeError:
                return make_response(400, {'error': 'Invalid JSON in request body'})
            except Exception as e:
                logger.error(f"Error submitting feedback: {str(e)}", exc_info=True)
                return make_response(500, {'error': 'Failed to submit feedback'})

        elif http_method == 'GET':
            return handle_get_feedback(user_id, message_id)

        elif http_method == 'PUT':
            try:
                body = json.loads(event.get('body', '{}'))
                return handle_put_feedback(user_id, message_id, body)
            except json.JSONDecodeError:
                return make_response(400, {'error': 'Invalid JSON in request body'})
            except Exception as e:
                logger.error(f"Error updating feedback: {str(e)}", exc_info=True)
                return make_response(500, {'error': 'Failed to update feedback'})

        elif http_method == 'DELETE':
            return handle_delete_feedback(user_id, message_id)

        else:
            return make_response(405, {'error': 'Method not allowed'})

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return make_response(401, {'error': str(e)})
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Internal server error'})
