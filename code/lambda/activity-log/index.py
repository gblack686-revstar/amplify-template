"""
Activity Log Lambda
Allows frontend to log user activities to the logging table
"""
import json
import os
import boto3
import uuid
import time
from datetime import datetime
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

LOGGING_TABLE_NAME = os.environ.get('LOGGING_TABLE_NAME')

logging_table = dynamodb.Table(LOGGING_TABLE_NAME)

# CORS headers for all responses
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}


def get_user_id_from_event(event: Dict[str, Any]) -> str:
    """Extract userId from Cognito authorizer context"""
    try:
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims.get('sub') or claims.get('cognito:username')
        if not user_id:
            raise ValueError("Could not extract userId from token")
        return user_id
    except (KeyError, TypeError) as e:
        logger.error(f"Error extracting userId from event: {str(e)}")
        raise ValueError("User authentication required")


def lambda_handler(event, context):
    """
    Log user activity to the logging table
    POST /activity-log

    Body:
    {
        "activityType": "goal_completed|goal_added|mfa_enabled|mfa_disabled",
        "metadata": {
            // Activity-specific metadata
        }
    }
    """
    logger.info(f"Received event: {json.dumps(event)}")

    # Handle OPTIONS request for CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': ''
        }

    try:
        # Get user ID from Cognito authorizer
        user_id = get_user_id_from_event(event)

        # Parse request body
        body = json.loads(event.get('body', '{}'))
        activity_type = body.get('activityType', '')
        metadata = body.get('metadata', {})

        if not activity_type:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'activityType is required'})
            }

        # Validate activity type
        valid_activity_types = [
            'goal_completed',
            'goal_added',
            'goal_removed',
            'mfa_enabled',
            'mfa_disabled'
        ]

        if activity_type not in valid_activity_types:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': f'Invalid activityType. Must be one of: {", ".join(valid_activity_types)}'
                })
            }

        # Create activity log entry
        activity_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()

        log_item = {
            'id': activity_id,
            'timestamp': timestamp,
            'requestType': activity_type,
            'userId': user_id,
            'metadata': metadata,
            'ttl': int(time.time()) + 30 * 24 * 60 * 60  # 30 days TTL
        }

        # Write to DynamoDB
        logging_table.put_item(Item=log_item)

        logger.info(f"Logged {activity_type} activity for user {user_id}")

        return {
            'statusCode': 201,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'activityId': activity_id,
                'timestamp': timestamp,
                'message': 'Activity logged successfully'
            })
        }

    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    except Exception as e:
        logger.error(f"Error logging activity: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Failed to log activity'})
        }
