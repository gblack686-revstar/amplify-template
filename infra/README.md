# LLM Ops QuickStart - Infrastructure

This CDK project sets up a complete serverless LLM infrastructure using Amazon Bedrock for RAG-powered LLM API access. The infrastructure includes:

- Bedrock Knowledge Base with vector embeddings
- S3 bucket for document storage
- DynamoDB for request/response logging
- API Gateway for secure access
- WAF configuration for protection
- CloudWatch logging and monitoring

## Prerequisites

- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) installed
- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- Python 3.10 or higher installed

## Lambda Function Implementation

The infrastructure is set up to use Python Lambda functions. The function code should be placed in the following directories:

- `lambda/query/` - Main query function for retrieval and generation
- `lambda/dataSource/` - Web crawler data source creation
- `lambda/ingest/` - S3 document ingestion
- `lambda/crawl/` - Web crawler ingestion
- `lambda/webUrlSources/` - Update web crawler URLs
- `lambda/getUrls/` - Get web crawler URLs

Each Lambda function should have an `index.py` file with a `lambda_handler` function.

### Dependencies

All Lambda functions share the same dependencies defined in `lambda/dependencies/requirements.txt`. The CDK deployment process will automatically:

1. Copy this requirements.txt file to each Lambda's deployment package
2. Install the dependencies in the package
3. Deploy the Lambda with all necessary dependencies

If you need to add a new dependency, just update the shared requirements.txt file.

## Deployment

1. Install dependencies:
   ```
   npm install
   ```

2. Configure allowed IP address for WAF:
   ```
   npx cdk deploy --context allowedip=YOUR_IP_ADDRESS_HERE/32
   ```
   
   Note: Replace `YOUR_IP_ADDRESS_HERE` with your IP address. You can use `0.0.0.0/0` to allow all IPs (not recommended for production).

3. The deployment will create:
   - API Gateway endpoint
   - S3 bucket for document storage
   - DynamoDB table for logging
   - All necessary Lambda functions

## Usage

After deployment, you can:

1. Upload documents to the S3 bucket to be processed and indexed
2. Configure web crawler data sources through the API
3. Query the knowledge base with natural language questions

## API Endpoints

- `POST /docs` - Query the knowledge base and generate answers
- `POST /web-urls` - Update web crawler URLs
- `GET /urls` - Get list of web crawler URLs

## Configuration

The CDK stack can be customized by modifying:
- Lambda timeout values
- Bedrock model selections
- WAF rules and IP allowlisting
- CloudWatch logging and retention policies

## Cleanup

To delete all resources:
```
npx cdk destroy
```

Note: This will remove all resources including the S3 bucket and any stored documents.
