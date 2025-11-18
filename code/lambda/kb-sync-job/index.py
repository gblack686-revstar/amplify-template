"""
Nightly Knowledge Base Sync Job
Runs at 2 AM to reindex the Knowledge Base with latest documents
"""
import json
import os
import boto3
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

bedrock_agent = boto3.client('bedrock-agent')

KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
DATA_SOURCE_ID = os.environ.get('DATA_SOURCE_ID')


def lambda_handler(event, context):
    """
    Trigger Knowledge Base ingestion job
    This runs nightly at 2 AM to ensure KB is up-to-date with latest documents
    """
    logger.info(f"Starting nightly KB sync job at {datetime.utcnow().isoformat()}")

    try:
        if not KNOWLEDGE_BASE_ID or not DATA_SOURCE_ID:
            raise ValueError("Missing required environment variables: KNOWLEDGE_BASE_ID or DATA_SOURCE_ID")

        # Start ingestion job
        response = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID,
            description=f"Nightly sync job - {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}"
        )

        ingestion_job = response['ingestionJob']
        job_id = ingestion_job['ingestionJobId']
        status = ingestion_job['status']

        logger.info(f"Successfully started ingestion job: {job_id} with status: {status}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'KB sync job started successfully',
                'jobId': job_id,
                'status': status,
                'knowledgeBaseId': KNOWLEDGE_BASE_ID,
                'dataSourceId': DATA_SOURCE_ID,
                'timestamp': datetime.utcnow().isoformat()
            })
        }

    except Exception as e:
        logger.error(f"Error starting KB sync job: {str(e)}", exc_info=True)

        # Don't fail the job - just log the error
        # This prevents alerting in case of transient issues
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to start KB sync job',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
        }
