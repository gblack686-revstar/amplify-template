"""
Profile Management Lambda
Handles CRUD operations for user family profiles
Requires: Pydantic >= 2.0.0
"""
import json
import os
import boto3
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any
import logging
from profile_schema import FamilyProfile
from pydantic import ValidationError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('USER_PROFILES_TABLE_NAME')
logging_table_name = os.environ.get('LOGGING_TABLE_NAME')
table = dynamodb.Table(table_name)
logging_table = dynamodb.Table(logging_table_name) if logging_table_name else None

# CORS headers for all responses
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
}


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal types to JSON"""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def log_activity(user_id: str, request_type: str, metadata: Dict[str, Any] = None):
    """Log activity to logging table for admin dashboard"""
    if not logging_table:
        logger.warning("Logging table not configured, skipping activity log")
        return

    try:
        activity_id = str(uuid.uuid4())
        timestamp_iso = datetime.now(timezone.utc).isoformat()

        item = {
            'id': activity_id,  # Partition key
            'timestamp': timestamp_iso,  # Sort key (ISO format string)
            'userId': user_id,
            'requestId': activity_id,
            'requestType': request_type,
            'timestampISO': timestamp_iso
        }

        if metadata:
            item['metadata'] = metadata

        logging_table.put_item(Item=item)
        logger.info(f"Logged activity {request_type} for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to log activity: {str(e)}", exc_info=True)


def get_user_id_from_event(event: Dict[str, Any]) -> str:
    """Extract userId from Cognito authorizer context"""
    try:
        # Validate event structure
        if not event:
            raise ValueError("Event is empty")

        if 'requestContext' not in event:
            logger.error("Missing requestContext in event")
            raise ValueError("Invalid request: missing authentication context")

        # Extract from Cognito authorizer claims
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        claims = authorizer.get('claims', {})

        if not claims:
            logger.error("No claims found in authorizer context")
            raise ValueError("Invalid authorization: no user claims found")

        user_id = claims.get('sub') or claims.get('cognito:username')

        if not user_id:
            logger.error("userId not found in claims")
            raise ValueError("Could not extract userId from authentication token")

        logger.info(f"Extracted userId from token: {user_id[:8]}...")  # Log partial ID for debugging
        return user_id

    except (KeyError, TypeError) as e:
        logger.error(f"Error extracting userId from event: {str(e)}", exc_info=True)
        raise ValueError("Invalid authorization context")


def create_or_update_profile(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create or update a user profile
    POST/PUT /profile
    """
    try:
        user_id = get_user_id_from_event(event)

        # Parse request body
        if not event.get('body'):
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Request body is required'})
            }

        body = json.loads(event['body'])

        # Validate using Pydantic schema
        try:
            profile = FamilyProfile(**body)
        except ValidationError as e:
            logger.warning(f"Profile validation failed: {str(e)}")
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': 'Profile validation failed',
                    'details': e.errors()
                })
            }

        # Convert to DynamoDB format
        profile_dict = json.loads(profile.json())

        # Add metadata
        now = datetime.utcnow().isoformat()

        # Check if profile exists
        is_update = False
        try:
            response = table.get_item(Key={'userId': user_id})
            if 'Item' in response:
                is_update = True
        except Exception as e:
            logger.error(f"Error checking existing profile: {str(e)}")

        item = {
            'userId': user_id,
            'profile': profile_dict,
            'updatedAt': now,
            'version': '1.0'
        }

        if not is_update:
            item['createdAt'] = now

        # Save to DynamoDB
        table.put_item(Item=item)

        # Audit logging for profile changes
        action = 'profile_updated' if is_update else 'profile_created'
        logger.info(f"AUDIT: {action} for user {user_id} at {now}")

        # Log onboarding completion activity if onboarding_completed is true
        if profile_dict.get('onboarding_completed'):
            log_activity(
                user_id=user_id,
                request_type='onboarding_complete',
                metadata={
                    'marital_status': profile_dict.get('marital_status'),
                    'number_of_children': profile_dict.get('number_of_children'),
                    'location': profile_dict.get('location')
                }
            )

        return {
            'statusCode': 200 if is_update else 201,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'message': f"Profile {'updated' if is_update else 'created'} successfully",
                'userId': user_id,
                'profile': profile_dict
            }, cls=DecimalEncoder)
        }

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return {
            'statusCode': 401,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
    except Exception as e:
        logger.error(f"Error creating/updating profile: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Internal server error'})
        }


def get_profile(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get user profile
    GET /profile
    """
    try:
        user_id = get_user_id_from_event(event)

        # Retrieve from DynamoDB
        response = table.get_item(Key={'userId': user_id})

        if 'Item' not in response:
            logger.info(f"Profile not found for user {user_id}")
            return {
                'statusCode': 404,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': 'Profile not found',
                    'message': 'No profile exists for this user. Please complete onboarding.'
                })
            }

        item = response['Item']

        logger.info(f"Retrieved profile for user {user_id}")

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'userId': user_id,
                'profile': item['profile'],
                'createdAt': item.get('createdAt'),
                'updatedAt': item.get('updatedAt'),
                'version': item.get('version', '1.0')
            }, cls=DecimalEncoder)
        }

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return {
            'statusCode': 401,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
    except Exception as e:
        logger.error(f"Error retrieving profile: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Internal server error'})
        }


def lambda_handler(event, context):
    """
    Main Lambda handler for profile management
    Routes requests based on HTTP method
    """
    try:
        # Log incoming request (without sensitive data)
        http_method = event.get('httpMethod', 'UNKNOWN')
        path = event.get('path', 'UNKNOWN')
        logger.info(f"Profile management request: method={http_method}, path={path}")

        # Validate environment variables
        if not table_name:
            logger.error("USER_PROFILES_TABLE_NAME environment variable not configured")
            return {
                'statusCode': 500,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Server configuration error'})
            }

        # Route based on HTTP method
        if http_method == 'POST' or http_method == 'PUT':
            return create_or_update_profile(event)
        elif http_method == 'GET':
            return get_profile(event)
        else:
            logger.warning(f"Unsupported HTTP method: {http_method}")
            return {
                'statusCode': 405,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': 'Method not allowed',
                    'allowed_methods': ['GET', 'POST', 'PUT']
                })
            }

    except Exception as e:
        logger.error(f"Unexpected error in lambda_handler: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'An unexpected error occurred. Please try again later.'})
        }
