#!/bin/bash

# LLM Ops QuickStart - Client Deployment Script
# This script automates the deployment process for client environments

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
CLIENT_NAME=""
AWS_REGION="us-east-1"
ENVIRONMENT="production"
DRY_RUN=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to display help
show_help() {
    cat << EOF
LLM Ops QuickStart - Client Deployment Script

Usage: ./deploy-client.sh [OPTIONS]

OPTIONS:
    -c, --client-name NAME     Client name (required)
    -r, --region REGION        AWS region (default: us-east-1)
    -e, --environment ENV      Environment (default: production)
    -d, --dry-run             Validate configuration without deploying
    -h, --help                Show this help message

Examples:
    ./deploy-client.sh -c "acme-corp"
    ./deploy-client.sh -c "tech-startup" -r "us-west-2" -e "staging"
    ./deploy-client.sh -c "enterprise-client" --dry-run

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--client-name)
            CLIENT_NAME="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$CLIENT_NAME" ]]; then
    print_error "Client name is required. Use -c or --client-name"
    exit 1
fi

# Create sanitized client name for AWS resources
CLIENT_NAME_CLEAN=$(echo "$CLIENT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')

print_status "Starting deployment for client: $CLIENT_NAME"
print_status "Configuration:"
echo "  - Client Name: $CLIENT_NAME"
echo "  - Sanitized Name: $CLIENT_NAME_CLEAN"
echo "  - AWS Region: $AWS_REGION"
echo "  - Environment: $ENVIRONMENT"
echo "  - Dry Run: $DRY_RUN"

# Pre-deployment checks
print_status "Running pre-deployment checks..."

# Check if AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured or invalid. Please run 'aws configure'"
    exit 1
fi

# Check if CDK is installed
if ! command -v npx &> /dev/null; then
    print_error "Node.js/npm is not installed. Please install Node.js first."
    exit 1
fi

# Check current directory structure
if [[ ! -f "infra/package.json" ]]; then
    print_error "This script must be run from the LLM-Ops-Quickstart root directory"
    exit 1
fi

print_success "Pre-deployment checks passed"

# Check Bedrock model access
print_status "Checking Bedrock model access..."
BEDROCK_MODELS=$(aws bedrock list-foundation-models --region "$AWS_REGION" 2>/dev/null | jq -r '.modelSummaries[].modelId' | head -5)
if [[ -z "$BEDROCK_MODELS" ]]; then
    print_warning "Unable to list Bedrock models. Ensure Bedrock is enabled in region $AWS_REGION"
else
    print_success "Bedrock access verified. Available models found."
fi

# Create client-specific branch
print_status "Creating client-specific Git branch..."
BRANCH_NAME="client-$CLIENT_NAME_CLEAN"

if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    print_warning "Branch $BRANCH_NAME already exists. Switching to it."
    git checkout "$BRANCH_NAME"
else
    git checkout -b "$BRANCH_NAME"
    print_success "Created new branch: $BRANCH_NAME"
fi

# Create deployment outputs directory
OUTPUTS_DIR="client-deployments/$CLIENT_NAME_CLEAN"
mkdir -p "$OUTPUTS_DIR"

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "DRY RUN MODE - No actual deployment will occur"
    
    # Validate CDK synthesis
    print_status "Validating CDK synthesis..."
    cd infra
    npm install
    npx cdk synth > "../$OUTPUTS_DIR/cloudformation-template.yaml"
    
    print_success "CDK synthesis successful. Template saved to $OUTPUTS_DIR/cloudformation-template.yaml"
    print_status "Dry run completed. No resources were deployed."
    exit 0
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
cd infra
npm install

# Deploy infrastructure
print_status "Deploying AWS infrastructure..."
print_warning "This may take 10-15 minutes..."

DEPLOYMENT_LOG="../$OUTPUTS_DIR/deployment-$(date +%Y%m%d-%H%M%S).log"

# Capture deployment outputs
npx cdk deploy \
    --outputs-file "../$OUTPUTS_DIR/cdk-outputs.json" \
    --require-approval never \
    2>&1 | tee "$DEPLOYMENT_LOG"

if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
    print_error "CDK deployment failed. Check the log file: $DEPLOYMENT_LOG"
    exit 1
fi

print_success "Infrastructure deployment completed!"

# Extract important values from CDK outputs
if [[ -f "../$OUTPUTS_DIR/cdk-outputs.json" ]]; then
    API_URL=$(jq -r '.LlmOpsQuickStartStack.APIGatewayUrl // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    BUCKET_NAME=$(jq -r '.LlmOpsQuickStartStack.DocsBucketName // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    LOGGING_TABLE=$(jq -r '.LlmOpsQuickStartStack.LoggingTableName // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    QUICKSIGHT_ROLE=$(jq -r '.LlmOpsQuickStartStack.QuickSightServiceRoleArn // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    USER_POOL_ID=$(jq -r '.LlmOpsQuickStartStack.UserPoolId // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    USER_POOL_CLIENT_ID=$(jq -r '.LlmOpsQuickStartStack.UserPoolClientId // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    USER_POOL_CLIENT_SECRET=$(jq -r '.LlmOpsQuickStartStack.UserPoolClientSecret // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    GUARDRAIL_ID=$(jq -r '.LlmOpsQuickStartStack.GuardrailId // empty' "../$OUTPUTS_DIR/cdk-outputs.json")
    
    print_status "Deployment outputs:"
    echo "  - API Gateway URL: $API_URL"
    echo "  - S3 Bucket: $BUCKET_NAME"
    echo "  - DynamoDB Table: $LOGGING_TABLE"
    echo "  - QuickSight Role: $QUICKSIGHT_ROLE"
    echo "  - Cognito User Pool ID: $USER_POOL_ID"
    echo "  - Cognito Client ID: $USER_POOL_CLIENT_ID"
    echo "  - Guardrail ID: $GUARDRAIL_ID"
fi

# Generate client handoff documentation
print_status "Generating client documentation..."

cat > "../$OUTPUTS_DIR/client-handoff-summary.md" << EOF
# $CLIENT_NAME - LLM Ops Deployment Summary

## Deployment Information
- **Client Name**: $CLIENT_NAME
- **Deployment Date**: $(date)
- **AWS Region**: $AWS_REGION
- **Environment**: $ENVIRONMENT

## Resources Created
- **API Gateway URL**: $API_URL
- **S3 Document Bucket**: $BUCKET_NAME
- **DynamoDB Logging Table**: $LOGGING_TABLE
- **QuickSight Service Role**: $QUICKSIGHT_ROLE
- **Cognito User Pool ID**: $USER_POOL_ID
- **Cognito Client ID**: $USER_POOL_CLIENT_ID
- **Guardrail ID**: $GUARDRAIL_ID

## Authentication Setup

### 1. Get Access Token
\`\`\`bash
# Get access token using client credentials
curl -X POST https://cognito-idp.$AWS_REGION.amazonaws.com/ \\
  -H "Content-Type: application/x-amz-json-1.1" \\
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \\
  -d '{
    "AuthFlow": "USER_PASSWORD_AUTH",
    "ClientId": "$USER_POOL_CLIENT_ID",
    "AuthParameters": {
      "USERNAME": "your-username",
      "PASSWORD": "your-password"
    }
  }'
\`\`\`

### 2. Test API with Authentication
\`\`\`bash
curl -X POST $API_URL/docs \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -d '{"question": "Hello, this is a test query"}'
\`\`\`

## Next Steps
1. Create Cognito users for client team members
2. Upload initial documents to S3 bucket: $BUCKET_NAME
3. Configure QuickSight dashboard using role: $QUICKSIGHT_ROLE
4. Set up monitoring alerts
5. Train client team on API usage with authentication

## Support Information
- **Deployment Log**: deployment-$(date +%Y%m%d-%H%M%S).log
- **CDK Outputs**: cdk-outputs.json
- **CloudFormation Template**: cloudformation-template.yaml

For detailed setup instructions, see:
- [QuickSight Setup Guide](../../docs/quicksight-setup.md)
- [Client Deployment Guide](../../docs/client-deployment-guide.md)
- [Cognito Authentication Guide](../../docs/cognito-setup.md)
EOF

# Test the API endpoint (will fail without auth, which is expected)
if [[ -n "$API_URL" ]]; then
    print_status "Testing API endpoint (should return 401 without authentication)..."
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$API_URL/docs" \
        -H "Content-Type: application/json" \
        -d '{"question": "Hello, this is a test query"}' \
        --max-time 30)
    
    if [[ "$HTTP_STATUS" == "401" ]]; then
        print_success "API endpoint correctly requires authentication (401 Unauthorized)!"
    elif [[ "$HTTP_STATUS" == "200" ]]; then
        print_warning "API endpoint returned 200 - authentication may not be properly configured."
    else
        print_warning "API endpoint test returned HTTP $HTTP_STATUS. This may be normal for a new deployment."
    fi
fi

# Create basic monitoring script
cat > "../$OUTPUTS_DIR/monitor-deployment.sh" << 'EOF'
#!/bin/bash

# Basic monitoring script for the deployment
echo "=== LLM Ops Deployment Health Check ==="
echo "Date: $(date)"
echo ""

# Check API Gateway health (should return 401 without auth)
if [[ -n "$API_URL" ]]; then
    echo "Testing API Gateway authentication..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/docs" -H "Content-Type: application/json" -d '{"question": "test"}')
    if [[ "$HTTP_STATUS" == "401" ]]; then
        echo "✅ API Gateway: HEALTHY (Authentication required)"
    else
        echo "⚠️  API Gateway: HTTP $HTTP_STATUS (Expected 401)"
    fi
fi

# Check DynamoDB table
if [[ -n "$LOGGING_TABLE" ]]; then
    echo "Checking DynamoDB table..."
    aws dynamodb describe-table --table-name "$LOGGING_TABLE" > /dev/null 2>&1 && echo "✅ DynamoDB: HEALTHY" || echo "❌ DynamoDB: UNHEALTHY"
fi

# Check S3 bucket
if [[ -n "$BUCKET_NAME" ]]; then
    echo "Checking S3 bucket..."
    aws s3 ls "s3://$BUCKET_NAME" > /dev/null 2>&1 && echo "✅ S3 Bucket: HEALTHY" || echo "❌ S3 Bucket: UNHEALTHY"
fi

# Check Cognito User Pool
if [[ -n "$USER_POOL_ID" ]]; then
    echo "Checking Cognito User Pool..."
    aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" > /dev/null 2>&1 && echo "✅ Cognito User Pool: HEALTHY" || echo "❌ Cognito User Pool: UNHEALTHY"
fi

echo ""
echo "For detailed logs, check CloudWatch: https://console.aws.amazon.com/cloudwatch/"
echo "For Cognito management, visit: https://console.aws.amazon.com/cognito/"
EOF

chmod +x "../$OUTPUTS_DIR/monitor-deployment.sh"

# Final success message
print_success "Deployment completed successfully!"
print_status "Client handoff documentation created in: $OUTPUTS_DIR/"
print_status "Files generated:"
echo "  - client-handoff-summary.md"
echo "  - cdk-outputs.json"
echo "  - deployment-$(date +%Y%m%d-%H%M%S).log"
echo "  - monitor-deployment.sh"

print_status "Next steps:"
echo "1. Review the client handoff documentation"
echo "2. Create Cognito users for client team members"
echo "3. Set up QuickSight dashboard (see docs/quicksight-setup.md)"
echo "4. Upload client documents to S3 bucket: $BUCKET_NAME"
echo "5. Schedule client training session on API usage with authentication"
echo "6. Configure monitoring and alerting"

cd ..
print_success "Ready for client handoff! 🚀" 