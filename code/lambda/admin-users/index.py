"""
Admin Users Lambda
Returns list of all users from Cognito for admin dashboard filters
"""
import json
import os
import boto3
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')
USER_POOL_ID = os.environ.get('USER_POOL_ID')


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


def get_all_users() -> List[Dict[str, str]]:
    """
    Fetch all users from Cognito User Pool
    Returns list of {userId, email, name} objects
    """
    try:
        if not USER_POOL_ID:
            logger.error("USER_POOL_ID environment variable not set")
            return []

        users = []
        pagination_token = None

        # Paginate through all users
        while True:
            params = {
                'UserPoolId': USER_POOL_ID,
                'Limit': 60  # Max allowed by Cognito
            }

            if pagination_token:
                params['PaginationToken'] = pagination_token

            response = cognito_client.list_users(**params)

            # Extract user info
            for user in response.get('Users', []):
                user_id = None
                email = None
                name = None

                # Get userId from 'sub' attribute
                for attr in user.get('Attributes', []):
                    if attr['Name'] == 'sub':
                        user_id = attr['Value']
                    elif attr['Name'] == 'email':
                        email = attr['Value']
                    elif attr['Name'] == 'name':
                        name = attr['Value']

                if user_id and email:
                    users.append({
                        'userId': user_id,
                        'email': email,
                        'name': name if name else email.split('@')[0]  # Use email prefix as fallback
                    })

            # Check for more results
            pagination_token = response.get('PaginationToken')
            if not pagination_token:
                break

        logger.info(f"Retrieved {len(users)} users from Cognito")
        return users

    except Exception as e:
        logger.error(f"Error fetching users from Cognito: {str(e)}", exc_info=True)
        return []


def lambda_handler(event, context):
    """
    Handle admin users list requests

    GET /admin/users - Get all users from Cognito
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        # Check admin authorization
        if not check_admin_role(event):
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Forbidden: Admin access required'})
            }

        http_method = event.get('httpMethod', 'GET')

        if http_method != 'GET':
            return {
                'statusCode': 405,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }

        # Get all users
        users = get_all_users()

        logger.info(f"Returning {len(users)} users")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,GET'
            },
            'body': json.dumps(users)
        }

    except Exception as e:
        logger.error(f"Error processing users request: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
