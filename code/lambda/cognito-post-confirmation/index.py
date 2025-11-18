"""
Cognito Post-Confirmation Trigger Lambda
Automatically adds new users to the 'users' group after successful signup
"""
import json
import boto3
import logging
from typing import Dict, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Cognito Post-Confirmation Trigger Handler

    Triggered after user confirms signup (email verification)
    Automatically adds user to 'users' group for regular access

    Args:
        event: Cognito trigger event containing user pool and user info
        context: Lambda context object

    Returns:
        The event object (required by Cognito triggers)
    """
    try:
        logger.info(f"Post-confirmation trigger invoked for user: {event['userName']}")

        # Extract user pool and user information from event
        user_pool_id = event['userPoolId']
        username = event['userName']

        # Add user to 'users' group
        try:
            cognito_client.admin_add_user_to_group(
                UserPoolId=user_pool_id,
                Username=username,
                GroupName='users'
            )
            logger.info(f"Successfully added user {username} to 'users' group")
        except cognito_client.exceptions.ResourceNotFoundException:
            # If 'users' group doesn't exist, log error but don't fail
            logger.error(f"'users' group not found in user pool {user_pool_id}")
            logger.error("User will be created without group assignment")
        except Exception as group_error:
            logger.error(f"Error adding user to group: {str(group_error)}")
            # Don't fail the signup - user can be added to group later by admin

        # Log user attributes for audit trail
        user_attributes = event.get('request', {}).get('userAttributes', {})
        logger.info(f"New user created - Email: {user_attributes.get('email', 'N/A')}")

        # Return event (required for Cognito triggers)
        return event

    except Exception as e:
        logger.error(f"Unexpected error in post-confirmation trigger: {str(e)}")
        logger.error(f"Event: {json.dumps(event)}")
        # Return event anyway to not block user creation
        return event
