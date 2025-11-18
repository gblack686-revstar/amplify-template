"""
Document List Lambda
Handles listing and retrieving user's documents from DynamoDB
"""
import json
import os
import boto3
import logging
from typing import Dict, Any
from decimal import Decimal

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
DOCS_BUCKET = os.environ.get('DOCS_BUCKET_NAME')

metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE)

# CORS headers for all responses
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
}


def decimal_to_float(obj):
    """Convert Decimal objects to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


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


def make_response(status_code: int, body: Any) -> Dict[str, Any]:
    """Create standardized API response"""
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, default=decimal_to_float) if body else ''
    }


def delete_sidecar_files(s3_key: str):
    """Delete all sidecar files associated with a document"""
    sidecar_types = ['metadata', 'extracted', 'processing', 'insights', 'audit']
    for sidecar_type in sidecar_types:
        sidecar_key = f"{s3_key}.{sidecar_type}.json"
        try:
            s3_client.delete_object(Bucket=DOCS_BUCKET, Key=sidecar_key)
        except Exception as e:
            logger.warning(f"Could not delete sidecar {sidecar_key}: {str(e)}")


def handle_delete_document(user_id: str, document_id: str) -> Dict[str, Any]:
    """Handle DELETE /documents/{documentId}"""
    if not document_id:
        return make_response(400, {'error': 'documentId is required'})

    try:
        # Get document metadata first to get S3 key
        response = metadata_table.get_item(
            Key={'userId': user_id, 'documentId': document_id}
        )

        if 'Item' not in response:
            return make_response(404, {'error': 'Document not found'})

        s3_key = response['Item'].get('s3Key')

        # Delete from S3
        if s3_key:
            try:
                s3_client.delete_object(Bucket=DOCS_BUCKET, Key=s3_key)
                logger.info(f"Deleted S3 object: {s3_key}")
                # Also delete sidecar files
                delete_sidecar_files(s3_key)
            except Exception as e:
                logger.error(f"Error deleting from S3: {str(e)}")

        # Delete from DynamoDB
        metadata_table.delete_item(
            Key={'userId': user_id, 'documentId': document_id}
        )

        return make_response(200, {
            'message': 'Document deleted successfully',
            'documentId': document_id
        })
    except Exception as e:
        logger.error(f"Error deleting document: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to delete document'})


def handle_get_document(user_id: str, document_id: str) -> Dict[str, Any]:
    """Handle GET /documents/{documentId}"""
    try:
        response = metadata_table.get_item(
            Key={'userId': user_id, 'documentId': document_id}
        )

        if 'Item' not in response:
            return make_response(404, {'error': 'Document not found'})

        return make_response(200, response['Item'])
    except Exception as e:
        logger.error(f"Error getting document: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to retrieve document'})


def query_documents_by_type(user_id: str, document_type: str, limit: int) -> dict:
    """Query documents filtered by document type"""
    return metadata_table.query(
        IndexName='documentType-index',
        KeyConditionExpression='userId = :userId AND documentType = :docType',
        ExpressionAttributeValues={
            ':userId': user_id,
            ':docType': document_type
        },
        Limit=limit
    )


def query_documents_by_status(user_id: str, status: str, limit: int) -> dict:
    """Query documents filtered by status"""
    return metadata_table.query(
        IndexName='status-index',
        KeyConditionExpression='userId = :userId AND currentStatus = :status',
        ExpressionAttributeValues={
            ':userId': user_id,
            ':status': status
        },
        Limit=limit
    )


def query_all_documents(user_id: str, limit: int) -> dict:
    """Query all documents for user"""
    return metadata_table.query(
        KeyConditionExpression='userId = :userId',
        ExpressionAttributeValues={':userId': user_id},
        Limit=limit,
        ScanIndexForward=False  # Sort by documentId descending (newest first)
    )


def format_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Format document for API response"""
    return {
        'documentId': doc.get('documentId'),
        'originalFilename': doc.get('originalFilename'),
        'documentType': doc.get('documentType'),
        'fileSize': doc.get('fileSize'),
        'mimeType': doc.get('mimeType'),
        'currentStatus': doc.get('currentStatus'),
        'tags': doc.get('tags', []),
        'createdAt': doc.get('createdAt'),
        'updatedAt': doc.get('updatedAt'),
        's3Key': doc.get('s3Key')
    }


def handle_list_documents(user_id: str, query_parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Handle GET /documents - List all documents for user"""
    document_type = query_parameters.get('documentType')
    status = query_parameters.get('status')
    limit = int(query_parameters.get('limit', 50))

    try:
        # Query documents based on filters
        if document_type:
            response = query_documents_by_type(user_id, document_type, limit)
        elif status:
            response = query_documents_by_status(user_id, status, limit)
        else:
            response = query_all_documents(user_id, limit)

        documents = response.get('Items', [])

        # Format response
        formatted_docs = [format_document(doc) for doc in documents]

        return make_response(200, {
            'documents': formatted_docs,
            'count': len(formatted_docs),
            'hasMore': 'LastEvaluatedKey' in response
        })

    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Failed to list documents'})


def lambda_handler(event, context):
    """
    Handle document listing and retrieval

    GET /documents - List all documents for user
    GET /documents/{documentId} - Get specific document metadata
    DELETE /documents/{documentId} - Delete document

    Query parameters for list:
    - documentType: Filter by type (iep, aba_report, medical_record, other)
    - status: Filter by status
    - limit: Number of results (default: 50)
    """
    logger.info(f"Received event: {json.dumps(event)}")

    # Handle OPTIONS request for CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return make_response(200, None)

    try:
        user_id = get_user_id_from_event(event)
        http_method = event.get('httpMethod', 'GET')
        path_parameters = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}

        document_id = path_parameters.get('documentId')

        # Route to appropriate handler based on HTTP method and path
        if http_method == 'DELETE':
            return handle_delete_document(user_id, document_id)
        elif http_method == 'GET':
            if document_id:
                return handle_get_document(user_id, document_id)
            else:
                return handle_list_documents(user_id, query_parameters)
        else:
            return make_response(405, {'error': 'Method not allowed'})

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return make_response(401, {'error': str(e)})
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return make_response(500, {'error': 'Internal server error'})
