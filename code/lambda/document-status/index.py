"""
Document Status Lambda
Returns real-time status of document processing through KB ingestion
"""
import json
import os
import boto3
from datetime import datetime
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
BUCKET_NAME = os.environ.get('BUCKET_NAME')

metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE)


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


def lambda_handler(event, context):
    """
    Get document processing status
    GET /documents/{documentId}/status

    Response:
    {
        "documentId": "uuid",
        "currentStatus": "processing|ingesting|ready|error",
        "statusMessage": "Human-readable status",
        "progress": 0-100,
        "updatedAt": "ISO timestamp"
    }
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        user_id = get_user_id_from_event(event)

        # Get documentId from path parameters
        document_id = event.get('pathParameters', {}).get('documentId')
        if not document_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'documentId is required'})
            }

        # Get document metadata from DynamoDB
        response = metadata_table.get_item(
            Key={
                'userId': user_id,
                'documentId': document_id
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Document not found'})
            }

        item = response['Item']
        current_status = item.get('currentStatus', 'unknown')

        # Map internal status to user-friendly status and progress
        status_map = {
            'upload_initiated': {
                'status': 'uploading',
                'message': 'Uploading document...',
                'progress': 10
            },
            'upload_complete': {
                'status': 'processing',
                'message': 'Processing document...',
                'progress': 30
            },
            'ingestion_started': {
                'status': 'ingesting',
                'message': 'Adding to knowledge base...',
                'progress': 50
            },
            'ingestion_in_progress': {
                'status': 'ingesting',
                'message': 'Adding to knowledge base...',
                'progress': 70
            },
            'ingestion_complete': {
                'status': 'ready',
                'message': 'Document ready! You can now chat about this document.',
                'progress': 100
            },
            'error': {
                'status': 'error',
                'message': 'Error processing document',
                'progress': 0
            }
        }

        status_info = status_map.get(current_status, {
            'status': 'unknown',
            'message': 'Processing...',
            'progress': 50
        })

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,GET'
            },
            'body': json.dumps({
                'documentId': document_id,
                'currentStatus': status_info['status'],
                'statusMessage': status_info['message'],
                'progress': status_info['progress'],
                'updatedAt': item.get('updatedAt', datetime.utcnow().isoformat()),
                'originalFilename': item.get('originalFilename', ''),
                'documentType': item.get('documentType', 'other')
            })
        }

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return {
            'statusCode': 401,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }
    except Exception as e:
        logger.error(f"Error getting document status: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
