#!/bin/bash
# Upload Sample Documents to S3 for Parenting Autism Demo
# These documents will be automatically ingested into Bedrock Knowledge Base

set -e

# Configuration
BUCKET_NAME="llmopsquickstartstack-docsbucket9b584aa4-s99bdxcjyz48"
USER_ID="testuser@example.com"
SAMPLE_DOCS_DIR="sample-docs"

echo "================================================"
echo "Uploading Sample Documents to S3"
echo "================================================"
echo "Bucket: $BUCKET_NAME"
echo "User: $USER_ID"
echo ""

# Upload IEP document
echo "📄 Uploading IEP sample..."
aws s3 cp "$SAMPLE_DOCS_DIR/iep-sample.txt" \
  "s3://$BUCKET_NAME/users/$USER_ID/iep/iep-sample.txt" \
  --content-type "text/plain"
echo "✅ IEP uploaded"
echo ""

# Upload ABA Report
echo "📄 Uploading ABA Report sample..."
aws s3 cp "$SAMPLE_DOCS_DIR/aba-report-sample.txt" \
  "s3://$BUCKET_NAME/users/$USER_ID/aba_report/aba-report-sample.txt" \
  --content-type "text/plain"
echo "✅ ABA Report uploaded"
echo ""

# Upload Medical Record
echo "📄 Uploading Medical Record sample..."
aws s3 cp "$SAMPLE_DOCS_DIR/medical-record-sample.txt" \
  "s3://$BUCKET_NAME/users/$USER_ID/medical_record/medical-record-sample.txt" \
  --content-type "text/plain"
echo "✅ Medical Record uploaded"
echo ""

echo "================================================"
echo "All sample documents uploaded successfully!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Check S3 bucket to verify files"
echo "2. Monitor CloudWatch logs for Ingest Lambda"
echo "3. Wait for Bedrock Knowledge Base sync (~2-5 minutes)"
echo "4. Test query: 'What accommodations are in Alex's IEP?'"
echo ""
echo "To verify uploads:"
echo "  aws s3 ls s3://$BUCKET_NAME/users/$USER_ID/ --recursive"
