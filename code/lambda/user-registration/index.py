"""
User Registration Lambda
Handles user registration by creating users via AdminCreateUser
This triggers Cognito's invitation email with temporary password
"""

import json
import boto3
import os

cognito_client = boto3.client('cognito-idp')

USER_POOL_ID = os.environ['USER_POOL_ID']


def lambda_handler(event, context):
    """
    Handle user registration requests

    Expected body:
    {
        "email": "user@example.com"
    }
    """
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        email = body.get('email', '').strip().lower()

        if not email:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': 'Email is required'
                })
            }

        # Validate email format
        if '@' not in email or '.' not in email.split('@')[1]:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': 'Invalid email format'
                })
            }

        # Create user via AdminCreateUser
        # This will trigger Cognito to send invitation email with temp password
        try:
            cognito_client.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=email,
                UserAttributes=[
                    {
                        'Name': 'email',
                        'Value': email
                    },
                    {
                        'Name': 'email_verified',
                        'Value': 'true'
                    }
                ],
                DesiredDeliveryMediums=['EMAIL']
                # MessageAction omitted - default behavior sends invitation email for new users
            )

            return {
                'statusCode': 201,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'message': 'Registration successful. Check your email for login credentials.',
                    'email': email,
                    'username': email
                })
            }

        except cognito_client.exceptions.UsernameExistsException:
            return {
                'statusCode': 409,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': 'An account with this email already exists'
                })
            }

        except cognito_client.exceptions.InvalidPasswordException as e:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': f'Password does not meet requirements: {str(e)}'
                })
            }

    except Exception as e:
        print(f"Error during registration: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Internal server error during registration'
            })
        }
