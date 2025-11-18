"""
Enhanced Ingest Lambda with Sidecar Support
Handles document ingestion into Knowledge Base and triggers AI extraction
"""
import json
import os
import boto3
from datetime import datetime
import logging
from shared.sidecar_manager import SidecarManager

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_agent = boto3.client('bedrock-agent')
lambda_client = boto3.client('lambda')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
DATA_SOURCE_ID = os.environ.get('DATA_SOURCE_ID')
DOCUMENT_ANALYSIS_LAMBDA = os.environ.get('DOCUMENT_ANALYSIS_LAMBDA_NAME', '')
DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
BUCKET_NAME = os.environ.get('BUCKET_NAME')

# Initialize SidecarManager
sidecar_manager = SidecarManager(s3_client=s3_client, bucket_name=BUCKET_NAME)

# Initialize DynamoDB table
if DOCUMENT_METADATA_TABLE:
    metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE)
else:
    metadata_table = None


def datetime_converter(o):
    if isinstance(o, datetime):
        return o.isoformat()
    raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")


def extract_user_id_from_s3_key(s3_key: str) -> str:
    """Extract userId from S3 key (format: users/{userId}/...)"""
    parts = s3_key.split('/')
    if len(parts) >= 2 and parts[0] == 'users':
        return parts[1]
    return None


def extract_document_id_from_s3_key(s3_key: str) -> str:
    """Extract document ID (UUID) from S3 key filename"""
    filename = s3_key.split('/')[-1]
    # Extract document ID (UUID) from filename
    # Format: {uuid}-{original_filename}.{ext}
    # UUID format: 8-4-4-4-12 characters separated by hyphens
    if '-' in filename:
        # Split filename and take first 5 parts (UUID has 5 parts)
        parts = filename.split('-')
        if len(parts) >= 5:
            # Reconstruct UUID from first 5 parts
            return '-'.join(parts[:5])
        else:
            # Fallback: take everything before the last hyphen
            return filename.rsplit('-', 1)[0]
    else:
        return filename.split('.')[0]


def add_user_id_metadata_to_s3(bucket: str, s3_key: str, user_id: str) -> bool:
    """Add userId metadata to S3 object for Knowledge Base filtering"""
    try:
        logger.info(f"Adding userId metadata to S3 object: {s3_key}")

        # Get current object
        obj = s3_client.get_object(Bucket=bucket, Key=s3_key)
        content_type = obj.get('ContentType', 'application/pdf')

        # Copy object with new metadata
        s3_client.copy_object(
            Bucket=bucket,
            CopySource={'Bucket': bucket, 'Key': s3_key},
            Key=s3_key,
            Metadata={
                'userId': user_id,
                'ingestionTimestamp': datetime.utcnow().isoformat()
            },
            MetadataDirective='REPLACE',
            ContentType=content_type
        )

        logger.info("Successfully added userId metadata to S3 object")
        return True
    except Exception as e:
        logger.error(f"Failed to add userId metadata: {str(e)}")
        return False


def update_document_status(user_id: str, s3_key: str, status: str, ingestion_job_id: str = None):
    """Update document status in DynamoDB metadata table"""
    if not metadata_table or not user_id:
        return

    try:
        document_id = extract_document_id_from_s3_key(s3_key)

        update_expr = 'SET currentStatus = :status, updatedAt = :now'
        expr_values = {
            ':status': status,
            ':now': datetime.utcnow().isoformat()
        }

        if ingestion_job_id:
            update_expr += ', ingestionJobId = :jobId'
            expr_values[':jobId'] = ingestion_job_id

        metadata_table.update_item(
            Key={'userId': user_id, 'documentId': document_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values
        )
        logger.info(f"Updated document {document_id} to {status}")
    except Exception as e:
        logger.warning(f"Could not update DynamoDB (non-critical): {str(e)}")


def update_sidecar_status(s3_key: str, status: str, details: str, user_id: str = None):
    """Update processing sidecar with status"""
    try:
        sidecar_manager.append_processing_status(s3_key, status=status, details=details)

        if user_id:
            sidecar_manager.append_audit_event(
                s3_key,
                action=status,
                user_id=user_id,
                s3Bucket=BUCKET_NAME,
                s3Key=s3_key
            )
    except Exception as e:
        logger.warning(f"Could not update sidecar (non-critical): {str(e)}")


def invoke_document_analysis(bucket: str, s3_key: str, ingestion_job_id: str):
    """Trigger DocumentAnalysis Lambda asynchronously"""
    if not DOCUMENT_ANALYSIS_LAMBDA:
        return

    try:
        analysis_payload = {
            's3Bucket': bucket,
            's3Key': s3_key,
            'ingestionJobId': ingestion_job_id
        }

        logger.info(f"Invoking DocumentAnalysis Lambda for {s3_key}")

        lambda_client.invoke(
            FunctionName=DOCUMENT_ANALYSIS_LAMBDA,
            InvocationType='Event',
            Payload=json.dumps(analysis_payload)
        )

        logger.info("DocumentAnalysis Lambda invoked successfully")
    except Exception as e:
        logger.error(f"Error invoking DocumentAnalysis Lambda: {str(e)}")


def process_s3_record(record: dict, context) -> dict:
    """Process a single S3 event record"""
    event_name = record.get('eventName', '')

    # Only process PUT events
    if not event_name.startswith('ObjectCreated'):
        logger.info(f"Skipping non-creation event: {event_name}")
        return None

    s3_info = record.get('s3', {})
    bucket = s3_info.get('bucket', {}).get('name', '')
    s3_key = s3_info.get('object', {}).get('key', '')

    logger.info(f"Processing S3 object: {bucket}/{s3_key}")

    # Check if this is a sidecar file - if so, skip ingestion
    if sidecar_manager.is_sidecar_file(s3_key):
        logger.info(f"Skipping sidecar file: {s3_key}")
        return None

    # This is a real document - proceed with ingestion
    logger.info(f"Document detected: {s3_key}")

    # Extract userId from S3 key
    user_id = extract_user_id_from_s3_key(s3_key)
    if user_id:
        logger.info(f"Extracted userId from S3 key: {user_id}")
        # Add userId as S3 object metadata for Knowledge Base filtering
        add_user_id_metadata_to_s3(bucket, s3_key, user_id)
    else:
        logger.warning(f"Could not extract userId from S3 key: {s3_key}")

    # Update DynamoDB to upload_complete first
    update_document_status(user_id, s3_key, 'upload_complete')

    # Update processing sidecar - ingestion started
    update_sidecar_status(s3_key, 'ingestion_started', 'Starting Knowledge Base ingestion', user_id)

    # Start Knowledge Base ingestion job
    input_params = {
        'knowledgeBaseId': KNOWLEDGE_BASE_ID,
        'dataSourceId': DATA_SOURCE_ID,
        'clientToken': context.aws_request_id
    }

    logger.info(f"Starting ingestion job for Knowledge Base {KNOWLEDGE_BASE_ID}")
    aws_api_response = bedrock_agent.start_ingestion_job(**input_params)
    ingestion_job_details = aws_api_response.get('ingestionJob')
    ingestion_job_id = ingestion_job_details.get('ingestionJobId')

    logger.info(f"Ingestion job started: {ingestion_job_id}")

    # Update processing sidecar - ingestion in progress
    update_sidecar_status(
        s3_key,
        'ingestion_in_progress',
        f'Ingestion job {ingestion_job_id} in progress'
    )

    # Update DynamoDB metadata with ingestion job ID
    update_document_status(user_id, s3_key, 'ingestion_in_progress', ingestion_job_id)

    # Trigger DocumentAnalysis Lambda asynchronously
    invoke_document_analysis(bucket, s3_key, ingestion_job_id)

    return ingestion_job_details


def lambda_handler(event, context):
    """
    Enhanced Lambda handler for document ingestion
    - Skips sidecar files
    - Updates processing status via sidecars
    - Triggers AI extraction after ingestion
    """
    try:
        logger.info(f"Received event: {json.dumps(event)}")

        # Store ingestion job details for response
        ingestion_jobs = []

        # Process each S3 event record
        for record in event.get('Records', []):
            job_details = process_s3_record(record, context)
            if job_details:
                ingestion_jobs.append(job_details)

        # Return first job details for single-file processing
        # For multiple files, return all job details
        response = {
            'status': 'success',
            'message': 'Ingestion processing complete'
        }

        if len(ingestion_jobs) == 1:
            response['ingestionJob'] = ingestion_jobs[0]
        elif len(ingestion_jobs) > 1:
            response['ingestionJobs'] = ingestion_jobs

        return json.dumps(response, default=datetime_converter)

    except Exception as e:
        logger.error(f"Error in ingestion handler: {str(e)}", exc_info=True)
        error_payload = {'error': str(e)}
        return json.dumps(error_payload)
