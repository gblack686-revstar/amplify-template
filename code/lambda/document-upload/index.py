"""
Document Upload Lambda
Generates presigned URLs for document upload and initializes sidecar metadata
"""
import json
import os
import boto3
from datetime import datetime, timezone
import uuid
import logging
from typing import Dict, Any

# Import SidecarManager
from shared.sidecar_manager import SidecarManager

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

DOCS_BUCKET = os.environ.get('DOCS_BUCKET_NAME')
DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
USER_PROFILES_TABLE = os.environ.get('USER_PROFILES_TABLE_NAME', '')
LOGGING_TABLE_NAME = os.environ.get('LOGGING_TABLE_NAME')

metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE)
logging_table = dynamodb.Table(LOGGING_TABLE_NAME) if LOGGING_TABLE_NAME else None
sidecar_manager = SidecarManager(s3_client=s3_client, bucket_name=DOCS_BUCKET)


def get_family_profile(user_id: str) -> Dict[str, Any]:
    """Fetch family profile from DynamoDB"""
    try:
        if not USER_PROFILES_TABLE:
            logger.warning("USER_PROFILES_TABLE not configured")
            return {}

        profiles_table = dynamodb.Table(USER_PROFILES_TABLE)
        response = profiles_table.get_item(Key={'userId': user_id})

        if 'Item' in response:
            profile = response['Item'].get('profile', {})
            # Extract relevant info for metadata
            return {
                'location': profile.get('location'),
                'maritalStatus': profile.get('marital_status'),
                'numberOfChildren': profile.get('number_of_children'),
                'supportSystem': profile.get('support_system_type', []),
                'children': [
                    {
                        'age': child.get('age'),
                        'autismSeverity': child.get('autism_severity'),
                        'verbalStatus': child.get('verbal_status'),
                        'diagnosisDate': child.get('diagnosis_date'),
                        'currentTherapies': [t.get('type') for t in child.get('current_therapies', [])]
                    } for child in profile.get('children', [])
                ]
            }
        return {}
    except Exception as e:
        logger.error(f"Error fetching family profile: {str(e)}")
        return {}


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
    Generate presigned URL for document upload
    POST /documents/upload

    Request body:
    {
        "filename": "iep-2024.pdf",
        "documentType": "iep|aba_report|medical_record|other",
        "contentType": "application/pdf",
        "fileSize": 2458192,
        "tags": ["iep", "2024"]
    }

    Response:
    {
        "documentId": "uuid",
        "uploadUrl": "presigned-s3-url",
        "s3Key": "users/{userId}/iep/iep-2024.pdf",
        "expiresIn": 3600
    }
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        user_id = get_user_id_from_event(event)

        # Parse request body
        if not event.get('body'):
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Request body is required'})
            }

        body = json.loads(event['body'])

        # Validate required fields
        filename = body.get('filename')
        document_type = body.get('documentType', 'other')
        content_type = body.get('contentType', 'application/pdf')
        file_size = body.get('fileSize', 0)
        tags = body.get('tags', [])

        if not filename:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'filename is required'})
            }

        # Validate file size (max 60MB per USER_EXPERIENCE.yaml)
        max_size = 60 * 1024 * 1024  # 60MB
        if file_size > max_size:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({
                    'error': 'File size exceeds maximum allowed size of 60MB',
                    'maxSizeBytes': max_size
                })
            }

        # Validate document type
        valid_types = ['wellness_plan', 'fitness_assessment', 'health_record', 'nutrition_plan', 'other']
        if document_type not in valid_types:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({
                    'error': 'Invalid documentType',
                    'validTypes': valid_types
                })
            }

        # Generate document ID
        document_id = str(uuid.uuid4())

        # Generate S3 key with proper folder structure
        # Format: users/{userId}/{documentType}/{filename}
        s3_key = f"users/{user_id}/{document_type}/{document_id}-{filename}"

        logger.info(f"Generating presigned URL for {s3_key}")

        # Generate presigned URL for upload (expires in 1 hour)
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': DOCS_BUCKET,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=3600  # 1 hour
        )

        # Fetch family profile for metadata
        family_profile = get_family_profile(user_id)

        # Initialize metadata sidecar with family profile info
        now = datetime.now(timezone.utc).isoformat()
        metadata_sidecar = {
            # Bedrock Knowledge Base metadata attributes (for filtering)
            # IMPORTANT: Keys are automatically lowercased by AWS
            'metadataAttributes': {
                'userid': user_id,  # Lowercase for Bedrock KB filtering
                'documenttype': document_type,
                'uploadedat': now
            },
            # Application-specific metadata
            'documentId': document_id,
            'userId': user_id,
            'documentType': document_type,
            'originalFilename': filename,
            's3Key': s3_key,
            'uploadedAt': now,
            'uploadedBy': 'parent',  # Can be enhanced to extract from Cognito groups
            'fileSize': file_size,
            'mimeType': content_type,
            'version': '1.0',
            'tags': tags,
            'relatedDocuments': [],
            'familyProfile': family_profile  # Include family context with document
        }

        # We'll write the metadata sidecar after successful upload
        # For now, create initial processing sidecar
        processing_sidecar = {
            'statusChain': [
                {
                    'status': 'upload_initiated',
                    'timestamp': now,
                    'details': 'Presigned URL generated, awaiting upload'
                }
            ],
            'currentStatus': 'upload_initiated',
            'errors': []
        }

        # Initialize audit sidecar
        audit_sidecar = {
            'events': [
                {
                    'timestamp': now,
                    'action': 'upload_initiated',
                    'userId': user_id,
                    'documentId': document_id,
                    'filename': filename
                }
            ]
        }

        # Write initial sidecars to S3 including metadata with family profile
        sidecar_manager.write_sidecar(s3_key, 'metadata', metadata_sidecar)
        sidecar_manager.write_sidecar(s3_key, 'processing', processing_sidecar)
        sidecar_manager.write_sidecar(s3_key, 'audit', audit_sidecar)

        # Create DynamoDB record with sidecar references
        metadata_table.put_item(
            Item={
                'userId': user_id,
                'documentId': document_id,
                's3Key': s3_key,
                'documentType': document_type,
                'originalFilename': filename,
                'fileSize': file_size,
                'mimeType': content_type,
                'sidecarFiles': {
                    'metadata': sidecar_manager.get_sidecar_key(s3_key, 'metadata'),
                    'extracted': sidecar_manager.get_sidecar_key(s3_key, 'extracted'),
                    'processing': sidecar_manager.get_sidecar_key(s3_key, 'processing'),
                    'insights': sidecar_manager.get_sidecar_key(s3_key, 'insights'),
                    'audit': sidecar_manager.get_sidecar_key(s3_key, 'audit')
                },
                'currentStatus': 'upload_initiated',
                'hasActionItems': False,
                'tags': tags,
                'createdAt': now,
                'updatedAt': now
            }
        )

        # Log document upload activity for admin dashboard
        log_activity(
            user_id=user_id,
            request_type='document_upload',
            metadata={
                'documentId': document_id,
                'filename': filename,
                'documentType': document_type,
                'fileSize': file_size
            }
        )

        logger.info(f"Document upload initiated: {document_id}")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            },
            'body': json.dumps({
                'documentId': document_id,
                'uploadUrl': presigned_url,
                's3Key': s3_key,
                'expiresIn': 3600,
                'message': 'Upload URL generated successfully. Use PUT request to upload file.'
            })
        }

    except ValueError as e:
        logger.error(f"ValueError: {str(e)}")
        return {
            'statusCode': 401,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            },
            'body': json.dumps({'error': str(e)})
        }
    except Exception as e:
        logger.error(f"Error generating upload URL: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
