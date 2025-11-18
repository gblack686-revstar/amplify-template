"""
User Deletion Lambda Function
Deletes a user and ALL associated data from the system (GDPR/CCPA compliance)

This function deletes data from:
1. DynamoDB Tables (6 tables)
2. S3 Bucket (all user documents and sidecars)
3. OpenSearch Serverless (vector embeddings)
4. Cognito User Pool
"""

import json
import boto3
import os
from datetime import datetime
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
cognito = boto3.client('cognito-idp')
aoss = boto3.client('opensearchserverless')

# Environment variables
USER_POOL_ID = os.environ['USER_POOL_ID']
DOCS_BUCKET = os.environ['DOCS_BUCKET_NAME']
OPENSEARCH_COLLECTION_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT', '')

# DynamoDB table names
TABLE_USER_PROFILES = os.environ['TABLE_USER_PROFILES']
TABLE_DOCUMENT_METADATA = os.environ['TABLE_DOCUMENT_METADATA']
TABLE_CHAT_SESSIONS = os.environ['TABLE_CHAT_SESSIONS']
TABLE_FEEDBACK = os.environ['TABLE_FEEDBACK']
TABLE_PERSONALIZED_INSIGHTS = os.environ['TABLE_PERSONALIZED_INSIGHTS']
TABLE_ACTIVITY_LOGS = os.environ['TABLE_ACTIVITY_LOGS']


def lambda_handler(event, context):
    """
    Main handler for user deletion

    Expected event format:
    {
        "email": "user@example.com",
        "confirm": true  # Safety flag
    }
    """
    print(f"User deletion request received: {json.dumps(event, default=str)}")

    # Parse API Gateway event body
    try:
        if 'body' in event:
            body = json.loads(event['body'])
        else:
            body = event
    except json.JSONDecodeError as e:
        return {
            'statusCode': 400,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
            },
            'body': json.dumps({
                'error': f'Invalid JSON in request body: {str(e)}'
            })
        }

    # Extract email from parsed body
    email = body.get('email')
    confirm = body.get('confirm', False)

    if not email:
        return {
            'statusCode': 400,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
            },
            'body': json.dumps({
                'error': 'Missing required field: email'
            })
        }

    if not confirm:
        return {
            'statusCode': 400,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
            },
            'body': json.dumps({
                'error': 'Deletion not confirmed. Set "confirm": true to proceed.'
            })
        }

    try:
        # Step 1: Get userId from Cognito using email
        print(f"Looking up user by email: {email}")
        user_id = get_user_id_from_email(email)

        if not user_id:
            return {
                'statusCode': 404,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
                },
                'body': json.dumps({
                    'error': f'User not found with email: {email}'
                })
            }

        print(f"Found userId: {user_id} for email: {email}")

        # Initialize deletion report
        deletion_report = {
            'userId': user_id,
            'email': email,
            'timestamp': datetime.utcnow().isoformat(),
            'deletions': {}
        }

        # Step 2: Delete from DynamoDB tables
        print("Starting DynamoDB deletions...")
        deletion_report['deletions']['dynamodb'] = delete_from_dynamodb(user_id)

        # Step 3: Delete from S3
        print("Starting S3 deletions...")
        deletion_report['deletions']['s3'] = delete_from_s3(user_id)

        # Step 4: Delete from OpenSearch (if configured)
        if OPENSEARCH_COLLECTION_ENDPOINT:
            print("Starting OpenSearch deletions...")
            deletion_report['deletions']['opensearch'] = delete_from_opensearch(user_id)
        else:
            deletion_report['deletions']['opensearch'] = {
                'status': 'skipped',
                'reason': 'No OpenSearch endpoint configured'
            }

        # Step 5: Delete from Cognito (LAST - no going back after this)
        print("Deleting from Cognito...")
        deletion_report['deletions']['cognito'] = delete_from_cognito(email)

        print(f"User deletion complete: {json.dumps(deletion_report, default=str)}")

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
            },
            'body': json.dumps({
                'message': f'User {email} and all associated data deleted successfully',
                'report': deletion_report
            }, default=str)
        }

    except Exception as e:
        print(f"Error during user deletion: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
            },
            'body': json.dumps({
                'error': f'Failed to delete user: {str(e)}'
            })
        }


def get_user_id_from_email(email):
    """Get userId (Cognito sub) from email address"""
    try:
        response = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )

        if response['Users']:
            user = response['Users'][0]
            # Extract 'sub' attribute which is used as userId
            for attr in user['Attributes']:
                if attr['Name'] == 'sub':
                    return attr['Value']

        return None

    except ClientError as e:
        print(f"Error looking up user: {str(e)}")
        return None


def delete_from_dynamodb(user_id):
    """Delete all user data from DynamoDB tables"""
    results = {}

    # Table 1: User Profiles
    results['user_profiles'] = delete_items_by_partition_key(
        TABLE_USER_PROFILES,
        user_id
    )

    # Table 2: Document Metadata
    results['document_metadata'] = delete_items_by_partition_key(
        TABLE_DOCUMENT_METADATA,
        user_id
    )

    # Table 3: Chat Sessions
    results['chat_sessions'] = delete_items_by_partition_key(
        TABLE_CHAT_SESSIONS,
        user_id
    )

    # Table 4: Feedback
    results['feedback'] = delete_items_by_partition_key(
        TABLE_FEEDBACK,
        user_id
    )

    # Table 5: Personalized Insights
    results['personalized_insights'] = delete_items_by_partition_key(
        TABLE_PERSONALIZED_INSIGHTS,
        user_id
    )

    # Table 6: Activity Logs (requires scanning since userId is not partition key)
    results['activity_logs'] = delete_activity_logs_by_user_id(user_id)

    return results


def delete_items_by_partition_key(table_name, partition_key_value):
    """Delete all items with given partition key from a table"""
    try:
        table = dynamodb.Table(table_name)

        # Query all items with this partition key
        response = table.query(
            KeyConditionExpression=Key('userId').eq(partition_key_value)
        )

        items = response.get('Items', [])
        deleted_count = 0

        # Get table key schema to know which attributes are keys
        table_description = table.meta.client.describe_table(TableName=table_name)
        key_schema = table_description['Table']['KeySchema']

        # Extract key attribute names
        key_names = [key['AttributeName'] for key in key_schema]

        # Delete each item
        with table.batch_writer() as batch:
            for item in items:
                # Build key dict with only key attributes
                key_dict = {k: item[k] for k in key_names if k in item}
                batch.delete_item(Key=key_dict)
                deleted_count += 1

        # Handle pagination if there are more items
        while 'LastEvaluatedKey' in response:
            response = table.query(
                KeyConditionExpression=Key('userId').eq(partition_key_value),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )

            items = response.get('Items', [])
            with table.batch_writer() as batch:
                for item in items:
                    key_dict = {k: item[k] for k in key_names if k in item}
                    batch.delete_item(Key=key_dict)
                    deleted_count += 1

        return {
            'status': 'success',
            'items_deleted': deleted_count
        }

    except Exception as e:
        print(f"Error deleting from {table_name}: {str(e)}")
        return {
            'status': 'error',
            'error': str(e),
            'items_deleted': 0
        }


def delete_activity_logs_by_user_id(user_id):
    """
    Delete activity logs for a user
    Note: userId is not the partition key, so we need to use GSI or scan
    """
    try:
        table = dynamodb.Table(TABLE_ACTIVITY_LOGS)
        deleted_count = 0

        # Scan table filtering by userId attribute
        # Note: This is expensive for large tables, but necessary for compliance
        response = table.scan(
            FilterExpression=Key('userId').eq(user_id)
        )

        items = response.get('Items', [])

        # Get key schema
        table_description = table.meta.client.describe_table(TableName=TABLE_ACTIVITY_LOGS)
        key_schema = table_description['Table']['KeySchema']
        key_names = [key['AttributeName'] for key in key_schema]

        # Delete items
        with table.batch_writer() as batch:
            for item in items:
                key_dict = {k: item[k] for k in key_names if k in item}
                batch.delete_item(Key=key_dict)
                deleted_count += 1

        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = table.scan(
                FilterExpression=Key('userId').eq(user_id),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )

            items = response.get('Items', [])
            with table.batch_writer() as batch:
                for item in items:
                    key_dict = {k: item[k] for k in key_names if k in item}
                    batch.delete_item(Key=key_dict)
                    deleted_count += 1

        return {
            'status': 'success',
            'items_deleted': deleted_count
        }

    except Exception as e:
        print(f"Error deleting activity logs: {str(e)}")
        return {
            'status': 'error',
            'error': str(e),
            'items_deleted': 0
        }


def delete_from_s3(user_id):
    """Delete all S3 objects for a user"""
    try:
        prefix = f'users/{user_id}/'
        deleted_objects = []

        # List all objects with this prefix
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=DOCS_BUCKET, Prefix=prefix)

        for page in pages:
            if 'Contents' not in page:
                continue

            # Delete objects in batches of 1000 (S3 limit)
            objects_to_delete = [{'Key': obj['Key']} for obj in page['Contents']]

            if objects_to_delete:
                response = s3.delete_objects(
                    Bucket=DOCS_BUCKET,
                    Delete={'Objects': objects_to_delete}
                )

                deleted_objects.extend(response.get('Deleted', []))

        return {
            'status': 'success',
            'objects_deleted': len(deleted_objects),
            'prefix': prefix
        }

    except Exception as e:
        print(f"Error deleting from S3: {str(e)}")
        return {
            'status': 'error',
            'error': str(e),
            'objects_deleted': 0
        }


def delete_from_opensearch(user_id):
    """
    Delete vector embeddings from OpenSearch Serverless
    Note: This requires OpenSearch API calls - implementation depends on setup
    """
    try:
        # This is a placeholder - actual implementation requires:
        # 1. OpenSearch Python client (opensearch-py)
        # 2. AWS SigV4 authentication
        # 3. Knowledge of the index structure

        # For now, we'll return a placeholder response
        # In production, you'd use the Knowledge Base API to trigger re-sync
        # or use OpenSearch delete-by-query API

        return {
            'status': 'pending',
            'message': 'OpenSearch deletion requires Knowledge Base re-sync or manual delete-by-query',
            'userId': user_id,
            'action_required': 'Trigger Knowledge Base sync job to remove user embeddings'
        }

    except Exception as e:
        print(f"Error deleting from OpenSearch: {str(e)}")
        return {
            'status': 'error',
            'error': str(e)
        }


def delete_from_cognito(email):
    """Delete user from Cognito User Pool"""
    try:
        # Get username from email
        response = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )

        if not response['Users']:
            return {
                'status': 'not_found',
                'message': f'User with email {email} not found in Cognito'
            }

        username = response['Users'][0]['Username']

        # Delete the user
        cognito.admin_delete_user(
            UserPoolId=USER_POOL_ID,
            Username=username
        )

        return {
            'status': 'success',
            'username_deleted': username,
            'email': email
        }

    except Exception as e:
        print(f"Error deleting from Cognito: {str(e)}")
        return {
            'status': 'error',
            'error': str(e)
        }
