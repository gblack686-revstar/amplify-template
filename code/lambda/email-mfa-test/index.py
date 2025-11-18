"""
Lambda function for testing Email MFA functionality in Cognito User Pool.

This function provides helper operations for:
- Creating test users
- Setting passwords
- Initiating authentication
- Managing MFA settings
"""

import json
import os
import boto3
from typing import Dict, Any
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize Cognito client
cognito = boto3.client("cognito-idp")

# Environment variables
USER_POOL_ID = os.environ["USER_POOL_ID"]
CLIENT_ID = os.environ["CLIENT_ID"]
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for email MFA testing operations.

    Supported operations:
    - create_user: Create a new test user
    - delete_user: Delete a test user
    - set_password: Set a permanent password for a user
    - initiate_auth: Start authentication flow
    - list_users: List all users in the pool
    - get_user: Get details about a specific user
    """
    try:
        operation = event.get("operation")
        logger.info(f"Processing operation: {operation}")

        if operation == "create_user":
            return create_user(event)
        elif operation == "delete_user":
            return delete_user(event)
        elif operation == "set_password":
            return set_password(event)
        elif operation == "initiate_auth":
            return initiate_auth(event)
        elif operation == "list_users":
            return list_users(event)
        elif operation == "get_user":
            return get_user(event)
        else:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": f"Unknown operation: {operation}",
                    "supported_operations": [
                        "create_user",
                        "delete_user",
                        "set_password",
                        "initiate_auth",
                        "list_users",
                        "get_user",
                    ],
                }),
            }

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


def create_user(event: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new user in the User Pool."""
    username = event.get("username")
    email = event.get("email")
    temporary_password = event.get("temporary_password", "TempPass123!")

    if not username or not email:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "username and email are required"}),
        }

    try:
        response = cognito.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=username,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
            ],
            TemporaryPassword=temporary_password,
            MessageAction="SUPPRESS",  # Don't send welcome email
            DesiredDeliveryMediums=["EMAIL"],
        )

        logger.info(f"User created successfully: {username}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "User created successfully",
                "username": username,
                "email": email,
                "user_status": response["User"]["UserStatus"],
                "user_pool_id": USER_POOL_ID,
            }),
        }

    except cognito.exceptions.UsernameExistsException:
        return {
            "statusCode": 409,
            "body": json.dumps({"error": f"User {username} already exists"}),
        }
    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        raise


def delete_user(event: Dict[str, Any]) -> Dict[str, Any]:
    """Delete a user from the User Pool."""
    username = event.get("username")

    if not username:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "username is required"}),
        }

    try:
        cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=username)

        logger.info(f"User deleted successfully: {username}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "User deleted successfully",
                "username": username,
            }),
        }

    except cognito.exceptions.UserNotFoundException:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": f"User {username} not found"}),
        }
    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        raise


def set_password(event: Dict[str, Any]) -> Dict[str, Any]:
    """Set a permanent password for a user."""
    username = event.get("username")
    password = event.get("password")
    permanent = event.get("permanent", True)

    if not username or not password:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "username and password are required"}),
        }

    try:
        cognito.admin_set_user_password(
            UserPoolId=USER_POOL_ID,
            Username=username,
            Password=password,
            Permanent=permanent,
        )

        logger.info(f"Password set successfully for user: {username}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Password set successfully",
                "username": username,
                "permanent": permanent,
            }),
        }

    except cognito.exceptions.UserNotFoundException:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": f"User {username} not found"}),
        }
    except Exception as e:
        logger.error(f"Error setting password: {str(e)}")
        raise


def initiate_auth(event: Dict[str, Any]) -> Dict[str, Any]:
    """Initiate authentication flow for a user."""
    username = event.get("username")
    password = event.get("password")

    if not username or not password:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "username and password are required"}),
        }

    try:
        response = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=CLIENT_ID,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
            },
        )

        challenge_name = response.get("ChallengeName")
        session = response.get("Session")

        logger.info(f"Auth initiated for user: {username}, Challenge: {challenge_name}")

        result = {
            "message": "Authentication initiated",
            "username": username,
            "challenge_name": challenge_name,
        }

        if session:
            result["session"] = session

        if challenge_name:
            result["challenge_parameters"] = response.get("ChallengeParameters", {})

        if response.get("AuthenticationResult"):
            result["authentication_result"] = {
                "access_token": response["AuthenticationResult"].get("AccessToken", "")[:20] + "...",
                "id_token": response["AuthenticationResult"].get("IdToken", "")[:20] + "...",
                "token_type": response["AuthenticationResult"].get("TokenType"),
                "expires_in": response["AuthenticationResult"].get("ExpiresIn"),
            }

        return {
            "statusCode": 200,
            "body": json.dumps(result),
        }

    except cognito.exceptions.UserNotFoundException:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": f"User {username} not found"}),
        }
    except cognito.exceptions.NotAuthorizedException:
        return {
            "statusCode": 401,
            "body": json.dumps({"error": "Invalid username or password"}),
        }
    except Exception as e:
        logger.error(f"Error initiating auth: {str(e)}")
        raise


def list_users(event: Dict[str, Any]) -> Dict[str, Any]:
    """List all users in the User Pool."""
    limit = event.get("limit", 10)

    try:
        response = cognito.list_users(UserPoolId=USER_POOL_ID, Limit=limit)

        users = []
        for user in response.get("Users", []):
            user_data = {
                "username": user.get("Username"),
                "status": user.get("UserStatus"),
                "enabled": user.get("Enabled"),
                "created": user.get("UserCreateDate").isoformat() if user.get("UserCreateDate") else None,
                "modified": user.get("UserLastModifiedDate").isoformat() if user.get("UserLastModifiedDate") else None,
            }

            # Extract email from attributes
            for attr in user.get("Attributes", []):
                if attr["Name"] == "email":
                    user_data["email"] = attr["Value"]
                elif attr["Name"] == "email_verified":
                    user_data["email_verified"] = attr["Value"]

            users.append(user_data)

        logger.info(f"Listed {len(users)} users")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "users": users,
                "count": len(users),
                "user_pool_id": USER_POOL_ID,
            }),
        }

    except Exception as e:
        logger.error(f"Error listing users: {str(e)}")
        raise


def get_user(event: Dict[str, Any]) -> Dict[str, Any]:
    """Get details about a specific user."""
    username = event.get("username")

    if not username:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "username is required"}),
        }

    try:
        response = cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=username)

        user_data = {
            "username": response.get("Username"),
            "status": response.get("UserStatus"),
            "enabled": response.get("Enabled"),
            "created": response.get("UserCreateDate").isoformat() if response.get("UserCreateDate") else None,
            "modified": response.get("UserLastModifiedDate").isoformat() if response.get("UserLastModifiedDate") else None,
            "attributes": {},
        }

        # Parse user attributes
        for attr in response.get("UserAttributes", []):
            user_data["attributes"][attr["Name"]] = attr["Value"]

        # Parse MFA options
        if response.get("MFAOptions"):
            user_data["mfa_options"] = response["MFAOptions"]

        logger.info(f"Retrieved user details for: {username}")

        return {
            "statusCode": 200,
            "body": json.dumps({"user": user_data}),
        }

    except cognito.exceptions.UserNotFoundException:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": f"User {username} not found"}),
        }
    except Exception as e:
        logger.error(f"Error getting user: {str(e)}")
        raise
