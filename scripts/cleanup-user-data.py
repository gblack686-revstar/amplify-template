#!/usr/bin/env python3
"""
Cleanup User Data Script
Removes all user data except specified admin users.

This script will:
1. Delete all non-admin users from Cognito
2. Clear all user profiles from DynamoDB
3. Clear all chat sessions
4. Clear all documents and metadata
5. Clear all feedback
6. Clear all activity logs
7. Clear all personalized insights
8. Clear all S3 documents

IMPORTANT: This is destructive and cannot be undone!
"""

import boto3
import sys
from typing import List, Set

# AWS Clients
cognito = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

# Configuration - UPDATE THESE FROM CDK OUTPUTS
USER_POOL_ID = 'us-east-1_ph7EUhyWP'
DOCS_BUCKET = 'llmopsquickstartstack-docsbucket9b584aa4-s99bdxcjyz48'

# DynamoDB Tables
USER_PROFILES_TABLE = 'LlmOpsQuickStartStack-user-profiles'
CHAT_SESSIONS_TABLE = 'LlmOpsQuickStartStack-chat-sessions'
DOCUMENT_METADATA_TABLE = 'LlmOpsQuickStartStack-document-metadata'
FEEDBACK_TABLE = 'LlmOpsQuickStartStack-feedback'
LOGGING_TABLE = 'LlmOpsQuickStartStack-LoggingTableCD1B0302-1QW5VMZ8OO3NH'
INSIGHTS_TABLE = 'LlmOpsQuickStartStack-personalized-insights'

# Users to KEEP (admin users)
KEEP_USERS = {'admin@parentingautism.co'}


def get_all_cognito_users() -> List[dict]:
    """Get all users from Cognito user pool"""
    users = []
    paginator = cognito.get_paginator('list_users')

    for page in paginator.paginate(UserPoolId=USER_POOL_ID):
        users.extend(page['Users'])

    return users


def get_admin_user_ids() -> Set[str]:
    """Get user IDs (sub) of all admin users"""
    admin_ids = set()

    try:
        # List all users in Admins group
        paginator = cognito.get_paginator('list_users_in_group')
        for page in paginator.paginate(UserPoolId=USER_POOL_ID, GroupName='admins'):
            for user in page['Users']:
                for attr in user.get('Attributes', []):
                    if attr['Name'] == 'sub':
                        admin_ids.add(attr['Value'])
                        break
    except Exception as e:
        print(f"Error getting admin users: {e}")

    return admin_ids


def delete_cognito_users(dry_run: bool = True):
    """Delete all non-admin users from Cognito"""
    print("\n" + "="*80)
    print("STEP 1: Deleting Cognito Users")
    print("="*80)

    users = get_all_cognito_users()
    admin_ids = get_admin_user_ids()

    deleted_count = 0
    kept_count = 0

    for user in users:
        username = user['Username']

        # Get user's email and sub
        email = None
        user_id = None
        for attr in user.get('Attributes', []):
            if attr['Name'] == 'email':
                email = attr['Value']
            elif attr['Name'] == 'sub':
                user_id = attr['Value']

        # Check if user should be kept
        if email in KEEP_USERS or user_id in admin_ids:
            print(f"  ✓ KEEPING: {email or username} (admin user)")
            kept_count += 1
            continue

        # Delete user
        print(f"  ✗ DELETING: {email or username}")
        if not dry_run:
            try:
                cognito.admin_delete_user(
                    UserPoolId=USER_POOL_ID,
                    Username=username
                )
                deleted_count += 1
            except Exception as e:
                print(f"    ERROR: {e}")
        else:
            deleted_count += 1

    print(f"\nSummary: {deleted_count} users to delete, {kept_count} users kept")
    return deleted_count


def clear_dynamodb_table(table_name: str, key_name: str, dry_run: bool = True) -> int:
    """Clear all items from a DynamoDB table"""
    table = dynamodb.Table(table_name)
    deleted_count = 0

    try:
        # Scan and delete all items
        response = table.scan()
        items = response.get('Items', [])

        while True:
            for item in items:
                key = {key_name: item[key_name]}

                # For composite keys, we need both partition and sort key
                if 'timestamp' in item and table_name == LOGGING_TABLE:
                    key['timestamp'] = item['timestamp']
                elif 'sessionId' in item and table_name == CHAT_SESSIONS_TABLE:
                    key['sessionId'] = item['sessionId']
                elif 'feedbackId' in item and table_name == FEEDBACK_TABLE:
                    key['feedbackId'] = item['feedbackId']
                elif 'insightId' in item and table_name == INSIGHTS_TABLE:
                    key['insightId'] = item['insightId']
                elif 'documentId' in item and table_name == DOCUMENT_METADATA_TABLE:
                    key['documentId'] = item['documentId']

                if not dry_run:
                    try:
                        table.delete_item(Key=key)
                    except Exception as e:
                        print(f"    ERROR deleting {key}: {e}")

                deleted_count += 1

            # Check for more items
            if 'LastEvaluatedKey' not in response:
                break

            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            items = response.get('Items', [])

    except Exception as e:
        print(f"  ERROR scanning table: {e}")

    return deleted_count


def clear_all_dynamodb_tables(dry_run: bool = True):
    """Clear all DynamoDB tables"""
    print("\n" + "="*80)
    print("STEP 2: Clearing DynamoDB Tables")
    print("="*80)

    tables = [
        (USER_PROFILES_TABLE, 'userId'),
        (CHAT_SESSIONS_TABLE, 'userId'),
        (DOCUMENT_METADATA_TABLE, 'userId'),
        (FEEDBACK_TABLE, 'userId'),
        (LOGGING_TABLE, 'id'),
        (INSIGHTS_TABLE, 'userId'),
    ]

    total_deleted = 0

    for table_name, key_name in tables:
        print(f"\n  Clearing {table_name}...")
        count = clear_dynamodb_table(table_name, key_name, dry_run)
        print(f"    {count} items to delete")
        total_deleted += count

    print(f"\nTotal DynamoDB items to delete: {total_deleted}")


def clear_s3_bucket(dry_run: bool = True):
    """Clear all objects from S3 documents bucket"""
    print("\n" + "="*80)
    print("STEP 3: Clearing S3 Documents Bucket")
    print("="*80)

    deleted_count = 0

    try:
        paginator = s3.get_paginator('list_objects_v2')

        for page in paginator.paginate(Bucket=DOCS_BUCKET):
            if 'Contents' not in page:
                print("  Bucket is already empty")
                return 0

            for obj in page['Contents']:
                key = obj['Key']

                # Skip deployment artifacts
                if key.startswith('deployments/'):
                    print(f"  ✓ KEEPING: {key} (deployment artifact)")
                    continue

                print(f"  ✗ DELETING: {key}")
                if not dry_run:
                    try:
                        s3.delete_object(Bucket=DOCS_BUCKET, Key=key)
                    except Exception as e:
                        print(f"    ERROR: {e}")

                deleted_count += 1

    except Exception as e:
        print(f"  ERROR: {e}")

    print(f"\nTotal S3 objects to delete: {deleted_count}")
    return deleted_count


def main():
    """Main cleanup function"""
    import argparse

    parser = argparse.ArgumentParser(description='Cleanup all user data except admin users')
    parser.add_argument('--confirm', action='store_true', help='Skip confirmation and execute deletion')
    parser.add_argument('--dry-run', action='store_true', help='Only show what would be deleted')
    args = parser.parse_args()

    print("="*80)
    print("USER DATA CLEANUP SCRIPT")
    print("="*80)
    print("\nThis script will DELETE all user data except admin users:")
    for email in KEEP_USERS:
        print(f"  - {email}")

    print("\n⚠️  WARNING: This operation is DESTRUCTIVE and CANNOT be undone!")

    # DRY RUN
    print("\n" + "="*80)
    print("DRY RUN - Previewing changes")
    print("="*80)

    cognito_count = delete_cognito_users(dry_run=True)
    clear_all_dynamodb_tables(dry_run=True)
    s3_count = clear_s3_bucket(dry_run=True)

    # Summary
    print("\n" + "="*80)
    print("DRY RUN COMPLETE")
    print("="*80)
    print(f"\nSummary of changes:")
    print(f"  - Cognito users to delete: {cognito_count}")
    print(f"  - S3 objects to delete: {s3_count}")
    print(f"  - DynamoDB items will be cleared from all tables")

    if args.dry_run:
        print("\n--dry-run flag set. Exiting without making changes.")
        sys.exit(0)

    # Confirm
    if not args.confirm:
        print("\n⚠️  Are you ABSOLUTELY SURE you want to proceed?")
        try:
            response = input("Type 'DELETE ALL DATA' to confirm: ")
            if response != "DELETE ALL DATA":
                print("\nOperation cancelled. No data was deleted.")
                sys.exit(0)
        except EOFError:
            print("\n\nNo input received. Use --confirm flag to skip confirmation.")
            sys.exit(1)

    # ACTUAL DELETION
    print("\n" + "="*80)
    print("EXECUTING ACTUAL DELETION")
    print("="*80)

    delete_cognito_users(dry_run=False)
    clear_all_dynamodb_tables(dry_run=False)
    clear_s3_bucket(dry_run=False)

    print("\n" + "="*80)
    print("CLEANUP COMPLETE")
    print("="*80)
    print("\nAll user data has been deleted except admin users.")
    print("The application is now in a clean state for production delivery.")


if __name__ == '__main__':
    main()
