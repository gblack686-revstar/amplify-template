"""
Admin Activity Log Lambda
Returns recent user activities from the logging table for admin dashboard
"""
import json
import os
import boto3
from datetime import datetime
import logging
from typing import Dict, Any
from decimal import Decimal
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
cognito_client = boto3.client('cognito-idp')

LOGGING_TABLE = os.environ.get('LOGGING_TABLE_NAME')
USER_PROFILES_TABLE = os.environ.get('USER_PROFILES_TABLE_NAME')
USER_POOL_ID = os.environ.get('USER_POOL_ID')

logging_table = dynamodb.Table(LOGGING_TABLE)
user_profiles_table = dynamodb.Table(USER_PROFILES_TABLE)


def decimal_default(obj):
    """JSON encoder for Decimal objects"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def check_admin_role(event: Dict[str, Any]) -> bool:
    """
    Check if the user has admin role from Cognito groups
    """
    try:
        claims = event['requestContext']['authorizer']['claims']
        cognito_groups = claims.get('cognito:groups', '')

        # cognito:groups is a comma-separated string
        if isinstance(cognito_groups, str):
            groups = [g.strip() for g in cognito_groups.split(',')]
        else:
            groups = cognito_groups if isinstance(cognito_groups, list) else []

        return 'admins' in groups
    except (KeyError, TypeError) as e:
        logger.error(f"Error checking admin role: {str(e)}")
        return False


def get_all_admin_user_ids() -> set:
    """
    Get set of all admin user IDs (sub attributes) from Cognito Admins group.
    This is called ONCE to build a cache, avoiding repeated Cognito calls.
    """
    admin_user_ids = set()

    try:
        if not USER_POOL_ID:
            logger.warning("Missing USER_POOL_ID for admin check")
            return admin_user_ids

        # List all users in the Admins group
        paginator = cognito_client.get_paginator('list_users_in_group')
        page_iterator = paginator.paginate(
            UserPoolId=USER_POOL_ID,
            GroupName='admins'
        )

        for page in page_iterator:
            for user in page.get('Users', []):
                # Get the sub attribute which is the userId
                for attr in user.get('Attributes', []):
                    if attr['Name'] == 'sub':
                        admin_user_ids.add(attr['Value'])
                        break

        logger.info(f"Found {len(admin_user_ids)} admin users in Cognito")
        return admin_user_ids

    except Exception as e:
        logger.error(f"Error getting admin user list: {str(e)}", exc_info=True)
        return admin_user_ids


def get_user_email(user_id: str) -> str:
    """Get user email from Cognito by searching for the sub attribute"""
    try:
        # First try to get from user profiles table
        response = user_profiles_table.get_item(Key={'userId': user_id})
        if 'Item' in response and 'email' in response['Item']:
            return response['Item']['email']

        # If not in profiles, search Cognito by sub attribute
        if USER_POOL_ID:
            # Query Cognito using the sub attribute filter
            cognito_response = cognito_client.list_users(
                UserPoolId=USER_POOL_ID,
                Filter=f'sub = "{user_id}"',
                Limit=1
            )

            if cognito_response.get('Users'):
                user = cognito_response['Users'][0]
                # First check if there's an email attribute
                for attr in user.get('Attributes', []):
                    if attr['Name'] == 'email':
                        return attr['Value']
                # If no email attribute, use the Username (which is often the email)
                return user.get('Username', user_id)

        return user_id
    except Exception as e:
        logger.error(f"Error getting user email for {user_id}: {str(e)}")
        return user_id


def get_user_name(user_id: str) -> str:
    """Get user name from user profiles table"""
    try:
        response = user_profiles_table.get_item(Key={'userId': user_id})
        if 'Item' in response:
            profile = response['Item'].get('profile', {})
            # Try to construct name from profile data
            first_name = profile.get('firstName', '')
            last_name = profile.get('lastName', '')
            if first_name or last_name:
                return f"{first_name} {last_name}".strip()
        return None
    except Exception as e:
        logger.error(f"Error getting user name: {str(e)}")
        return None


def truncate_title(title: str, max_length: int = 50) -> str:
    """Truncate title if it exceeds max length"""
    if len(title) > max_length:
        return title[:max_length] + '...'
    return title


def get_feedback_description(metadata: Dict[str, Any], is_positive: bool) -> str:
    """Generate description for feedback activities"""
    object_type = metadata.get('objectType', 'chat_message')
    feedback_action = 'positive' if is_positive else 'negative'

    if object_type == 'recommendation':
        return f'Gave {feedback_action} feedback on recommendation'
    elif object_type == 'roadmap_item':
        return f'Gave {feedback_action} feedback on roadmap item'
    else:
        return f'Gave {feedback_action} feedback on chat response'


def get_goal_description(request_type: str, metadata: Dict[str, Any]) -> str:
    """Generate description for goal-related activities"""
    goal_title = metadata.get('goalTitle', 'Unknown goal')

    if request_type == 'goal_generated':
        return f'Generated new goal: "{goal_title}"'
    elif request_type == 'goal_completed':
        return f'Completed goal: "{goal_title}"'
    elif request_type == 'goal_added':
        return f'Added goal to roadmap: "{goal_title}"'
    elif request_type == 'goal_removed':
        return f'Removed goal from roadmap: "{goal_title}"'
    return 'Unknown goal activity'


def get_recommendation_description(metadata: Dict[str, Any], from_chat: bool = False) -> str:
    """Generate description for recommendation activities"""
    rec_title = truncate_title(metadata.get('title', 'Unknown recommendation'))
    rec_category = metadata.get('category', 'unknown')

    if from_chat:
        return f'Added to roadmap from chat: "{rec_title}" ({rec_category})'
    else:
        return f'AI generated recommendation: "{rec_title}" ({rec_category})'


def get_roadmap_item_description(request_type: str, log_item: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    """Generate description for roadmap item activities"""
    default_descriptions = {
        'roadmap_item_added': 'Added roadmap item',
        'roadmap_item_removed': 'Removed roadmap item',
        'roadmap_item_completed': 'Completed roadmap item'
    }

    description = log_item.get('description', default_descriptions.get(request_type, 'Unknown roadmap activity'))
    item_category = metadata.get('category', '')

    if item_category and request_type in ['roadmap_item_added', 'roadmap_item_completed']:
        description += f' ({item_category})'

    return description


def map_request_type_to_activity(request_type: str, log_item: Dict[str, Any]) -> tuple:
    """
    Map requestType to activityType and description
    Returns: (activity_type, description, metadata)
    """
    metadata = log_item.get('metadata', {})

    # Simple mappings (no additional logic needed)
    simple_mappings = {
        'query': ('chat_session_start', 'Started chat session'),
        'user_signup': ('user_signup', 'New user signup'),
        'onboarding_complete': ('onboarding_complete', 'Completed onboarding flow'),
        'mfa_enabled': ('mfa_enabled', 'Enabled two-factor authentication (MFA)'),
        'mfa_disabled': ('mfa_disabled', 'Disabled two-factor authentication (MFA)')
    }

    if request_type in simple_mappings:
        activity_type, description = simple_mappings[request_type]
        # Special handling for query metadata
        if request_type == 'query':
            metadata = {
                'requestType': request_type,
                'processingTimeMs': log_item.get('processing_time_ms')
            }
        return activity_type, description, metadata

    # Complex mappings requiring additional logic
    if request_type == 'document_upload':
        file_name = metadata.get('filename', metadata.get('fileName', 'unknown file'))
        return 'document_upload', f'Uploaded document: {file_name}', metadata

    elif request_type == 'feedback_positive':
        return 'feedback_positive', get_feedback_description(metadata, True), metadata

    elif request_type == 'feedback_negative':
        return 'feedback_negative', get_feedback_description(metadata, False), metadata

    elif request_type in ['goal_generated', 'goal_completed', 'goal_added', 'goal_removed']:
        return request_type, get_goal_description(request_type, metadata), metadata

    elif request_type == 'recommendation_generated':
        return 'recommendation_generated', get_recommendation_description(metadata, False), metadata

    elif request_type == 'roadmap_item_added_from_chat':
        return 'roadmap_item_added_from_chat', get_recommendation_description(metadata, True), metadata

    elif request_type in ['roadmap_item_added', 'roadmap_item_removed', 'roadmap_item_completed']:
        return request_type, get_roadmap_item_description(request_type, log_item, metadata), metadata

    # Default for unknown types
    return 'unknown', 'Unknown activity', metadata


def format_activity_entry(log_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a logging table item to an activity log entry
    """
    user_id = log_item.get('userId', 'unknown')
    timestamp = log_item.get('timestamp', datetime.now().isoformat())
    request_type = log_item.get('requestType', 'unknown')

    # Get user details
    user_email = get_user_email(user_id)
    user_name = get_user_name(user_id)

    # Map requestType to activityType and description
    activity_type, description, metadata = map_request_type_to_activity(request_type, log_item)

    return {
        'id': log_item.get('id', str(hash(timestamp + user_id))),
        'timestamp': timestamp,
        'userId': user_email,  # Use email instead of UUID for better UX
        'userEmail': user_email,
        'userName': user_name,
        'activityType': activity_type,
        'description': description,
        'metadata': metadata
    }


def lambda_handler(event, context):
    """
    Get activity log for admin dashboard
    GET /admin/activity-log?limit=50&userId=xxx

    Query parameters:
    - limit: Maximum number of entries to return (default 50)
    - userId: Optional filter by specific user

    Response:
    [
        {
            "id": "string",
            "timestamp": "ISO-8601",
            "userId": "string",
            "userEmail": "string",
            "userName": "string",
            "activityType": "chat_session_start|...",
            "description": "string",
            "metadata": {}
        }
    ]
    """
    logger.info(f"Received event: {json.dumps(event)}")

    # Check admin authorization
    if not check_admin_role(event):
        return {
            'statusCode': 403,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,GET'
            },
            'body': json.dumps({'error': 'Unauthorized: Admin access required'})
        }

    try:
        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        limit = int(query_params.get('limit', 50))
        filter_user_id = query_params.get('userId')

        # Scan the logging table with pagination to get ALL items
        # Note: For production, should use GSI on timestamp for efficient queries
        all_items = []
        scan_kwargs = {}

        if filter_user_id:
            scan_kwargs['FilterExpression'] = Attr('userId').eq(filter_user_id)

        # Paginate through all items
        while True:
            response = logging_table.scan(**scan_kwargs)
            all_items.extend(response.get('Items', []))

            # Check if there are more items to scan
            if 'LastEvaluatedKey' not in response:
                break

            scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']

        # Sort by timestamp descending (most recent first)
        all_items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

        # Get all admin user IDs ONCE to avoid repeated Cognito calls
        admin_user_ids = get_all_admin_user_ids()
        logger.info(f"Filtering out {len(admin_user_ids)} admin users from activity log")

        # Filter out admin users and format as activity log entries
        activity_log = []
        for item in all_items:
            user_id = item.get('userId')
            if user_id and user_id not in admin_user_ids:
                activity_log.append(format_activity_entry(item))
                if len(activity_log) >= limit:
                    break

        logger.info(f"Returning {len(activity_log)} activity log entries (admin accounts filtered out)")

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,GET',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(activity_log, default=decimal_default)
        }

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,GET'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }
