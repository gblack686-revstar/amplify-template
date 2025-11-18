"""
Fix Knowledge Base Metadata Format
Converts existing metadata files to Bedrock Knowledge Base compatible format
"""
import boto3
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

s3_client = boto3.client('s3')
BUCKET_NAME = 'llmopsquickstartstack-docsbucket9b584aa4-s99bdxcjyz48'

def convert_metadata_to_bedrock_format(metadata):
    """
    Convert application metadata to Bedrock Knowledge Base format

    Bedrock expects:
    {
        "metadataAttributes": {
            "key1": "value1",
            "key2": "value2"
        }
    }
    """
    return {
        "metadataAttributes": {
            "userId": metadata.get('userId', ''),
            "documentType": metadata.get('documentType', ''),
            "originalFilename": metadata.get('originalFilename', ''),
            "uploadedAt": metadata.get('uploadedAt', ''),
            "uploadedBy": metadata.get('uploadedBy', ''),
            "mimeType": metadata.get('mimeType', '')
        }
    }

def process_user_documents(user_id):
    """Process all metadata files for a specific user"""
    prefix = f'users/{user_id}/'

    logger.info(f"Processing documents for user: {user_id}")

    # List all objects with .metadata.json suffix
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix)

    updated_count = 0
    error_count = 0

    for page in pages:
        if 'Contents' not in page:
            continue

        for obj in page['Contents']:
            key = obj['Key']

            # Only process .metadata.json files
            if not key.endswith('.metadata.json'):
                continue

            try:
                # Download existing metadata
                logger.info(f"Processing: {key}")
                response = s3_client.get_object(Bucket=BUCKET_NAME, Key=key)
                existing_metadata = json.loads(response['Body'].read().decode('utf-8'))

                # Convert to Bedrock format
                bedrock_metadata = convert_metadata_to_bedrock_format(existing_metadata)

                # Upload converted metadata
                s3_client.put_object(
                    Bucket=BUCKET_NAME,
                    Key=key,
                    Body=json.dumps(bedrock_metadata, indent=2),
                    ContentType='application/json'
                )

                logger.info(f"✓ Updated: {key}")
                updated_count += 1

            except Exception as e:
                logger.error(f"✗ Error processing {key}: {str(e)}")
                error_count += 1

    logger.info(f"\nSummary for user {user_id}:")
    logger.info(f"  Updated: {updated_count} files")
    logger.info(f"  Errors: {error_count} files")

    return updated_count, error_count

def main():
    """Process all users or specific user"""
    # Get all user directories
    logger.info("Scanning for user directories...")

    response = s3_client.list_objects_v2(
        Bucket=BUCKET_NAME,
        Prefix='users/',
        Delimiter='/'
    )

    user_ids = []
    if 'CommonPrefixes' in response:
        for prefix in response['CommonPrefixes']:
            # Extract user ID from prefix: users/{userId}/
            user_id = prefix['Prefix'].split('/')[1]
            user_ids.append(user_id)

    logger.info(f"Found {len(user_ids)} users")

    total_updated = 0
    total_errors = 0

    for user_id in user_ids:
        updated, errors = process_user_documents(user_id)
        total_updated += updated
        total_errors += errors

    logger.info(f"\n{'='*60}")
    logger.info(f"FINAL SUMMARY:")
    logger.info(f"  Total users processed: {len(user_ids)}")
    logger.info(f"  Total files updated: {total_updated}")
    logger.info(f"  Total errors: {total_errors}")
    logger.info(f"{'='*60}")

if __name__ == '__main__':
    main()
