import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../utils/config-loader';

export interface StandardLambdaProps {
  functionName: string;
  description: string;
  handler: string;
  codePath: string;
  config: EnvironmentConfig;
  environment?: { [key: string]: string };
  timeout?: cdk.Duration;
  memorySize?: number;
  layers?: lambda.ILayerVersion[];
  enableXRayTracing?: boolean;
  additionalPolicies?: iam.PolicyStatement[];
}

/**
 * Standardized Lambda function construct with common patterns
 */
export class StandardLambdaFunction extends Construct {
  public readonly function: lambda.Function;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: StandardLambdaProps) {
    super(scope, id);

    // Create log group with retention from config
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${props.functionName}`,
      retention: this.getLogRetention(props.config.lambda.log_retention_days),
      removalPolicy: props.config.removal_policy === 'DESTROY'
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    // Standard environment variables
    const standardEnv = {
      ENVIRONMENT: props.config.environment,
      LOG_LEVEL: props.config.environment === 'prod' ? 'INFO' : 'DEBUG',
      POWERTOOLS_SERVICE_NAME: props.functionName,
      POWERTOOLS_METRICS_NAMESPACE: props.config.stack_name,
      ...props.environment,
    };

    // Create Lambda function
    this.function = new lambda.Function(this, 'Function', {
      functionName: props.functionName,
      description: props.description,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: props.handler,
      code: lambda.Code.fromAsset(props.codePath),
      timeout: props.timeout || cdk.Duration.seconds(props.config.lambda.timeout_seconds),
      memorySize: props.memorySize || props.config.lambda.memory_size_mb,
      environment: standardEnv,
      layers: props.layers,
      tracing: (props.enableXRayTracing ?? props.config.monitoring.enable_xray_tracing)
        ? lambda.Tracing.ACTIVE
        : lambda.Tracing.DISABLED,
      logGroup: this.logGroup,
    });

    // Add additional policies if provided
    if (props.additionalPolicies) {
      props.additionalPolicies.forEach((policy) => {
        this.function.addToRolePolicy(policy);
      });
    }

    // Add standard CloudWatch Logs permissions
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [this.logGroup.logGroupArn],
      })
    );

    // Tag the function
    Object.entries(props.config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this.function).add(key, value);
    });
  }

  private getLogRetention(days: number): logs.RetentionDays {
    const retentionMap: { [key: number]: logs.RetentionDays } = {
      1: logs.RetentionDays.ONE_DAY,
      3: logs.RetentionDays.THREE_DAYS,
      5: logs.RetentionDays.FIVE_DAYS,
      7: logs.RetentionDays.ONE_WEEK,
      14: logs.RetentionDays.TWO_WEEKS,
      30: logs.RetentionDays.ONE_MONTH,
      60: logs.RetentionDays.TWO_MONTHS,
      90: logs.RetentionDays.THREE_MONTHS,
      120: logs.RetentionDays.FOUR_MONTHS,
      150: logs.RetentionDays.FIVE_MONTHS,
      180: logs.RetentionDays.SIX_MONTHS,
      365: logs.RetentionDays.ONE_YEAR,
    };

    return retentionMap[days] || logs.RetentionDays.ONE_WEEK;
  }

  /**
   * Grant the Lambda function read access to a DynamoDB table
   */
  public grantDynamoDBRead(table: any): void {
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:BatchGetItem',
        ],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      })
    );
  }

  /**
   * Grant the Lambda function write access to a DynamoDB table
   */
  public grantDynamoDBWrite(table: any): void {
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [table.tableArn],
      })
    );
  }

  /**
   * Grant the Lambda function full access to a DynamoDB table
   */
  public grantDynamoDBFullAccess(table: any): void {
    this.grantDynamoDBRead(table);
    this.grantDynamoDBWrite(table);
  }

  /**
   * Grant the Lambda function access to an S3 bucket
   */
  public grantS3Access(bucket: any, readOnly: boolean = false): void {
    const actions = readOnly
      ? ['s3:GetObject', 's3:ListBucket']
      : ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'];

    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions,
        resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
      })
    );
  }

  /**
   * Grant the Lambda function Bedrock access
   */
  public grantBedrockAccess(modelIds: string[]): void {
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: modelIds.map(id => `arn:aws:bedrock:*::foundation-model/${id}`),
      })
    );
  }
}
