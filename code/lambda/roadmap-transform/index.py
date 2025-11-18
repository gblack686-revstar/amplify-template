import json
import os
import logging
import boto3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')
dynamodb = boto3.resource('dynamodb')

LOGGING_TABLE_NAME = os.environ.get('LOGGING_TABLE_NAME')
logging_table = dynamodb.Table(LOGGING_TABLE_NAME) if LOGGING_TABLE_NAME else None

# CORS headers for all responses
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

# Model ID for Claude
MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"


def log_activity(user_id: str, request_type: str, metadata: Dict[str, Any] = None):
    """Log activity to logging table for admin dashboard"""
    if not logging_table:
        logger.warning("Logging table not configured, skipping activity log")
        return

    try:
        activity_id = str(uuid.uuid4())
        timestamp_iso = datetime.now(timezone.utc).isoformat()

        item = {
            'id': activity_id,  # Partition key
            'timestamp': timestamp_iso,  # Sort key (ISO format string)
            'userId': user_id,
            'requestId': activity_id,
            'requestType': request_type,
            'timestampISO': timestamp_iso
        }

        if metadata:
            item['metadata'] = metadata

        logging_table.put_item(Item=item)
        logger.info(f"Logged activity {request_type} for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to log activity: {str(e)}", exc_info=True)


def get_user_id_from_event(event: Dict[str, Any]) -> str:
    """Extract userId from Cognito authorizer context"""
    try:
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims.get('sub') or claims.get('cognito:username')
        if not user_id:
            raise ValueError("Could not extract userId from token")
        return user_id
    except (KeyError, TypeError) as e:
        logger.error(f"Error extracting userId: {str(e)}")
        raise ValueError("Invalid authorization context")


def build_unified_prompt(message, existing_recommendations=None, mode='format'):
    """
    Build a unified prompt for both formatting and generating recommendations.

    Args:
        message: The input message (AI response to format OR request to generate)
        existing_recommendations: List of existing recommendations to avoid duplicates
        mode: 'format' (from chat) or 'generate' (new recommendation)
    """
    # Analyze existing recommendations
    existing_context = ""
    category_guidance = ""

    if existing_recommendations and len(existing_recommendations) > 0:
        # Build context of existing recommendations
        existing_list = "\n".join([
            f"{idx + 1}. [{rec['category']}] {rec['title']}"
            for idx, rec in enumerate(existing_recommendations)
        ])

        existing_context = f"\n\nEXISTING RECOMMENDATIONS (DO NOT DUPLICATE):\n{existing_list}\n"

        # Analyze category distribution
        category_count = {}
        for rec in existing_recommendations:
            cat = rec.get('category', 'daily_skills')
            category_count[cat] = category_count.get(cat, 0) + 1

        all_categories = ['nutrition', 'fitness', 'mindfulness', 'sleep', 'social', 'habits']
        underrepresented = [cat for cat in all_categories if category_count.get(cat, 0) < 2]

        if underrepresented:
            category_guidance = f"\nSUGGESTED CATEGORIES (for variety): {', '.join(underrepresented)}"

    # Base system instructions (shared between both modes)
    base_instructions = """You are a wellness support specialist. Create structured, actionable recommendations."""

    if mode == 'generate':
        # GENERATE mode: Create a new recommendation from scratch
        prompt = f"""{base_instructions}

Generate 1 specific, actionable recommendation for the next 30 days based on the following request:

{message}
{existing_context}
CRITICAL ANTI-DUPLICATION REQUIREMENTS:
1. ANALYZE the existing recommendations above carefully
2. IDENTIFY which wellness areas and topics are already covered
3. AVOID any recommendation that overlaps with existing ones (even if worded differently)
4. If existing recommendation mentions "nutrition", DO NOT suggest meal planning, healthy eating, or dietary changes
5. If existing recommendation mentions "fitness", DO NOT suggest exercise routines, workouts, or physical activity
6. If existing recommendation mentions "stress management", DO NOT suggest relaxation, mindfulness, or meditation

GENERATE A TRULY DIFFERENT RECOMMENDATION:
- Choose a wellness area NOT represented in the existing list
- If all major areas covered, go deeper into a sub-topic not yet addressed
- Be creative and specific: sleep hygiene, hydration tracking, work-life balance, social connections, hobby development, time management
{category_guidance}

Return ONLY a JSON object with this structure (no brackets in title):
{{
  "title": "Concise action title (5-10 words)",
  "description": "Detailed description with specific actionable steps (2-3 sentences)",
  "category": "nutrition|fitness|mindfulness|sleep|social|habits"
}}"""
    else:
        # FORMAT mode: Format existing AI response into roadmap item
        prompt = f"""{base_instructions}

Transform the following AI response into a structured 30-day roadmap item:

{message}
{existing_context}
Create a concise, actionable roadmap item with:
1. Clear, specific title (5-10 words, no brackets)
2. Brief description (2-3 sentences) explaining what to do and why
3. Appropriate category: nutrition, fitness, mindfulness, sleep, social, habits

If existing recommendations are provided, ensure this recommendation is DIFFERENT and addresses a unique aspect.
{category_guidance}

Return ONLY a JSON object with this structure (no brackets in title):
{{
  "title": "Clear action title",
  "description": "Brief description of what to do and why it matters",
  "category": "appropriate_category"
}}"""

    return prompt


def lambda_handler(event, context):
    """
    Transform a message into a structured roadmap item OR generate new recommendation.

    Modes:
    - 'format': Transform existing AI message into roadmap item (from chat)
    - 'generate': Generate brand new recommendation with anti-duplication logic
    """
    logger.info(f"Received event: {json.dumps(event)}")

    # Handle OPTIONS request for CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': ''
        }

    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        message = body.get('message', '')
        existing_recommendations = body.get('existingRecommendations', [])
        mode = body.get('mode', 'format')  # 'format' or 'generate'
        source = body.get('source', 'generated')  # 'generated' or 'chat'

        if not message:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Message is required'})
            }

        # Build unified prompt
        prompt = build_unified_prompt(message, existing_recommendations, mode)

        # Call Claude via Bedrock
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 500,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.7
        }

        response = bedrock_runtime.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps(request_body)
        )

        # Parse Claude's response
        response_body = json.loads(response['body'].read())
        claude_response = response_body['content'][0]['text'].strip()

        # Extract JSON from Claude's response
        # Sometimes Claude wraps JSON in markdown code blocks
        if '```json' in claude_response:
            claude_response = claude_response.split('```json')[1].split('```')[0].strip()
        elif '```' in claude_response:
            claude_response = claude_response.split('```')[1].split('```')[0].strip()

        # Parse the roadmap item
        roadmap_item = json.loads(claude_response)

        # Validate required fields
        required_fields = ['title', 'description', 'category']
        for field in required_fields:
            if field not in roadmap_item:
                raise ValueError(f"Missing required field: {field}")

        # Add default values
        roadmap_item['status'] = 'not_started'

        # Set due date to 30 days from now
        due_date = datetime.now() + timedelta(days=30)
        roadmap_item['dueDate'] = due_date.isoformat()

        roadmap_item['notes'] = []

        logger.info(f"Generated roadmap item: {json.dumps(roadmap_item)}")

        # Log activity for admin dashboard
        try:
            user_id = get_user_id_from_event(event)
            # Use different activity type based on source
            if source == 'chat':
                activity_type = 'roadmap_item_added_from_chat'
            else:
                activity_type = 'recommendation_generated'

            log_activity(
                user_id=user_id,
                request_type=activity_type,
                metadata={
                    'title': roadmap_item['title'],
                    'category': roadmap_item['category'],
                    'mode': mode,
                    'source': source,
                    'dueDate': roadmap_item.get('dueDate')
                }
            )
        except Exception as e:
            logger.error(f"Failed to log recommendation activity: {str(e)}")
            # Don't fail the request if logging fails

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'roadmapItem': roadmap_item
            })
        }

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Invalid JSON in request body or Claude response'})
        }
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
    except Exception as e:
        logger.error(f"Error transforming message: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Failed to transform message into roadmap item'})
        }
