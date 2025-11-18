"""
Ingestion Status Checker Lambda
Runs on EventBridge schedule to check ingestion job status and update DynamoDB
"""
import json
import os
import boto3
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
bedrock_agent = boto3.client('bedrock-agent')

DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
DATA_SOURCE_ID = os.environ.get('DATA_SOURCE_ID')

metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE)


def lambda_handler(event, context):
    """
    Check status of in-progress ingestion jobs and update DynamoDB
    Triggered by EventBridge every 1 minute
    """
    logger.info("Starting ingestion status check")

    try:
        # Scan for documents with in-progress or indexing_wait status
        # Note: In production, use GSI query instead of scan for better performance
        response = metadata_table.scan(
            FilterExpression='currentStatus = :status1 OR currentStatus = :status2',
            ExpressionAttributeValues={
                ':status1': 'ingestion_in_progress',
                ':status2': 'indexing_wait'
            }
        )

        documents = response.get('Items', [])
        logger.info(f"Found {len(documents)} documents in ingestion or waiting for indexing")

        for doc in documents:
            try:
                user_id = doc.get('userId')
                document_id = doc.get('documentId')
                ingestion_job_id = doc.get('ingestionJobId')

                if not ingestion_job_id:
                    logger.warning(f"No ingestion job ID for {document_id}")
                    continue

                # Check ingestion job status
                job_response = bedrock_agent.get_ingestion_job(
                    knowledgeBaseId=KNOWLEDGE_BASE_ID,
                    dataSourceId=DATA_SOURCE_ID,
                    ingestionJobId=ingestion_job_id
                )

                job = job_response.get('ingestionJob', {})
                status = job.get('status')

                logger.info(f"Job {ingestion_job_id} status: {status}")

                # Update based on job status
                if status == 'COMPLETE':
                    # Check if we need to add indexing delay
                    # After ingestion completes, we wait 15 seconds for KB indexing
                    current_status = doc.get('currentStatus')
                    indexing_delay_until = doc.get('indexingDelayUntil')

                    if current_status == 'ingestion_in_progress':
                        # First time seeing COMPLETE - set delay
                        delay_until = (datetime.utcnow() + timedelta(seconds=15)).isoformat()
                        metadata_table.update_item(
                            Key={'userId': user_id, 'documentId': document_id},
                            UpdateExpression='SET currentStatus = :status, indexingDelayUntil = :delay, updatedAt = :now',
                            ExpressionAttributeValues={
                                ':status': 'indexing_wait',
                                ':delay': delay_until,
                                ':now': datetime.utcnow().isoformat()
                            }
                        )
                        logger.info(f"Document {document_id} ingestion complete, waiting 15s for KB indexing")
                    elif current_status == 'indexing_wait' and indexing_delay_until:
                        # Check if delay period has passed
                        delay_time = datetime.fromisoformat(indexing_delay_until.replace('Z', '+00:00'))
                        if datetime.utcnow() >= delay_time.replace(tzinfo=None):
                            # Delay complete - mark as ready
                            metadata_table.update_item(
                                Key={'userId': user_id, 'documentId': document_id},
                                UpdateExpression='SET currentStatus = :status, updatedAt = :now REMOVE indexingDelayUntil',
                                ExpressionAttributeValues={
                                    ':status': 'ingestion_complete',
                                    ':now': datetime.utcnow().isoformat()
                                }
                            )
                            logger.info(f"Document {document_id} ready after indexing delay")
                        else:
                            logger.info(f"Document {document_id} still waiting for KB indexing")

                elif status == 'FAILED':
                    failure_reasons = job.get('failureReasons', ['Unknown error'])
                    metadata_table.update_item(
                        Key={'userId': user_id, 'documentId': document_id},
                        UpdateExpression='SET currentStatus = :status, errorMessage = :error, updatedAt = :now',
                        ExpressionAttributeValues={
                            ':status': 'error',
                            ':error': ', '.join(failure_reasons),
                            ':now': datetime.utcnow().isoformat()
                        }
                    )
                    logger.error(f"Document {document_id} ingestion failed: {failure_reasons}")

                # If IN_PROGRESS or STARTING, leave status as is

            except Exception as doc_error:
                logger.error(f"Error checking document {doc.get('documentId')}: {str(doc_error)}")
                continue

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Checked {len(documents)} documents',
                'processed': len(documents)
            })
        }

    except Exception as e:
        logger.error(f"Error in ingestion status checker: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
