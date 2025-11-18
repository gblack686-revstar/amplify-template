#!/bin/bash

# Create test user in Cognito User Pool
# Usage: ./create-test-user.sh <user-pool-id> [email] [password]
#
# To create Jason's account:
# ./create-test-user.sh <user-pool-id> jason@parentingautism.co

USER_POOL_ID=$1
EMAIL=${2:-"jason@parentingautism.co"}
PASSWORD=${3:-"TempPass123!"}

if [ -z "$USER_POOL_ID" ]; then
  echo "Usage: $0 <user-pool-id> [email] [password]"
  echo "Example: $0 us-east-1_xxxxx"
  echo "Example: $0 us-east-1_xxxxx jason@parentingautism.co Password123!"
  exit 1
fi

echo "Creating test user in Cognito User Pool: $USER_POOL_ID"
echo "Email: $EMAIL"

# Create the user
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region us-east-1

# Set permanent password (skip temporary password flow)
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent \
  --region us-east-1

echo ""
echo "Test user created successfully!"
echo "Email: $EMAIL"
echo "Password: $PASSWORD"
echo ""
echo "You can now use these credentials to log in to the application."
