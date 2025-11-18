"""
Generate Title Lambda
Uses Claude Haiku to generate concise, descriptive titles for chat sessions
"""
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')


def lambda_handler(event, context):
    """
    Generate a concise title for a chat message using Claude Haiku

    POST /generate-title
    Body: {
        "message": "User's question or message",
        "max_length": 50  (optional, defaults to 50)
    }

    Returns: {
        "title": "Generated concise title"
    }
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        body = json.loads(event.get('body', '{}'))
        message = body.get('message', '')
        max_length = body.get('max_length', 50)

        if not message:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Message is required'})
            }

        # Use Claude Haiku to generate a concise title
        prompt = f"""Generate a very concise, descriptive title (max {max_length} characters) for this user question.
The title should capture the main topic/intent. Do not include quotes or punctuation at the end.
Just return the title text, nothing else.

User question: {message}

Title:"""

        # Call Bedrock with Claude Haiku
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 100,
            "temperature": 0.3,  # Lower temperature for more consistent titles
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        response = bedrock_runtime.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            body=json.dumps(request_body)
        )

        response_body = json.loads(response['body'].read())
        generated_title = response_body['content'][0]['text'].strip()

        # Ensure title doesn't exceed max length
        if len(generated_title) > max_length:
            generated_title = generated_title[:max_length].rsplit(' ', 1)[0]  # Cut at last word

        logger.info(f"Generated title: {generated_title}")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'title': generated_title
            })
        }

    except Exception as e:
        logger.error(f"Error generating title: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Failed to generate title'})
        }
