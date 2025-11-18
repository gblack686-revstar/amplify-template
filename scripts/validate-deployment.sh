#!/bin/bash

################################################################################
# Deployment Validation Script - Parenting Autism GenAI POC
# Version: 1.0
# Purpose: Automated validation across all 4 levels (Infrastructure, API, Security, Performance)
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-parenting-autism}"
OUTPUTS_FILE="client-deployments/parenting-autism/cdk-outputs.json"
TEST_DOC="test-validation-doc.txt"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
    ((TESTS_TOTAL++))
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check AWS CLI
    if command -v aws &> /dev/null; then
        print_pass "AWS CLI installed"
    else
        print_fail "AWS CLI not installed"
        exit 1
    fi

    # Check jq
    if command -v jq &> /dev/null; then
        print_pass "jq installed"
    else
        print_fail "jq not installed (required for JSON parsing)"
        exit 1
    fi

    # Check CDK
    if command -v cdk &> /dev/null; then
        print_pass "AWS CDK installed"
    else
        print_fail "AWS CDK not installed"
        exit 1
    fi

    # Check AWS credentials
    if aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        print_pass "AWS credentials valid"
        ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
        print_info "Account ID: $ACCOUNT_ID"
    else
        print_fail "AWS credentials invalid or profile not found"
        exit 1
    fi

    # Check outputs file exists
    if [ -f "$OUTPUTS_FILE" ]; then
        print_pass "CDK outputs file found: $OUTPUTS_FILE"
    else
        print_fail "CDK outputs file not found: $OUTPUTS_FILE"
        print_info "Run deployment first: cdk deploy --outputs-file $OUTPUTS_FILE"
        exit 1
    fi
}

################################################################################
# Level 1: Infrastructure Validation
################################################################################

validate_infrastructure() {
    print_header "Level 1: Infrastructure Validation"

    # Test 1: CDK Synth
    print_test "CDK synth generates valid CloudFormation template"
    cd infra
    if cdk synth --profile "$AWS_PROFILE" > /dev/null 2>&1; then
        print_pass "CDK synth successful"
    else
        print_fail "CDK synth failed"
    fi
    cd ..

    # Test 2: CloudFormation Stack Status
    print_test "CloudFormation stack status is CREATE_COMPLETE or UPDATE_COMPLETE"
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name BackendStack \
        --profile "$AWS_PROFILE" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "STACK_NOT_FOUND")

    if [[ "$STACK_STATUS" == "CREATE_COMPLETE" ]] || [[ "$STACK_STATUS" == "UPDATE_COMPLETE" ]]; then
        print_pass "Stack status: $STACK_STATUS"
    else
        print_fail "Stack status: $STACK_STATUS"
    fi

    # Test 3: Verify Stack Outputs
    print_test "All required stack outputs present"
    REQUIRED_OUTPUTS=("APIGatewayUrl" "DocsBucketName" "LoggingTableName" "GuardrailId" "UserPoolId" "UserPoolClientId" "UserPoolClientSecret")
    MISSING_OUTPUTS=()

    for OUTPUT in "${REQUIRED_OUTPUTS[@]}"; do
        VALUE=$(jq -r ".BackendStack.$OUTPUT // empty" "$OUTPUTS_FILE")
        if [ -z "$VALUE" ]; then
            MISSING_OUTPUTS+=("$OUTPUT")
        fi
    done

    if [ ${#MISSING_OUTPUTS[@]} -eq 0 ]; then
        print_pass "All ${#REQUIRED_OUTPUTS[@]} stack outputs present"
    else
        print_fail "Missing outputs: ${MISSING_OUTPUTS[*]}"
    fi

    # Test 4: S3 Bucket Exists
    print_test "S3 bucket exists and is accessible"
    BUCKET_NAME=$(jq -r '.BackendStack.DocsBucketName' "$OUTPUTS_FILE")
    if aws s3 ls "s3://$BUCKET_NAME" --profile "$AWS_PROFILE" > /dev/null 2>&1; then
        print_pass "S3 bucket accessible: $BUCKET_NAME"
    else
        print_fail "S3 bucket not accessible: $BUCKET_NAME"
    fi

    # Test 5: DynamoDB Table Exists
    print_test "DynamoDB table exists and is ACTIVE"
    TABLE_NAME=$(jq -r '.BackendStack.LoggingTableName' "$OUTPUTS_FILE")
    TABLE_STATUS=$(aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --profile "$AWS_PROFILE" \
        --query 'Table.TableStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")

    if [ "$TABLE_STATUS" == "ACTIVE" ]; then
        print_pass "DynamoDB table status: ACTIVE"
    else
        print_fail "DynamoDB table status: $TABLE_STATUS"
    fi

    # Test 6: Lambda Functions Exist
    print_test "Lambda functions deployed and active"
    LAMBDA_FUNCTIONS=("query-bedrock-llm" "start-ingestion-trigger")
    for FUNC in "${LAMBDA_FUNCTIONS[@]}"; do
        FUNC_STATE=$(aws lambda get-function \
            --function-name "$FUNC" \
            --profile "$AWS_PROFILE" \
            --query 'Configuration.State' \
            --output text 2>/dev/null || echo "NOT_FOUND")

        if [ "$FUNC_STATE" == "Active" ]; then
            print_pass "Lambda function active: $FUNC"
        else
            print_fail "Lambda function not active: $FUNC (State: $FUNC_STATE)"
        fi
    done

    # Test 7: API Gateway Endpoint
    print_test "API Gateway endpoint is reachable"
    API_URL=$(jq -r '.BackendStack.APIGatewayUrl' "$OUTPUTS_FILE")
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" || echo "000")

    if [[ "$HTTP_CODE" == "403" ]] || [[ "$HTTP_CODE" == "401" ]]; then
        # 401/403 means endpoint is up but requires auth (expected)
        print_pass "API Gateway endpoint reachable (HTTP $HTTP_CODE - auth required)"
    elif [ "$HTTP_CODE" == "000" ]; then
        print_fail "API Gateway endpoint not reachable (connection failed)"
    else
        print_pass "API Gateway endpoint reachable (HTTP $HTTP_CODE)"
    fi
}

################################################################################
# Level 2: API Integration Tests
################################################################################

validate_api_integration() {
    print_header "Level 2: API Integration Tests"

    # Get credentials
    USER_POOL_ID=$(jq -r '.BackendStack.UserPoolId' "$OUTPUTS_FILE")
    CLIENT_ID=$(jq -r '.BackendStack.UserPoolClientId' "$OUTPUTS_FILE")
    CLIENT_SECRET=$(jq -r '.BackendStack.UserPoolClientSecret' "$OUTPUTS_FILE")
    REGION=$(echo "$USER_POOL_ID" | cut -d'_' -f1)
    API_URL=$(jq -r '.BackendStack.APIGatewayUrl' "$OUTPUTS_FILE")
    BUCKET_NAME=$(jq -r '.BackendStack.DocsBucketName' "$OUTPUTS_FILE")

    # Test 1: Obtain OAuth Token
    print_test "Obtain OAuth 2.0 access token from Cognito"
    AUTH_HEADER=$(echo -n "$CLIENT_ID:$CLIENT_SECRET" | base64)

    TOKEN_RESPONSE=$(curl -s -X POST "https://llmopsquickstart-user-pool.auth.${REGION}.amazoncognito.com/oauth2/token" \
        -H "Authorization: Basic $AUTH_HEADER" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=client_credentials&scope=llmopsquickstart-api/read")

    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

    if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
        print_pass "OAuth token obtained successfully"
        print_info "Token expires in: $(echo "$TOKEN_RESPONSE" | jq -r '.expires_in') seconds"
    else
        print_fail "Failed to obtain OAuth token"
        print_info "Response: $TOKEN_RESPONSE"
        return
    fi

    # Test 2: Upload Test Document
    print_test "Upload test document to S3"
    cat > "$TEST_DOC" <<EOF
Autism Spectrum Disorder (ASD) is a developmental disability caused by
differences in the brain. People with ASD often have problems with social
communication and interaction, and restricted or repetitive behaviors or interests.

Common signs of autism include:
- Difficulty with social communication
- Repetitive behaviors
- Sensory sensitivities
- Special interests or focused topics
EOF

    if aws s3 cp "$TEST_DOC" "s3://$BUCKET_NAME/" --profile "$AWS_PROFILE" > /dev/null 2>&1; then
        print_pass "Test document uploaded to S3"
    else
        print_fail "Failed to upload test document"
        return
    fi

    # Test 3: Wait for Ingestion
    print_info "Waiting for knowledge base ingestion (60 seconds)..."
    sleep 60

    # Test 4: Query API
    print_test "Query API with valid authentication"
    API_RESPONSE=$(curl -s -X POST "${API_URL}docs" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "question": "What is autism spectrum disorder?",
            "modelId": "us.anthropic.claude-3-7-sonnet-20250219-v1:0"
        }')

    RESPONSE_TEXT=$(echo "$API_RESPONSE" | jq -r '.response // empty')
    CITATION=$(echo "$API_RESPONSE" | jq -r '.citation // empty')
    SESSION_ID=$(echo "$API_RESPONSE" | jq -r '.sessionId // empty')

    if [ -n "$RESPONSE_TEXT" ] && [ "$RESPONSE_TEXT" != "null" ]; then
        print_pass "API query successful"
        print_info "Response length: ${#RESPONSE_TEXT} characters"
        if [ -n "$CITATION" ] && [ "$CITATION" != "null" ]; then
            print_info "Citation: $CITATION"
        fi
    else
        print_fail "API query failed or returned empty response"
        print_info "Response: $API_RESPONSE"
    fi

    # Test 5: Verify DynamoDB Logging
    print_test "Verify request logged in DynamoDB"
    TABLE_NAME=$(jq -r '.BackendStack.LoggingTableName' "$OUTPUTS_FILE")

    # Wait a moment for log to be written
    sleep 5

    RECENT_LOGS=$(aws dynamodb scan \
        --table-name "$TABLE_NAME" \
        --profile "$AWS_PROFILE" \
        --max-items 5 \
        --query 'Items' \
        --output json 2>/dev/null)

    LOG_COUNT=$(echo "$RECENT_LOGS" | jq 'length')

    if [ "$LOG_COUNT" -gt 0 ]; then
        print_pass "DynamoDB logging active ($LOG_COUNT recent entries)"
    else
        print_fail "No entries found in DynamoDB logging table"
    fi

    # Cleanup
    rm -f "$TEST_DOC"
}

################################################################################
# Level 3: Security Validation
################################################################################

validate_security() {
    print_header "Level 3: Security Validation"

    API_URL=$(jq -r '.BackendStack.APIGatewayUrl' "$OUTPUTS_FILE")

    # Test 1: Unauthenticated Request (Should Fail)
    print_test "Unauthenticated request returns 401"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}docs" \
        -H "Content-Type: application/json" \
        -d '{"question": "test"}')

    if [ "$HTTP_CODE" == "401" ]; then
        print_pass "Unauthenticated request rejected (HTTP 401)"
    else
        print_fail "Unauthenticated request not rejected (HTTP $HTTP_CODE, expected 401)"
    fi

    # Test 2: Invalid Token (Should Fail)
    print_test "Invalid token returns 403"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}docs" \
        -H "Authorization: Bearer INVALID_TOKEN_12345" \
        -H "Content-Type: application/json" \
        -d '{"question": "test"}')

    if [ "$HTTP_CODE" == "403" ]; then
        print_pass "Invalid token rejected (HTTP 403)"
    else
        print_fail "Invalid token not rejected (HTTP $HTTP_CODE, expected 403)"
    fi

    # Test 3: S3 Bucket Public Access Blocked
    print_test "S3 bucket blocks public access"
    BUCKET_NAME=$(jq -r '.BackendStack.DocsBucketName' "$OUTPUTS_FILE")

    PUBLIC_BLOCK=$(aws s3api get-public-access-block \
        --bucket "$BUCKET_NAME" \
        --profile "$AWS_PROFILE" \
        --query 'PublicAccessBlockConfiguration' \
        --output json 2>/dev/null)

    BLOCK_PUBLIC_ACLS=$(echo "$PUBLIC_BLOCK" | jq -r '.BlockPublicAcls')
    BLOCK_PUBLIC_POLICY=$(echo "$PUBLIC_BLOCK" | jq -r '.BlockPublicPolicy')

    if [ "$BLOCK_PUBLIC_ACLS" == "true" ] && [ "$BLOCK_PUBLIC_POLICY" == "true" ]; then
        print_pass "S3 bucket public access blocked"
    else
        print_fail "S3 bucket public access not fully blocked"
    fi

    # Test 4: DynamoDB Encryption
    print_test "DynamoDB table encrypted at rest"
    TABLE_NAME=$(jq -r '.BackendStack.LoggingTableName' "$OUTPUTS_FILE")

    ENCRYPTION_TYPE=$(aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --profile "$AWS_PROFILE" \
        --query 'Table.SSEDescription.SSEType' \
        --output text 2>/dev/null || echo "NONE")

    if [ "$ENCRYPTION_TYPE" != "NONE" ]; then
        print_pass "DynamoDB encryption enabled (Type: $ENCRYPTION_TYPE)"
    else
        print_fail "DynamoDB encryption not enabled"
    fi

    # Test 5: Lambda Function IAM Role
    print_test "Lambda functions have IAM roles configured"
    QUERY_ROLE=$(aws lambda get-function \
        --function-name "query-bedrock-llm" \
        --profile "$AWS_PROFILE" \
        --query 'Configuration.Role' \
        --output text 2>/dev/null)

    if [[ "$QUERY_ROLE" == arn:aws:iam:* ]]; then
        print_pass "Lambda IAM role configured"
    else
        print_fail "Lambda IAM role not configured"
    fi
}

################################################################################
# Level 4: Performance Testing
################################################################################

validate_performance() {
    print_header "Level 4: Performance Testing"

    # Get OAuth token
    USER_POOL_ID=$(jq -r '.BackendStack.UserPoolId' "$OUTPUTS_FILE")
    CLIENT_ID=$(jq -r '.BackendStack.UserPoolClientId' "$OUTPUTS_FILE")
    CLIENT_SECRET=$(jq -r '.BackendStack.UserPoolClientSecret' "$OUTPUTS_FILE")
    REGION=$(echo "$USER_POOL_ID" | cut -d'_' -f1)
    API_URL=$(jq -r '.BackendStack.APIGatewayUrl' "$OUTPUTS_FILE")

    AUTH_HEADER=$(echo -n "$CLIENT_ID:$CLIENT_SECRET" | base64)

    TOKEN_RESPONSE=$(curl -s -X POST "https://llmopsquickstart-user-pool.auth.${REGION}.amazoncognito.com/oauth2/token" \
        -H "Authorization: Basic $AUTH_HEADER" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=client_credentials&scope=llmopsquickstart-api/read")

    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

    if [ -z "$ACCESS_TOKEN" ]; then
        print_fail "Cannot obtain token for performance tests"
        return
    fi

    # Test 1: Response Time (10 requests)
    print_test "Measure API response time (10 requests)"

    LATENCIES=()
    for i in {1..10}; do
        START_TIME=$(date +%s%3N)

        curl -s -X POST "${API_URL}docs" \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"question": "What is autism?"}' \
            -o /dev/null

        END_TIME=$(date +%s%3N)
        LATENCY=$((END_TIME - START_TIME))
        LATENCIES+=("$LATENCY")

        echo "  Request $i: ${LATENCY}ms"
    done

    # Calculate p95 (9th value when sorted)
    IFS=$'\n' SORTED_LATENCIES=($(sort -n <<<"${LATENCIES[*]}"))
    P95_LATENCY=${SORTED_LATENCIES[8]}  # 9th element (index 8) is p95 for 10 samples

    print_info "p95 latency: ${P95_LATENCY}ms"

    if [ "$P95_LATENCY" -lt 3000 ]; then
        print_pass "p95 latency under 3 seconds (${P95_LATENCY}ms)"
    else
        print_fail "p95 latency exceeds 3 seconds (${P95_LATENCY}ms)"
    fi

    # Test 2: API Gateway Rate Limit
    print_test "API Gateway rate limiting configured"
    USAGE_PLAN_ID=$(aws apigateway get-usage-plans \
        --profile "$AWS_PROFILE" \
        --query 'items[?name==`llmopsquickstart-usage-plan`].id' \
        --output text 2>/dev/null)

    if [ -n "$USAGE_PLAN_ID" ]; then
        RATE_LIMIT=$(aws apigateway get-usage-plan \
            --usage-plan-id "$USAGE_PLAN_ID" \
            --profile "$AWS_PROFILE" \
            --query 'throttle.rateLimit' \
            --output text 2>/dev/null)

        print_pass "Rate limiting configured (Limit: $RATE_LIMIT req/sec)"
    else
        print_fail "Usage plan not found"
    fi
}

################################################################################
# Summary Report
################################################################################

print_summary() {
    print_header "Validation Summary"

    echo -e "${BLUE}Total Tests:${NC}   $TESTS_TOTAL"
    echo -e "${GREEN}Tests Passed:${NC}  $TESTS_PASSED"
    echo -e "${RED}Tests Failed:${NC}  $TESTS_FAILED"

    PASS_RATE=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    echo -e "${BLUE}Pass Rate:${NC}     ${PASS_RATE}%"

    echo ""

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  ✓ ALL VALIDATION TESTS PASSED${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        exit 0
    else
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}  ✗ SOME VALIDATION TESTS FAILED${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}Review the failures above and address issues before production deployment.${NC}"
        exit 1
    fi
}

################################################################################
# Main Execution
################################################################################

main() {
    clear
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Parenting Autism GenAI POC - Deployment Validation Script   ║${NC}"
    echo -e "${BLUE}║  Version: 1.0                                                 ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"

    check_prerequisites
    validate_infrastructure
    validate_api_integration
    validate_security
    validate_performance
    print_summary
}

# Run main function
main "$@"
