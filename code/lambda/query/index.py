"""
Enhanced Query Lambda with Profile Context
Provides personalized RAG responses based on user family profiles
"""
import json
import os
import boto3
import uuid
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')
bedrock_runtime = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')


def decimal_to_native(obj):
    """Convert DynamoDB Decimal objects to native Python types for JSON serialization"""
    if isinstance(obj, list):
        return [decimal_to_native(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: decimal_to_native(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        # Convert to int if it's a whole number, otherwise to float
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj


# Get environment variables
KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
LOGGING_TABLE_NAME = os.environ.get('LOGGING_TABLE_NAME')
GUARDRAIL_ID = os.environ.get('GUARDRAIL_ID')
USER_PROFILES_TABLE_NAME = os.environ.get('USER_PROFILES_TABLE_NAME')

# Initialize DynamoDB tables
logging_table = dynamodb.Table(LOGGING_TABLE_NAME)
user_profiles_table = dynamodb.Table(USER_PROFILES_TABLE_NAME) if USER_PROFILES_TABLE_NAME else None

# Default model ID for fallback - Claude 3.5 Haiku (fast and cost-effective)
# Using inference profile - no marketplace subscription required
DEFAULT_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"

# Model ARN for Knowledge Base RAG (uses inference profile for cross-region support)
# Claude 3.5 Haiku: $1/$5 per million tokens (much cheaper than Sonnet)
RAG_MODEL_ARN = "arn:aws:bedrock:us-east-1:909899699131:inference-profile/us.anthropic.claude-3-5-haiku-20241022-v1:0"

# CORS headers for all responses
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
}


def get_user_id_from_event(event: Dict[str, Any]) -> Optional[str]:
    """Extract userId from Cognito authorizer context"""
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub') or claims.get('cognito:username')
        return user_id
    except Exception as e:
        logger.warning(f"Could not extract userId: {str(e)}")
        return None


def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve user profile from DynamoDB"""
    if not user_profiles_table or not user_id:
        return None

    try:
        response = user_profiles_table.get_item(Key={'userId': user_id})
        if 'Item' in response:
            logger.info(f"Retrieved profile for user {user_id}")
            return response['Item'].get('profile')
        else:
            logger.info(f"No profile found for user {user_id}")
            return None
    except Exception as e:
        logger.error(f"Error retrieving profile: {str(e)}")
        return None


def build_context_from_profile(profile: Dict[str, Any]) -> str:
    """Build contextual information from user profile to inject into queries"""
    if not profile:
        return ""

    context_parts = []

    # Family context
    marital_status = profile.get('marital_status', '')
    num_family = profile.get('number_of_children', 0)
    location = profile.get('location', '')

    context_parts.append(f"The user is {marital_status} with {num_family} family member(s) living in {location}.")

    # Family member wellness information
    family_members = profile.get('family_members', [])
    for idx, member in enumerate(family_members, 1):
        age = member.get('age')
        wellness_level = member.get('wellness_level', '')
        primary_goals = member.get('primary_goals', [])
        challenges = member.get('challenges', [])

        member_info = f"Family member {idx}: {age} years old, {wellness_level} wellness level."

        # Add wellness goals
        if primary_goals:
            member_info += f" Goals: {', '.join(primary_goals)}."

        # Add current activities
        activities = member.get('current_activities', [])
        if activities:
            activity_list = [f"{a.get('type')} ({a.get('frequency')})" for a in activities]
            member_info += f" Current activities: {', '.join(activity_list)}."

        # Add challenges if available
        if challenges:
            member_info += f" Challenges: {', '.join(challenges)}."

        context_parts.append(member_info)

    # Support system
    support_types = profile.get('support_system_type', [])
    if support_types:
        context_parts.append(f"Available support: {', '.join(support_types)}.")

    return " ".join(context_parts)


def build_system_prompt(profile: Dict[str, Any]) -> str:
    """Build system prompt with embedded family profile JSON for personalization"""
    base_prompt = """You are a knowledgeable wellness assistant supporting individuals on their wellness journey.
You provide empathetic, evidence-based guidance on nutrition, fitness, stress management, sleep optimization, and healthy lifestyle habits.

CRITICAL FORMATTING RULES:
- Use clear, simple language appropriate for a 5th grade reading level
- Structure responses with clear paragraph breaks (add blank lines between paragraphs)
- Limit each paragraph to 2-3 sentences maximum
- Keep sentences short and focused (15-20 words each)
- Use double line breaks (\\n\\n) between distinct ideas or tips
- Avoid dense walls of text at all costs

When providing multiple suggestions, separate each one into its own paragraph with a blank line in between."""

    if not profile:
        return base_prompt

    # Convert Decimal objects to native Python types before JSON serialization
    profile_clean = decimal_to_native(profile)

    # Include full profile as JSON for comprehensive context
    profile_json = json.dumps(profile_clean, indent=2)

    personalized_prompt = f"""{base_prompt}

FAMILY WELLNESS CONTEXT:
{profile_json}

Use this family information to personalize your responses. Reference family member names, ages,
wellness goals, and challenges when appropriate. Tailor recommendations based on their wellness level,
current activities, health conditions, and support system. Be empathetic and supportive."""

    return personalized_prompt


def call_bedrock_directly(question: str, system_prompt: str, conversation_history: list, model_id: str = None) -> Dict[str, Any]:
    """
    Call Bedrock LLM directly without RAG (fallback when KB has no results)

    Args:
        question: User's question
        system_prompt: System prompt with family context
        conversation_history: Previous conversation turns
        model_id: Optional model ID override

    Returns:
        Response dictionary with answer and metadata
    """
    fallback_model_id = model_id if model_id else DEFAULT_MODEL_ID

    logger.info(f"Calling Bedrock directly with model {fallback_model_id} (no RAG)")

    # Build messages array including conversation history
    messages = []

    # Add previous conversation turns
    for msg in conversation_history:
        messages.append({
            "role": msg.get("role"),
            "content": msg.get("content")
        })

    # Add current question
    messages.append({
        "role": "user",
        "content": question
    })

    # Prepare the request body
    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
        "messages": messages,
        "system": system_prompt  # Include system prompt with family context
    }

    response = bedrock_runtime.invoke_model(
        modelId=fallback_model_id,
        body=json.dumps(request_body)
    )

    response_body = json.loads(response['body'].read())

    return {
        'response': response_body['content'][0]['text'],
        'citation': None,
        'sessionId': str(uuid.uuid4()),
        'fallback_used': True,
        'reason': 'no_rag_results'
    }


def parse_and_validate_request(event: Dict[str, Any]) -> tuple:
    """Parse and validate incoming request"""
    body_str = event.get('body', '{}')
    if not body_str:
        raise ValueError("Request body is empty")

    request_body = json.loads(body_str)
    question = request_body.get('question', '').strip()
    request_session_id = request_body.get('requestSessionId')
    conversation_history = request_body.get('conversation_history', [])
    model_id = request_body.get('modelId')

    # Input validation
    if not question:
        raise ValueError("Question parameter is required")

    if len(question) > 10000:
        raise ValueError("Question exceeds maximum length of 10,000 characters")

    if conversation_history and not isinstance(conversation_history, list):
        raise ValueError("conversation_history must be an array")

    if len(conversation_history) > 20:
        logger.warning(f"Conversation history truncated from {len(conversation_history)} to 20 messages")
        conversation_history = conversation_history[-20:]

    return question, request_session_id, conversation_history, model_id


def enhance_question_with_profile(question: str, user_profile: Optional[Dict[str, Any]], user_id: str) -> str:
    """Enhance question with profile context if available"""
    profile_context = build_context_from_profile(user_profile) if user_profile else ""

    if profile_context:
        enhanced_question = f"""Context about the user's situation: {profile_context}

User's question: {question}

Please provide a personalized, actionable response tailored to their specific family situation."""
        logger.info(f"Query enhanced with profile context for user {user_id}")
        return enhanced_question
    else:
        logger.info("No profile context available, using original question")
        return question


def setup_kb_query_params(enhanced_question: str, user_id: Optional[str], request_session_id: Optional[str]) -> dict:
    """Setup Knowledge Base query parameters with user filtering"""
    input_params = {
        'input': {
            'text': enhanced_question
        },
        'retrieveAndGenerateConfiguration': {
            'type': 'KNOWLEDGE_BASE',
            'knowledgeBaseConfiguration': {
                'knowledgeBaseId': KNOWLEDGE_BASE_ID,
                'modelArn': RAG_MODEL_ARN
            }
        }
    }

    # Add user_id filter for user isolation
    if user_id:
        input_params['retrieveAndGenerateConfiguration']['knowledgeBaseConfiguration']['retrievalConfiguration'] = {
            'vectorSearchConfiguration': {
                'filter': {
                    'equals': {
                        'key': 'userid',
                        'value': user_id
                    }
                }
            }
        }
        logger.info(f"KB Filter enabled: userid={user_id}")
    else:
        logger.warning("No user_id available, querying KB without filter")

    # Add sessionId if provided
    if request_session_id:
        input_params['sessionId'] = request_session_id

    return input_params


def process_kb_citations(response: dict, request_session_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Process Knowledge Base citations and build result"""
    citations = response.get('citations', [])
    logger.info(f"KB Results: {len(citations)} citations found")

    for citation in citations:
        logger.info(f"Citation - generatedResponsePart: {citation.get('generatedResponsePart')}, "
                    f"retrievedReferences: {len(citation.get('retrievedReferences', []))}")

    if not citations:
        logger.info("No citations found in KB response - falling back to direct LLM")
        return None

    # Extract citation information
    session_id = response.get('sessionId')
    location = citations[0].get('retrievedReferences', [{}])[0].get('location', {})
    source_type = location.get('type')

    citation_text = None
    if source_type == 'S3':
        citation_text = location.get('s3Location', {}).get('uri')
    elif source_type == 'WEB':
        citation_text = location.get('webLocation', {}).get('url')

    logger.info(f"KB response generated with {len(citations)} citations, source: {citation_text}")

    return {
        'response': response.get('output', {}).get('text', ''),
        'citation': citation_text,
        'sessionId': session_id,
        'rag_used': True
    }


def handle_kb_error(error: Exception, enhanced_question: str, system_prompt: str,
                    conversation_history: list, model_id: str, request_session_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Handle KB query errors and attempt fallback"""
    error_message = str(error)
    logger.error(f"RAG query failed: {error_message}", exc_info=True)

    # Check if it's a guardrail violation
    if "guardrail" in error_message.lower() or "blocked" in error_message.lower():
        return {'blocked': True}

    # Log fallback reason
    if "no documents" in error_message.lower() or "no results" in error_message.lower():
        logger.info("KB returned no results - falling back to direct LLM")
    else:
        logger.warning(f"KB query error - falling back to direct LLM: {error_message}")

    # Fall back to direct model invocation
    try:
        result = call_bedrock_directly(
            question=enhanced_question,
            system_prompt=system_prompt,
            conversation_history=conversation_history,
            model_id=model_id
        )
        result['sessionId'] = request_session_id if request_session_id else result.get('sessionId')
        result['fallback_reason'] = error_message
        return result

    except Exception as fallback_error:
        fallback_error_message = str(fallback_error)
        logger.error(f"Fallback model invocation failed: {fallback_error_message}", exc_info=True)

        # Check if it's a guardrail violation in fallback
        if "guardrail" in fallback_error_message.lower() or "blocked" in fallback_error_message.lower():
            return {'blocked': True}

        # Generic error
        return None


def lambda_handler(event, context):
    try:
        # Log incoming request (without sensitive data)
        logger.info(f"Received request: method={event.get('httpMethod')}, path={event.get('path')}")

        # Parse and validate request
        question, request_session_id, conversation_history, model_id = parse_and_validate_request(event)

        # Generate unique request ID and timestamp
        request_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        # Get user ID and profile for personalization
        user_id = get_user_id_from_event(event)
        logger.info(f"User ID: {user_id}")

        user_profile = get_user_profile(user_id) if user_id else None
        system_prompt = build_system_prompt(user_profile)

        # Enhance question with profile context
        enhanced_question = enhance_question_with_profile(question, user_profile, user_id)

        # Log the request
        log_request(request_id, question, timestamp, user_id)

        # Setup KB query parameters
        input_params = setup_kb_query_params(enhanced_question, user_id, request_session_id)

        # Perform RAG query with fallback logic
        try:
            # Call Bedrock Knowledge Base
            logger.info(f"Querying Knowledge Base with user_id filter: {user_id}")
            response = bedrock_agent_runtime.retrieve_and_generate(**input_params)

            # Process KB response and citations
            result = process_kb_citations(response, request_session_id)

            # If no citations, fall back to direct LLM
            if not result:
                result = call_bedrock_directly(
                    question=enhanced_question,
                    system_prompt=system_prompt,
                    conversation_history=conversation_history,
                    model_id=model_id
                )
                result['sessionId'] = request_session_id if request_session_id else result.get('sessionId')

        except Exception as e:
            # Handle KB errors and attempt fallback
            error_result = handle_kb_error(
                e, enhanced_question, system_prompt,
                conversation_history, model_id, request_session_id
            )

            # Check if guardrail blocked
            if error_result and error_result.get('blocked'):
                return make_response(400, "Your request was blocked by our content safety policy. Please revise your query.")

            # Check if fallback failed completely
            if not error_result:
                return make_response(500, "Unable to process your request. Please try again later.")

            result = error_result

        # Log the response
        log_response(request_id, result, timestamp)

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(result)
        }

    except ValueError as e:
        logger.error(f"Validation error: {str(e)}", exc_info=True)
        return make_response(400, f"Invalid input: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error processing request: {str(e)}", exc_info=True)
        return make_response(500, "An unexpected error occurred. Please try again later.")


def make_response(status_code, response_text, citation_text=None, response_session_id=None):
    """Create a formatted API Gateway response"""
    return {
        'statusCode': status_code,
        'body': json.dumps({
            'response': response_text,
            'citation': citation_text,
            'sessionId': response_session_id
        }),
        'headers': CORS_HEADERS
    }


def log_request(request_id, query, timestamp, user_id=None):
    """Log the incoming request to DynamoDB"""
    try:
        item = {
            'id': request_id,
            'timestamp': timestamp,
            'requestType': 'query',
            'query': query,
            'ttl': int(time.time()) + 30 * 24 * 60 * 60  # 30 days TTL
        }

        if user_id:
            item['userId'] = user_id

        logging_table.put_item(Item=item)
    except Exception as e:
        logger.error(f"Error logging request: {str(e)}")


def log_response(request_id, result, timestamp):
    """Log the response to DynamoDB"""
    try:
        logging_table.update_item(
            Key={
                'id': request_id,
                'timestamp': timestamp
            },
            UpdateExpression="set #resp = :r, #proc_time = :t",
            ExpressionAttributeNames={
                '#resp': 'response',
                '#proc_time': 'processing_time_ms'
            },
            ExpressionAttributeValues={
                ':r': json.dumps(result),
                ':t': int((datetime.now(timezone.utc) - datetime.fromisoformat(timestamp)).total_seconds() * 1000)
            }
        )
    except Exception as e:
        print(f"Error logging response: {str(e)}")
