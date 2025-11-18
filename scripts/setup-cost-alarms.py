"""
Setup CloudWatch Alarms for Cost Monitoring
Helps stay under $200/month budget by monitoring key cost drivers
"""
import boto3
import json
from datetime import datetime

cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
sns = boto3.client('sns', region_name='us-east-1')

# Budget configuration
MONTHLY_BUDGET = 200  # USD
ALERT_THRESHOLDS = {
    'warning': 0.80,  # 80% of budget
    'critical': 0.90,  # 90% of budget
}

# Email for notifications (update this)
ALERT_EMAIL = "gblack686@gmail.com"

def create_sns_topic():
    """Create SNS topic for cost alerts"""
    topic_name = 'LlmOpsQuickStart-CostAlerts'

    try:
        response = sns.create_topic(Name=topic_name)
        topic_arn = response['TopicArn']
        print(f"✓ Created SNS topic: {topic_arn}")

        # Subscribe email to topic
        sns.subscribe(
            TopicArn=topic_arn,
            Protocol='email',
            Endpoint=ALERT_EMAIL
        )
        print(f"✓ Subscribed {ALERT_EMAIL} to topic (check email for confirmation)")

        return topic_arn
    except sns.exceptions.TopicAlreadyExistsException:
        # Get existing topic ARN
        response = sns.list_topics()
        for topic in response['Topics']:
            if topic_name in topic['TopicArn']:
                print(f"✓ Using existing SNS topic: {topic['TopicArn']}")
                return topic['TopicArn']

def create_bedrock_invocation_alarm(topic_arn):
    """Monitor Bedrock API invocations (primary cost driver)"""
    alarm_name = 'LlmOpsQuickStart-BedrockHighUsage'

    # Estimate: ~$0.003 per invocation for Claude Sonnet 4
    # 200 invocations = ~$0.60
    # Alert at 10,000 invocations/day = ~$30/day = ~$900/month
    # So we'll alert at 1,000 invocations/day to stay under budget

    cloudwatch.put_metric_alarm(
        AlarmName=alarm_name,
        AlarmDescription='Alert when Bedrock invocations exceed daily threshold',
        ActionsEnabled=True,
        AlarmActions=[topic_arn],
        MetricName='Invocations',
        Namespace='AWS/Bedrock',
        Statistic='Sum',
        Period=86400,  # 24 hours
        EvaluationPeriods=1,
        Threshold=1000,  # 1000 invocations per day
        ComparisonOperator='GreaterThanThreshold',
        TreatMissingData='notBreaching'
    )
    print(f"✓ Created alarm: {alarm_name} (threshold: 1000 invocations/day)")

def create_lambda_invocation_alarm(topic_arn):
    """Monitor Lambda invocations across all functions"""
    alarm_name = 'LlmOpsQuickStart-LambdaHighInvocations'

    # Lambda is cheap ($0.20 per 1M requests + compute time)
    # Alert at 100k invocations/day

    cloudwatch.put_metric_alarm(
        AlarmName=alarm_name,
        AlarmDescription='Alert when Lambda invocations are unusually high',
        ActionsEnabled=True,
        AlarmActions=[topic_arn],
        MetricName='Invocations',
        Namespace='AWS/Lambda',
        Statistic='Sum',
        Period=86400,  # 24 hours
        EvaluationPeriods=1,
        Threshold=100000,  # 100k invocations per day
        ComparisonOperator='GreaterThanThreshold',
        TreatMissingData='notBreaching'
    )
    print(f"✓ Created alarm: {alarm_name} (threshold: 100k invocations/day)")

def create_lambda_duration_alarm(topic_arn):
    """Monitor Lambda duration to catch runaway functions"""
    alarm_name = 'LlmOpsQuickStart-LambdaHighDuration'

    # High duration = high compute costs
    # Alert if average duration exceeds 10 seconds

    cloudwatch.put_metric_alarm(
        AlarmName=alarm_name,
        AlarmDescription='Alert when Lambda functions have high average duration',
        ActionsEnabled=True,
        AlarmActions=[topic_arn],
        MetricName='Duration',
        Namespace='AWS/Lambda',
        Statistic='Average',
        Period=3600,  # 1 hour
        EvaluationPeriods=2,
        Threshold=10000,  # 10 seconds (in milliseconds)
        ComparisonOperator='GreaterThanThreshold',
        TreatMissingData='notBreaching'
    )
    print(f"✓ Created alarm: {alarm_name} (threshold: 10s average duration)")

def create_knowledge_base_query_alarm(topic_arn):
    """Monitor Knowledge Base queries (RAG operations)"""
    alarm_name = 'LlmOpsQuickStart-KnowledgeBaseHighQueries'

    # RAG queries are expensive (retrieval + generation)
    # Alert at 500 queries/day

    try:
        cloudwatch.put_metric_alarm(
            AlarmName=alarm_name,
            AlarmDescription='Alert when Knowledge Base queries exceed threshold',
            ActionsEnabled=True,
            AlarmActions=[topic_arn],
            MetricName='Retrieve',
            Namespace='AWS/Bedrock',
            Dimensions=[
                {'Name': 'KnowledgeBaseId', 'Value': 'EPALGDHWAD'}
            ],
            Statistic='Sum',
            Period=86400,  # 24 hours
            EvaluationPeriods=1,
            Threshold=500,  # 500 queries per day
            ComparisonOperator='GreaterThanThreshold',
            TreatMissingData='notBreaching'
        )
        print(f"✓ Created alarm: {alarm_name} (threshold: 500 queries/day)")
    except Exception as e:
        print(f"⚠ Could not create Knowledge Base alarm: {str(e)}")

def create_s3_request_alarm(topic_arn):
    """Monitor S3 requests (usually negligible cost but good to track)"""
    alarm_name = 'LlmOpsQuickStart-S3HighRequests'

    cloudwatch.put_metric_alarm(
        AlarmName=alarm_name,
        AlarmDescription='Alert when S3 requests are unusually high',
        ActionsEnabled=True,
        AlarmActions=[topic_arn],
        MetricName='AllRequests',
        Namespace='AWS/S3',
        Statistic='Sum',
        Period=86400,  # 24 hours
        EvaluationPeriods=1,
        Threshold=1000000,  # 1M requests per day
        ComparisonOperator='GreaterThanThreshold',
        TreatMissingData='notBreaching'
    )
    print(f"✓ Created alarm: {alarm_name} (threshold: 1M requests/day)")

def create_dynamodb_capacity_alarm(topic_arn):
    """Monitor DynamoDB consumed read/write capacity"""
    alarm_name = 'LlmOpsQuickStart-DynamoDBHighCapacity'

    cloudwatch.put_metric_alarm(
        AlarmName=alarm_name,
        AlarmDescription='Alert when DynamoDB capacity consumption is high',
        ActionsEnabled=True,
        AlarmActions=[topic_arn],
        MetricName='ConsumedReadCapacityUnits',
        Namespace='AWS/DynamoDB',
        Statistic='Sum',
        Period=3600,  # 1 hour
        EvaluationPeriods=2,
        Threshold=100000,  # 100k read units per hour
        ComparisonOperator='GreaterThanThreshold',
        TreatMissingData='notBreaching'
    )
    print(f"✓ Created alarm: {alarm_name} (threshold: 100k read units/hour)")

def main():
    """Setup all cost monitoring alarms"""
    print("="*60)
    print("Setting up AWS Cost Monitoring Alarms")
    print(f"Monthly Budget: ${MONTHLY_BUDGET}")
    print(f"Alert Email: {ALERT_EMAIL}")
    print("="*60)
    print()

    # Create SNS topic for notifications
    topic_arn = create_sns_topic()
    print()

    # Create alarms for major cost drivers
    print("Creating CloudWatch Alarms...")
    create_bedrock_invocation_alarm(topic_arn)
    create_lambda_invocation_alarm(topic_arn)
    create_lambda_duration_alarm(topic_arn)
    create_knowledge_base_query_alarm(topic_arn)
    create_s3_request_alarm(topic_arn)
    create_dynamodb_capacity_alarm(topic_arn)

    print()
    print("="*60)
    print("✓ Cost monitoring setup complete!")
    print()
    print("IMPORTANT NEXT STEPS:")
    print("1. Check your email and confirm SNS subscription")
    print("2. Enable AWS Budgets for hard cost tracking:")
    print("   aws budgets create-budget --account-id $(aws sts get-caller-identity --query Account --output text) ...")
    print("3. Review alarms in CloudWatch Console:")
    print("   https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:")
    print("="*60)

if __name__ == '__main__':
    main()
