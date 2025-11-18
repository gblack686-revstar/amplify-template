"""
Roadmap Management Lambda
Handles CRUD operations for user roadmap items
"""
import json
import os
import boto3
from datetime import datetime, timezone
import logging
from typing import Dict, Any
from decimal import Decimal
import uuid

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

ROADMAP_TABLE = os.environ.get('ROADMAP_TABLE_NAME')
LOGGING_TABLE = os.environ.get('LOGGING_TABLE_NAME')

roadmap_table = dynamodb.Table(ROADMAP_TABLE)
logging_table = dynamodb.Table(LOGGING_TABLE)


def decimal_default(obj):
    """JSON encoder for Decimal objects"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def get_user_id_from_event(event: Dict[str, Any]) -> str:
    """Extract user ID from JWT claims"""
    try:
        claims = event['requestContext']['authorizer']['claims']
        return claims.get('sub') or claims.get('cognito:username')
    except (KeyError, TypeError) as e:
        logger.error(f"Error extracting user ID: {str(e)}")
        raise ValueError("User ID not found in request")


def log_activity(user_id: str, activity_type: str, description: str, metadata: Dict[str, Any] = None):
    """Log activity to DynamoDB logging table"""
    try:
        logging_table.put_item(Item={
            'id': str(uuid.uuid4()),
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'userId': user_id,
            'requestType': activity_type,
            'description': description,
            'metadata': metadata or {},
            'ttl': int((datetime.now(timezone.utc).timestamp()) + (90 * 24 * 60 * 60))  # 90 days TTL
        })
    except Exception as e:
        logger.error(f"Error logging activity: {str(e)}")


def get_roadmap_items(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Get all roadmap items for the user"""
    try:
        user_id = get_user_id_from_event(event)

        # Query all items for this user
        response = roadmap_table.query(
            KeyConditionExpression='userId = :userId',
            ExpressionAttributeValues={':userId': user_id}
        )

        items = response.get('Items', [])

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'items': items}, default=decimal_default)
        }
    except Exception as e:
        logger.error(f"Error getting roadmap items: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to fetch roadmap items'})
        }


def create_roadmap_item(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Create a new roadmap item"""
    try:
        user_id = get_user_id_from_event(event)
        body = json.loads(event['body'])

        # Generate unique item ID
        item_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        # Create item
        item = {
            'userId': user_id,
            'itemId': item_id,
            'title': body['title'],
            'description': body.get('description', ''),
            'category': body.get('category', 'other'),
            'status': body.get('status', 'not_started'),
            'dueDate': body.get('dueDate'),
            'notes': body.get('notes', []),
            'createdAt': timestamp,
            'updatedAt': timestamp,
        }

        roadmap_table.put_item(Item=item)

        # Log activity
        log_activity(
            user_id,
            'roadmap_item_added',
            f"Added roadmap item: {body['title']}",
            {'itemId': item_id, 'category': item['category']}
        )

        return {
            'statusCode': 201,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'item': item}, default=decimal_default)
        }
    except Exception as e:
        logger.error(f"Error creating roadmap item: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to create roadmap item'})
        }


def update_roadmap_item(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Update an existing roadmap item"""
    try:
        user_id = get_user_id_from_event(event)
        path_params = event.get('pathParameters', {})
        item_id = path_params.get('itemId')

        if not item_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Missing itemId'})
            }

        body = json.loads(event['body'])

        # Get existing item to check ownership
        existing = roadmap_table.get_item(Key={'userId': user_id, 'itemId': item_id})
        if 'Item' not in existing:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Item not found'})
            }

        old_status = existing['Item'].get('status')
        body.get('status', old_status)

        # Build update expression
        update_expression = "SET updatedAt = :updatedAt"
        expression_values = {':updatedAt': datetime.now(timezone.utc).isoformat()}

        if 'title' in body:
            update_expression += ", title = :title"
            expression_values[':title'] = body['title']

        if 'description' in body:
            update_expression += ", description = :description"
            expression_values[':description'] = body['description']

        if 'category' in body:
            update_expression += ", category = :category"
            expression_values[':category'] = body['category']

        if 'status' in body:
            update_expression += ", #status = :status"
            expression_values[':status'] = body['status']

            # If status changed to completed, add completedAt timestamp
            if body['status'] == 'completed' and old_status != 'completed':
                update_expression += ", completedAt = :completedAt"
                expression_values[':completedAt'] = datetime.now(timezone.utc).isoformat()

                # Log completion activity
                log_activity(
                    user_id,
                    'roadmap_item_completed',
                    f"Completed roadmap item: {existing['Item'].get('title')}",
                    {'itemId': item_id, 'category': existing['Item'].get('category')}
                )

        if 'dueDate' in body:
            update_expression += ", dueDate = :dueDate"
            expression_values[':dueDate'] = body['dueDate']

        if 'notes' in body:
            update_expression += ", notes = :notes"
            expression_values[':notes'] = body['notes']

        if 'thumbsUpGiven' in body:
            update_expression += ", thumbsUpGiven = :thumbsUpGiven"
            expression_values[':thumbsUpGiven'] = body['thumbsUpGiven']

        # Update item
        response = roadmap_table.update_item(
            Key={'userId': user_id, 'itemId': item_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames={'#status': 'status'} if 'status' in body else None,
            ExpressionAttributeValues=expression_values,
            ReturnValues='ALL_NEW'
        )

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'item': response['Attributes']}, default=decimal_default)
        }
    except Exception as e:
        logger.error(f"Error updating roadmap item: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to update roadmap item'})
        }


def delete_roadmap_item(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Delete a roadmap item"""
    try:
        user_id = get_user_id_from_event(event)
        path_params = event.get('pathParameters', {})
        item_id = path_params.get('itemId')

        if not item_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Missing itemId'})
            }

        # Get item before deleting for logging
        existing = roadmap_table.get_item(Key={'userId': user_id, 'itemId': item_id})
        if 'Item' in existing:
            title = existing['Item'].get('title', 'Unknown')

            # Delete item
            roadmap_table.delete_item(Key={'userId': user_id, 'itemId': item_id})

            # Log activity
            log_activity(
                user_id,
                'roadmap_item_removed',
                f"Removed roadmap item: {title}",
                {'itemId': item_id}
            )

        return {
            'statusCode': 204,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': ''
        }
    except Exception as e:
        logger.error(f"Error deleting roadmap item: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to delete roadmap item'})
        }


def lambda_handler(event, context):
    """
    Main handler for roadmap management operations

    Routes:
    GET /roadmap - Get all roadmap items
    POST /roadmap - Create new roadmap item
    PUT /roadmap/{itemId} - Update roadmap item
    DELETE /roadmap/{itemId} - Delete roadmap item
    """
    logger.info(f"Received event: {json.dumps(event)}")

    http_method = event.get('httpMethod', '')
    event.get('path', '')

    try:
        if http_method == 'GET':
            return get_roadmap_items(event, context)
        elif http_method == 'POST':
            return create_roadmap_item(event, context)
        elif http_method == 'PUT':
            return update_roadmap_item(event, context)
        elif http_method == 'DELETE':
            return delete_roadmap_item(event, context)
        else:
            return {
                'statusCode': 405,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
