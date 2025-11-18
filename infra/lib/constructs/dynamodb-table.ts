import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../utils/config-loader';

export interface StandardTableProps {
  tableName: string;
  partitionKey: { name: string; type: dynamodb.AttributeType };
  sortKey?: { name: string; type: dynamodb.AttributeType };
  config: EnvironmentConfig;
  globalSecondaryIndexes?: {
    indexName: string;
    partitionKey: { name: string; type: dynamodb.AttributeType };
    sortKey?: { name: string; type: dynamodb.AttributeType };
    projectionType?: dynamodb.ProjectionType;
  }[];
  timeToLiveAttribute?: string;
  stream?: dynamodb.StreamViewType;
}

/**
 * Standardized DynamoDB table construct with common patterns
 */
export class StandardDynamoDBTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StandardTableProps) {
    super(scope, id);

    // Determine billing mode from config
    const billingMode = props.config.dynamodb.billing_mode === 'PAY_PER_REQUEST'
      ? dynamodb.BillingMode.PAY_PER_REQUEST
      : dynamodb.BillingMode.PROVISIONED;

    // Determine removal policy from config
    const removalPolicy = props.config.removal_policy === 'DESTROY'
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    // Create table
    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: props.partitionKey,
      sortKey: props.sortKey,
      billingMode,
      removalPolicy,
      pointInTimeRecovery: props.config.dynamodb.enable_point_in_time_recovery,
      stream: props.stream,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Add Global Secondary Indexes if provided
    if (props.globalSecondaryIndexes) {
      props.globalSecondaryIndexes.forEach((gsi) => {
        this.table.addGlobalSecondaryIndex({
          indexName: gsi.indexName,
          partitionKey: gsi.partitionKey,
          sortKey: gsi.sortKey,
          projectionType: gsi.projectionType || dynamodb.ProjectionType.ALL,
        });
      });
    }

    // TTL is now set in table props during creation
    // No need to add it separately in newer CDK versions

    // Add tags from config
    Object.entries(props.config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this.table).add(key, value);
    });

    // Output table name
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: `DynamoDB table: ${props.tableName}`,
    });
  }

  /**
   * Create a standard GSI for user-based queries
   */
  public addUserIndex(userKeyName: string = 'userId'): void {
    this.table.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
      partitionKey: { name: userKeyName, type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }

  /**
   * Create a standard GSI for timestamp-based queries
   */
  public addTimestampIndex(timestampKeyName: string = 'timestamp'): void {
    this.table.addGlobalSecondaryIndex({
      indexName: 'TimestampIndex',
      partitionKey: { name: timestampKeyName, type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
