#!/bin/bash

# Simple script to update Lambda function code without full CDK redeployment
# Useful for quick code updates during development

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to update a specific Lambda function
update_lambda_function() {
    local function_name=$1
    local code_path=$2
    
    print_status "Updating Lambda function: $function_name from path $code_path relative to project root"
    
    # Create temporary zip file
    temp_zip="/tmp/${function_name}-$(date +%s).zip"
    
    # Package the code in a subshell to isolate directory changes
    (
      cd "$code_path"
      zip -rq "$temp_zip" . -x "*.pyc" "__pycache__/*" "*.git*"
    )
    
    # Update the function code
    aws lambda update-function-code \
        --function-name "$function_name" \
        --zip-file "fileb://$temp_zip"
    
    # Clean up
    rm "$temp_zip"
    
    print_success "Updated $function_name"
}

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure'"
    exit 1
fi

print_status "Updating Lambda function code..."

# Update all Lambda functions
update_lambda_function "query-bedrock-llm" "../code/lambda/query"
update_lambda_function "start-ingestion-trigger" "../code/lambda/ingest"

# Add other Lambda functions as needed
# update_lambda_function "web-crawler" "code/lambda/crawl"
# update_lambda_function "url-manager" "code/lambda/webUrlSources"

print_success "All Lambda functions updated successfully!"
print_status "Note: This only updates code, not infrastructure changes."
print_status "For infrastructure changes, use: npx cdk deploy" 