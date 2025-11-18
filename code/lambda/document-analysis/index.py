"""
Document Analysis Lambda
Uses Claude AI to extract structured data from uploaded documents
"""
import json
import os
import boto3
from datetime import datetime
import logging
from typing import Dict, Any
from shared.sidecar_manager import SidecarManager

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
bedrock_runtime = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')

# Environment variables
DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
BUCKET_NAME = os.environ.get('BUCKET_NAME')
MODEL_ID = os.environ.get('MODEL_ID', 'us.anthropic.claude-haiku-4-5-20251001-v1:0')

# Initialize SidecarManager
sidecar_manager = SidecarManager(s3_client=s3_client, bucket_name=BUCKET_NAME)
metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE) if DOCUMENT_METADATA_TABLE else None


# Extraction prompts for different document types
EXTRACTION_PROMPTS = {
    'iep': """You are analyzing an Individualized Education Program (IEP) document.
Extract the following structured information in JSON format:

{
  "studentInfo": {
    "name": "...",
    "dob": "YYYY-MM-DD",
    "grade": "..."
  },
  "iepDate": "YYYY-MM-DD",
  "reviewDate": "YYYY-MM-DD",
  "annualGoals": [
    {
      "domain": "communication|academic|social|behavioral",
      "goal": "description of goal",
      "targetDate": "YYYY-MM-DD"
    }
  ],
  "accommodations": ["list", "of", "accommodations"],
  "services": [
    {
      "type": "speech|occupational|physical|social_skills",
      "frequency": "...",
      "duration": "..."
    }
  ],
  "presentLevels": {
    "communication": "...",
    "academic": "...",
    "socialEmotional": "..."
  },
  "progressMonitoring": "...",
  "teamMembers": ["list", "of", "team", "members"]
}

Return ONLY valid JSON, no additional text.""",

    'aba_report': """You are analyzing an Applied Behavior Analysis (ABA) progress report.
Extract the following structured information in JSON format:

{
  "reportPeriod": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  },
  "hoursOfService": "...",
  "skillAssessment": {
    "communication": {
      "manding": "...",
      "tacting": "...",
      "intraverbals": "..."
    },
    "socialSkills": {
      "turnTaking": "...",
      "parallelPlay": "...",
      "jointAttention": "..."
    },
    "selfHelpSkills": {
      "handwashing": "...",
      "dressing": "...",
      "toileting": "..."
    }
  },
  "behaviorData": [
    {
      "behavior": "...",
      "baseline": "...",
      "current": "...",
      "trend": "improving|stable|worsening"
    }
  ],
  "currentPrograms": [
    {
      "program": "...",
      "goal": "...",
      "progress": "...",
      "nextSteps": "..."
    }
  ],
  "recommendations": ["list", "of", "recommendations"],
  "goalsNextQuarter": ["list", "of", "goals"]
}

Return ONLY valid JSON, no additional text.""",

    'medical_record': """You are analyzing a pediatric medical/developmental evaluation record.
Extract the following structured information in JSON format:

{
  "visitDate": "YYYY-MM-DD",
  "provider": "...",
  "chiefComplaint": "...",
  "currentMedications": [
    {
      "medication": "...",
      "dosage": "...",
      "purpose": "..."
    }
  ],
  "allergies": ["list"],
  "vitalSigns": {
    "weight": "...",
    "height": "...",
    "temperature": "...",
    "bloodPressure": "...",
    "heartRate": "..."
  },
  "developmentalStatus": {
    "socialCommunication": "...",
    "behavioralPatterns": "...",
    "motorSkills": "..."
  },
  "currentServices": [
    {
      "type": "...",
      "frequency": "..."
    }
  ],
  "currentConcerns": ["list"],
  "recommendations": ["list"],
  "followUp": {
    "nextVisit": "YYYY-MM-DD",
    "actionItems": ["list"]
  },
  "assessmentTools": ["list", "of", "tools", "used"]
}

Return ONLY valid JSON, no additional text.""",

    'other': """Extract key information from this document in JSON format:

{
  "documentSummary": "brief summary",
  "keyPoints": ["list", "of", "key", "points"],
  "actionItems": ["list", "of", "action", "items"],
  "importantDates": [
    {
      "date": "YYYY-MM-DD",
      "description": "..."
    }
  ],
  "recommendations": ["list"]
}

Return ONLY valid JSON, no additional text."""
}


def extract_text_from_document(s3_bucket: str, s3_key: str) -> str:
    """
    Download and extract text from document
    For now, assumes PDF - can be enhanced with Textract for complex PDFs
    """
    try:
        # Validate inputs
        if not s3_bucket or not s3_key:
            raise ValueError("s3_bucket and s3_key are required for text extraction")

        logger.info(f"Downloading document from S3: bucket={s3_bucket}, key={s3_key}")

        # For this POC, we'll use a simple approach
        # In production, you'd use Amazon Textract for better extraction
        response = s3_client.get_object(Bucket=s3_bucket, Key=s3_key)

        # Check content length
        content_length = response.get('ContentLength', 0)
        if content_length > 10 * 1024 * 1024:  # 10MB limit
            logger.warning(f"Large file detected: {content_length} bytes, reading first 100KB only")

        logger.info(f"Document downloaded: {s3_key}, size: {content_length} bytes")

        # Read first 100KB for text-based files
        content = response['Body'].read(100000)

        if not content:
            raise ValueError("Downloaded document is empty")

        try:
            decoded_content = content.decode('utf-8')
            logger.info(f"Successfully decoded text content: {len(decoded_content)} characters")
            return decoded_content
        except UnicodeDecodeError:
            logger.warning("Binary file detected, returning placeholder")
            return "[Binary PDF file - using Textract would extract full text]"

    except s3_client.exceptions.NoSuchKey:
        logger.error(f"Document not found in S3: {s3_key}")
        raise ValueError(f"Document not found: {s3_key}")
    except s3_client.exceptions.NoSuchBucket:
        logger.error(f"S3 bucket not found: {s3_bucket}")
        raise ValueError(f"S3 bucket not found: {s3_bucket}")
    except Exception as e:
        logger.error(f"Error extracting text from document: {str(e)}", exc_info=True)
        raise


def invoke_claude_for_extraction(document_text: str, document_type: str) -> Dict[str, Any]:
    """
    Use Claude AI to extract structured data from document
    """
    # Validate inputs
    if not document_text:
        raise ValueError("document_text cannot be empty")

    if not document_type:
        logger.warning("document_type not provided, using 'other'")
        document_type = 'other'

    # Validate document_type against known types
    valid_types = ['iep', 'aba_report', 'medical_record', 'other']
    if document_type not in valid_types:
        logger.warning(f"Unknown document_type '{document_type}', using 'other'")
        document_type = 'other'

    prompt = EXTRACTION_PROMPTS.get(document_type, EXTRACTION_PROMPTS['other'])

    # Truncate document text to manageable size
    max_text_length = 15000
    truncated_text = document_text[:max_text_length]
    if len(document_text) > max_text_length:
        logger.warning(f"Document text truncated from {len(document_text)} to {max_text_length} characters")

    full_prompt = f"""{prompt}

Document text:
{truncated_text}

Extract the information and return JSON only."""

    try:
        logger.info(f"Invoking Claude for {document_type} extraction, text length: {len(truncated_text)} chars")

        # Invoke Claude using Bedrock
        response = bedrock_runtime.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4096,
                "messages": [
                    {
                        "role": "user",
                        "content": full_prompt
                    }
                ],
                "temperature": 0.2,  # Low temperature for consistent extraction
                "top_p": 0.9
            })
        )

        response_body = json.loads(response['body'].read())
        extracted_text = response_body['content'][0]['text']

        logger.info("Claude extraction complete")

        # Parse extracted JSON
        try:
            # Try to find JSON in the response
            start_idx = extracted_text.find('{')
            end_idx = extracted_text.rfind('}') + 1

            if start_idx != -1 and end_idx > start_idx:
                json_str = extracted_text[start_idx:end_idx]
                extracted_data = json.loads(json_str)
                return extracted_data
            else:
                logger.warning("No JSON found in Claude response")
                return {"raw_response": extracted_text, "error": "No JSON found"}

        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error: {str(e)}")
            return {"raw_response": extracted_text, "error": "Invalid JSON"}

    except Exception as e:
        logger.error(f"Error invoking Claude: {str(e)}", exc_info=True)
        raise


def validate_environment():
    """Validate required environment variables"""
    if not BUCKET_NAME:
        raise ValueError("BUCKET_NAME environment variable not configured")
    if not DOCUMENT_METADATA_TABLE:
        logger.warning("DOCUMENT_METADATA_TABLE not configured, metadata updates will be skipped")


def validate_input(event: dict) -> tuple:
    """Validate and parse event input"""
    s3_bucket = event.get('s3Bucket', '').strip()
    s3_key = event.get('s3Key', '').strip()
    ingestion_job_id = event.get('ingestionJobId')

    # Input validation
    if not s3_bucket:
        raise ValueError("s3Bucket parameter is required")

    if not s3_key:
        raise ValueError("s3Key parameter is required")

    # Validate s3Key format
    key_parts = s3_key.split('/')
    if len(key_parts) < 4 or key_parts[0] != 'users':
        raise ValueError(f"Invalid s3Key format. Expected: users/{{userId}}/{{documentType}}/{{filename}}, got: {s3_key}")

    # Validate file extension
    allowed_extensions = ['.pdf', '.txt', '.doc', '.docx']
    file_extension = os.path.splitext(s3_key)[1].lower()
    if file_extension and file_extension not in allowed_extensions:
        raise ValueError(f"Unsupported file type: {file_extension}. Allowed types: {', '.join(allowed_extensions)}")

    return s3_bucket, s3_key, ingestion_job_id


def get_document_type_from_key(s3_key: str) -> str:
    """Extract document type from S3 key"""
    parts = s3_key.split('/')
    return parts[2] if len(parts) >= 3 else 'other'


def update_document_metadata(s3_key: str, confidence: float, now: str):
    """Update DynamoDB document metadata"""
    if not metadata_table:
        return

    try:
        parts = s3_key.split('/')
        user_id = parts[1] if len(parts) >= 2 and parts[0] == 'users' else 'unknown'
        document_id = s3_key.split('/')[-1].split('-')[0]

        metadata_table.update_item(
            Key={'userId': user_id, 'documentId': document_id},
            UpdateExpression='SET currentStatus = :status, extractionConfidence = :conf, updatedAt = :now',
            ExpressionAttributeValues={
                ':status': 'ai_analysis_complete',
                ':conf': confidence,
                ':now': now
            }
        )
    except Exception as db_error:
        logger.warning(f"Could not update DynamoDB: {str(db_error)}")


def update_sidecar_error(s3_key: str, status: str, error_message: str):
    """Update processing sidecar with error information"""
    if not s3_key:
        return

    try:
        sidecar_manager.append_processing_status(
            s3_key,
            status=status,
            details=f'Error: {error_message}',
            error_info={'error': error_message, 'timestamp': datetime.utcnow().isoformat()}
        )
    except BaseException:
        pass


def lambda_handler(event, context):
    """
    Lambda handler for document analysis

    Expected event payload:
    {
        "s3Bucket": "bucket-name",
        "s3Key": "users/userId/type/filename.pdf",
        "ingestionJobId": "job-123"
    }
    """
    s3_key = None  # Initialize for error handling

    try:
        # Log incoming request
        logger.info("Document analysis request received")

        # Validate environment
        validate_environment()

        # Parse and validate input
        s3_bucket, s3_key, ingestion_job_id = validate_input(event)

        logger.info(f"Processing document: bucket={s3_bucket}, key={s3_key}, jobId={ingestion_job_id}")

        # Update processing sidecar - analysis started
        sidecar_manager.append_processing_status(
            s3_key,
            status='ai_analysis_started',
            details='Starting AI extraction with Claude'
        )

        # Get document type and extract text
        document_type = get_document_type_from_key(s3_key)
        logger.info(f"Analyzing {document_type} document: {s3_key}")

        document_text = extract_text_from_document(s3_bucket, s3_key)

        # Use Claude to extract structured data
        extracted_data = invoke_claude_for_extraction(document_text, document_type)

        # Calculate confidence
        confidence = 0.85 if 'error' not in extracted_data else 0.50
        now = datetime.utcnow().isoformat()

        # Create and write extracted data sidecar
        extracted_sidecar = {
            'extractionTimestamp': now,
            'extractionModel': MODEL_ID,
            'confidence': confidence,
            'documentType': document_type,
            'data': extracted_data
        }
        sidecar_manager.write_sidecar(s3_key, 'extracted', extracted_sidecar)

        # Update processing sidecar - analysis complete
        sidecar_manager.append_processing_status(
            s3_key,
            status='ai_analysis_complete',
            details=f'Extraction successful, confidence: {confidence}'
        )

        # Add audit event
        sidecar_manager.append_audit_event(
            s3_key,
            action='ai_extraction_complete',
            user_id='system',
            confidence=confidence,
            documentType=document_type
        )

        # Update DynamoDB metadata
        update_document_metadata(s3_key, confidence, now)

        logger.info(f"Document analysis complete for {s3_key}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'status': 'success',
                's3Key': s3_key,
                'documentType': document_type,
                'confidence': confidence,
                'extractionTimestamp': now
            })
        }

    except ValueError as e:
        # Validation errors - return 400
        logger.error(f"Validation error in document analysis: {str(e)}", exc_info=True)
        update_sidecar_error(s3_key, 'validation_failed', f'Validation error: {str(e)}')
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Invalid input: {str(e)}'})
        }

    except Exception as e:
        # Unexpected errors - return 500
        logger.error(f"Unexpected error in document analysis: {str(e)}", exc_info=True)
        update_sidecar_error(s3_key, 'ai_analysis_failed', str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'An unexpected error occurred during document analysis. Please try again later.'})
        }
