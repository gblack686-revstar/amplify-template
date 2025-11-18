# Upload Latency Testing - Quick Start Guide

## Overview
This guide helps you measure and optimize the upload-to-chat latency in the Parenting Autism Navigator application.

---

## Prerequisites

1. **Python 3.8+** installed
2. **AWS credentials** configured (for boto3)
3. **Auth token** from a logged-in user
4. **API Gateway URL** for your environment
5. **Test document** (PDF recommended, 2-5MB ideal)

---

## Step 1: Install Dependencies

```bash
pip install boto3 requests
```

---

## Step 2: Prepare Test File

Create or use an existing test document:
- Recommended: 2-5MB PDF
- IEP, therapy report, or medical record
- Ensure it's a real document for accurate testing

```bash
# Example: Use the test file
cp /path/to/sample-iep.pdf ./test-document.pdf
```

---

## Step 3: Get Auth Token

### Option A: From Browser DevTools
1. Log into the application
2. Open DevTools (F12)
3. Go to Application → Local Storage
4. Copy the `auth_token` value

### Option B: From curl
```bash
# Replace with your Cognito user pool details
curl -X POST https://cognito-idp.REGION.amazonaws.com/ \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -d '{
    "ClientId": "YOUR_CLIENT_ID",
    "AuthFlow": "USER_PASSWORD_AUTH",
    "AuthParameters": {
      "USERNAME": "user@example.com",
      "PASSWORD": "password"
    }
  }'
```

---

## Step 4: Run Latency Test

### Single Test Run:
```bash
python scripts/test-upload-latency.py \
  --file test-document.pdf \
  --api-url https://your-api-id.execute-api.us-east-1.amazonaws.com \
  --token "eyJraWQ..." \
  --iterations 1
```

### Multiple Test Runs (Recommended):
```bash
python scripts/test-upload-latency.py \
  --file test-document.pdf \
  --api-url https://your-api-id.execute-api.us-east-1.amazonaws.com \
  --token "eyJraWQ..." \
  --iterations 5
```

---

## Step 5: Review Results

The script will output:

### Real-Time Progress:
```
==========================================
ITERATION 1/5
==========================================

Stage 1: Getting presigned URL...
  ✓ Completed in 0.847s

Stage 2: Uploading to S3...
  ✓ Completed in 3.245s

Stage 3: Waiting for document processing...
  (Lambda + Bedrock analysis + Metadata update)
  ✓ Completed in 42.156s

Stage 4: Testing Knowledge Base query availability...
  ✓ Completed in 3.872s

==========================================
TOTAL UPLOAD-TO-CHAT LATENCY: 50.120s
==========================================
```

### Final Statistics:
```
==========================================
LATENCY TEST STATISTICS
==========================================

Total Tests: 5
Successful: 5
Success Rate: 100.0%

TOTAL UPLOAD-TO-CHAT LATENCY:
  Min:    47.234s
  Max:    58.912s
  Mean:   52.567s
  Median: 51.890s
  StdDev: 4.234s

BREAKDOWN BY STAGE:

  Presigned Url:
    Min:    0.723s
    Max:    1.245s
    Mean:   0.892s
    Median: 0.847s

  S3 Upload:
    Min:    2.987s
    Max:    4.123s
    Mean:   3.456s
    Median: 3.245s

  Document Processing:
    Min:    38.234s
    Max:    48.912s
    Mean:   42.890s
    Median: 42.156s

  Query Test:
    Min:    3.234s
    Max:    4.567s
    Mean:   3.789s
    Median: 3.872s
```

### JSON Results File:
```
Results saved to: latency-test-results-20251023-143022.json
```

---

## Step 6: Analyze Bottlenecks

### Expected Results:
- **Presigned URL:** < 2s ✅
- **S3 Upload:** 2-5s (depends on file size) ✅
- **Document Processing:** 30-60s ⚠️ **BOTTLENECK**
- **Query Test:** 2-5s ✅

### Red Flags:
- ❌ Document processing > 60s
- ❌ Success rate < 95%
- ❌ High variance (StdDev > 10s)
- ❌ Any stage timing out

---

## Step 7: Baseline Documentation

Create a baseline record:

```bash
# Save baseline results
cp latency-test-results-*.json baseline-latency-$(date +%Y%m%d).json

# Document environment
echo "Environment: Production" >> baseline-latency-$(date +%Y%m%d).txt
echo "File Size: $(ls -lh test-document.pdf | awk '{print $5}')" >> baseline-latency-$(date +%Y%m%d).txt
echo "Region: us-east-1" >> baseline-latency-$(date +%Y%m%d).txt
```

---

## Troubleshooting

### Issue: "Not authenticated" Error
**Solution:** Refresh your auth token (tokens expire after 1 hour)

### Issue: "Failed to get presigned URL"
**Solution:** Check API Gateway URL and ensure Lambda has permissions

### Issue: "Document processing timeout"
**Solution:** Increase max_wait parameter or check CloudWatch logs

### Issue: Script hangs at "Uploading to S3"
**Solution:** Check network connection and S3 bucket CORS configuration

---

## Testing Different Scenarios

### Test Small File (1MB):
```bash
python scripts/test-upload-latency.py \
  --file small-doc.pdf \
  --api-url $API_URL \
  --token $TOKEN \
  --iterations 3
```

### Test Large File (10MB):
```bash
python scripts/test-upload-latency.py \
  --file large-doc.pdf \
  --api-url $API_URL \
  --token $TOKEN \
  --iterations 3
```

### Test Maximum Size (60MB):
```bash
python scripts/test-upload-latency.py \
  --file max-size-doc.pdf \
  --api-url $API_URL \
  --token $TOKEN \
  --iterations 2
```

---

## Next Steps After Testing

### 1. Review Analysis Document
Read `upload-latency-analysis.md` for:
- Detailed bottleneck analysis
- Optimization recommendations
- Implementation guides

### 2. Prioritize Optimizations
Based on your results, choose optimizations:
- **If processing > 45s:** Implement async processing
- **If variance high:** Add Lambda warmup
- **If user feedback poor:** Add progress UI

### 3. Implement Changes
Follow the optimization guide to:
- Add status polling
- Implement async processing
- Update UI with progress stages

### 4. Re-test
After implementing optimizations, re-run tests:
```bash
python scripts/test-upload-latency.py \
  --file test-document.pdf \
  --api-url $API_URL \
  --token $TOKEN \
  --iterations 5

# Compare with baseline
diff baseline-latency-*.json latency-test-results-*.json
```

---

## Quick Reference

### Environment Variables:
```bash
export API_URL="https://your-api.execute-api.us-east-1.amazonaws.com"
export AUTH_TOKEN="eyJraWQ..."
```

### Run Test:
```bash
python scripts/test-upload-latency.py \
  --file test.pdf \
  --api-url $API_URL \
  --token $AUTH_TOKEN \
  --iterations 5
```

### View Results:
```bash
# Latest results
cat latency-test-results-*.json | jq '.statistics'

# Compare two runs
jq -s '.[0].statistics.total_time, .[1].statistics.total_time' \
  baseline-*.json latest-*.json
```

---

## Support

### Check CloudWatch Logs:
```bash
# Document upload Lambda
aws logs tail /aws/lambda/document-upload --follow

# Document analysis Lambda
aws logs tail /aws/lambda/document-analysis --follow
```

### Check DynamoDB:
```bash
# List documents
aws dynamodb scan \
  --table-name DocumentMetadata \
  --filter-expression "userId = :uid" \
  --expression-attribute-values '{":uid":{"S":"your-user-id"}}'
```

### Check S3:
```bash
# List uploaded documents
aws s3 ls s3://your-bucket-name/users/your-user-id/ --recursive
```

---

## Expected Results by Document Size

| File Size | Presigned URL | S3 Upload | Processing | Query | Total |
|-----------|---------------|-----------|------------|-------|-------|
| 1 MB      | 0.5-1s        | 1-2s      | 25-35s     | 2-4s  | 28-42s |
| 5 MB      | 0.5-1s        | 2-5s      | 35-50s     | 2-4s  | 39-60s |
| 10 MB     | 0.5-1s        | 5-10s     | 45-60s     | 2-4s  | 52-75s |
| 20 MB     | 0.5-1s        | 10-20s    | 55-70s     | 2-4s  | 67-95s |

---

## Success Criteria

✅ **Baseline established** - You have documented current performance
✅ **Bottlenecks identified** - You know which stages are slow
✅ **Optimization priorities** - You know what to fix first
✅ **Testing framework** - You can measure improvement

**Ready to optimize!** 🚀
