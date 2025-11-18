import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
  ArnFormat,
  CustomResource,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { bedrock, opensearchserverless } from "@cdklabs/generative-ai-cdk-constructs";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { Tags } from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as quicksight from "aws-cdk-lib/aws-quicksight";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { join } from "path";
import * as cdk from "aws-cdk-lib";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Simple client-focused tags
    // Resource naming prefix - use stack ID for consistency across all resources
    const resourcePrefix = id;

    Tags.of(this).add("Project", "RevStar-Wellness-Template");
    Tags.of(this).add("ManagedBy", "CDK");

    // Define common Lambda configuration with shared dependencies
    const lambdaConfig = {
      runtime: Runtime.PYTHON_3_12,
      handler: "index.lambda_handler",
      bundling: {
        // Use the dependencies/requirements.txt file for all Lambda functions
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              `cp ${join(inputDir, '../dependencies/requirements.txt')} ${outputDir}`,
              `cd ${outputDir} && pip install -r requirements.txt -t .`,
            ];
          },
          beforeInstall() {
            return [];
          },
        },
      },
    };

    /** Knowledge Bases */

    // Create OpenSearch Serverless collection WITHOUT standby replicas to reduce costs
    // This cuts monthly costs from ~$700 to ~$350
    // V2: Recreated with new logical ID to force replacement after previous deployment failure
    const vectorStore = new opensearchserverless.VectorCollection(
      this,
      "VectorStoreV2",
      {
        collectionName: `${resourcePrefix.toLowerCase()}-vectors-v2`,
        standbyReplicas: "DISABLED" as any, // Disable standby replicas to save costs
      }
    );

    const knowledgeBaseV2 = new bedrock.VectorKnowledgeBase(
      this,
      "knowledgeBaseV2",
      {
        embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
        vectorStore: vectorStore,
      }
    );

    /** Default Guardrail for LLM Safety */
    const defaultGuardrail = new bedrock.Guardrail(this, "BaseGuardrail", {
      name: `${resourcePrefix}-guardrail`,
      description: "Default guardrail for wellness and health guidance interactions",
      blockedInputMessaging: "Your request violates our safety policy. Please revise your query.",
      blockedOutputsMessaging: "Response withheld due to content policy. Please try a different query.",
    });

    // Content filters with LOW sensitivity for wellness and health content
    // LOW sensitivity allows wellness and health discussions (nutrition, fitness, mental health topics)
    // while still blocking truly inappropriate content
    defaultGuardrail.addContentFilter({
      type: bedrock.ContentFilterType.SEXUAL,
      inputStrength: bedrock.ContentFilterStrength.LOW,
      outputStrength: bedrock.ContentFilterStrength.LOW,
      inputAction: bedrock.GuardrailAction.BLOCK,
      outputAction: bedrock.GuardrailAction.BLOCK,
      inputEnabled: true,
      outputEnabled: true,
      inputModalities: [bedrock.ModalityType.TEXT],
      outputModalities: [bedrock.ModalityType.TEXT],
    });

    defaultGuardrail.addContentFilter({
      type: bedrock.ContentFilterType.VIOLENCE,
      inputStrength: bedrock.ContentFilterStrength.LOW,
      outputStrength: bedrock.ContentFilterStrength.LOW,
      inputAction: bedrock.GuardrailAction.BLOCK,
      outputAction: bedrock.GuardrailAction.BLOCK,
      inputEnabled: true,
      outputEnabled: true,
      inputModalities: [bedrock.ModalityType.TEXT],
      outputModalities: [bedrock.ModalityType.TEXT],
    });

    /** S3 bucket for Bedrock data source */
    const docsBucket = new s3.Bucket(this, "docsbucket", {
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['http://localhost:3000', '*'], // Allow localhost for development and all origins for presigned URLs
          allowedHeaders: ['*'],
          exposedHeaders: [
            'ETag',
            'x-amz-server-side-encryption',
            'x-amz-request-id',
            'x-amz-id-2',
          ],
          maxAge: 3000,
        },
      ],
    });

    const s3DataSource = new bedrock.S3DataSource(this, "s3DataSource", {
      bucket: docsBucket,
      knowledgeBase: knowledgeBaseV2,
      dataSourceName: "docs",
      chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
        maxTokens: 500,
        overlapPercentage: 20,
      }),
    });

    const s3PutEventSource = new S3EventSource(docsBucket, {
      events: [s3.EventType.OBJECT_CREATED_PUT],
    });

    /** DynamoDB Tables - Must be defined before Lambda functions */

    /** DynamoDB table for user profiles */
    const userProfilesTable = new dynamodb.Table(this, "UserProfilesTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${resourcePrefix}-user-profiles`,
    });

    /** DynamoDB table for document metadata with sidecar references */
    const documentMetadataTable = new dynamodb.Table(this, "DocumentMetadataTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "documentId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${resourcePrefix}-document-metadata`,
    });

    // Add GSI for querying by document type
    documentMetadataTable.addGlobalSecondaryIndex({
      indexName: "documentType-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "documentType", type: dynamodb.AttributeType.STRING },
    });

    // Add GSI for querying by status
    documentMetadataTable.addGlobalSecondaryIndex({
      indexName: "status-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "currentStatus", type: dynamodb.AttributeType.STRING },
    });

    /** DynamoDB table for personalized AI insights */
    const personalizedInsightsTable = new dynamodb.Table(this, "PersonalizedInsightsTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${resourcePrefix}-personalized-insights`,
      timeToLiveAttribute: "ttl", // Auto-delete old insights after 90 days
    });

    // Add GSI for querying insights by type
    personalizedInsightsTable.addGlobalSecondaryIndex({
      indexName: "insightType-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "insightType", type: dynamodb.AttributeType.STRING },
    });

    /** DynamoDB table for user feedback on AI responses */
    const feedbackTable = new dynamodb.Table(this, "FeedbackTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "messageId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${resourcePrefix}-feedback`,
    });

    // Add GSI for querying feedback by type
    feedbackTable.addGlobalSecondaryIndex({
      indexName: "feedbackType-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "feedbackType", type: dynamodb.AttributeType.STRING },
    });

    // Add GSI for querying feedback by session
    feedbackTable.addGlobalSecondaryIndex({
      indexName: "sessionId-index",
      partitionKey: { name: "sessionId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    /** DynamoDB table for chat sessions */
    const chatSessionsTable = new dynamodb.Table(this, "ChatSessionsTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sessionId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${resourcePrefix}-chat-sessions`,
    });

    // Add GSI for querying sessions by timestamp (for sorting by newest)
    chatSessionsTable.addGlobalSecondaryIndex({
      indexName: "timestamp-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "updatedAt", type: dynamodb.AttributeType.STRING },
    });

    /** DynamoDB table for roadmap items */
    const roadmapTable = new dynamodb.Table(this, "RoadmapTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "itemId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      tableName: `${resourcePrefix}-roadmap`,
    });

    // Add GSI for querying roadmap items by status
    roadmapTable.addGlobalSecondaryIndex({
      indexName: "userId-status-index",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "status", type: dynamodb.AttributeType.STRING },
    });

    // Add GSI for querying completed items for analytics
    roadmapTable.addGlobalSecondaryIndex({
      indexName: "status-completedAt-index",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "completedAt", type: dynamodb.AttributeType.STRING },
    });

    /** Lambda Functions */

    /** S3 Ingest Lambda for S3 data source - Enhanced with sidecar support */

    const lambdaIngestionJob = new Function(this, "IngestionJob", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/ingest")),
      functionName: `${resourcePrefix}-ingestion-trigger`,
      timeout: Duration.minutes(15),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBaseV2.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
        BUCKET_ARN: docsBucket.bucketArn,
        BUCKET_NAME: docsBucket.bucketName,
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
        // DOCUMENT_ANALYSIS_LAMBDA_NAME will be set after DocumentAnalysis Lambda is defined
      },
    });

    lambdaIngestionJob.addEventSource(s3PutEventSource);

    lambdaIngestionJob.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob"],
        resources: [knowledgeBaseV2.knowledgeBaseArn, docsBucket.bucketArn],
      })
    );

    // Grant additional permissions for sidecar support
    docsBucket.grantReadWrite(lambdaIngestionJob);
    documentMetadataTable.grantReadWriteData(lambdaIngestionJob);

    const apiGateway = new apigw.RestApi(this, "rag", {
      description: "API for RAG",
      restApiName: `${resourcePrefix}-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "X-Api-Key", "Authorization"],
      },
    });

    /** DynamoDB table for request/response logging */
    const loggingTable = new dynamodb.Table(this, "LoggingTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      timeToLiveAttribute: "ttl",
    });

    loggingTable.addGlobalSecondaryIndex({
      indexName: "requestType-index",
      partitionKey: { name: "requestType", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
    });

    /** Lambda for profile management */
    const lambdaProfileManagement = new Function(this, "ProfileManagement", {
      runtime: Runtime.PYTHON_3_12,
      handler: "index.lambda_handler",
      code: Code.fromAsset(join(__dirname, "../../code/lambda/profile-management"), {
        bundling: {
          image: Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'cp -r /asset-input/* /asset-output/ && pip install -r /asset-output/requirements.txt -t /asset-output/'
          ],
        },
      }),
      functionName: `${resourcePrefix}-profile-management`,
      timeout: Duration.seconds(10),
      environment: {
        USER_PROFILES_TABLE_NAME: userProfilesTable.tableName,
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant profile Lambda permissions to read/write user profiles table
    userProfilesTable.grantReadWriteData(lambdaProfileManagement);
    loggingTable.grantWriteData(lambdaProfileManagement);

    /** Lambda for roadmap management */
    const lambdaRoadmapManagement = new Function(this, "RoadmapManagement", {
      runtime: Runtime.PYTHON_3_12,
      handler: "index.lambda_handler",
      code: Code.fromAsset(join(__dirname, "../../code/lambda/roadmap-management"), {
        bundling: {
          image: Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'cp -r /asset-input/* /asset-output/ && pip install -r /asset-output/requirements.txt -t /asset-output/'
          ],
        },
      }),
      functionName: `${resourcePrefix}-roadmap-management`,
      timeout: Duration.seconds(10),
      environment: {
        ROADMAP_TABLE_NAME: roadmapTable.tableName,
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant roadmap Lambda permissions to read/write roadmap table
    roadmapTable.grantReadWriteData(lambdaRoadmapManagement);
    loggingTable.grantWriteData(lambdaRoadmapManagement);

    /** Lambda for document upload with sidecar initialization */
    const lambdaDocumentUpload = new Function(this, "DocumentUpload", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/document-upload")),
      functionName: `${resourcePrefix}-document-upload`,
      timeout: Duration.seconds(10),
      environment: {
        DOCS_BUCKET_NAME: docsBucket.bucketName,
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
        USER_PROFILES_TABLE_NAME: userProfilesTable.tableName,
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant document upload Lambda permissions
    docsBucket.grantReadWrite(lambdaDocumentUpload);
    documentMetadataTable.grantReadWriteData(lambdaDocumentUpload);
    userProfilesTable.grantReadData(lambdaDocumentUpload);
    loggingTable.grantWriteData(lambdaDocumentUpload);

    /** Lambda for document list/get/delete operations */
    const lambdaDocumentList = new Function(this, "DocumentList", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/document-list")),
      functionName: `${resourcePrefix}-document-list`,
      timeout: Duration.seconds(10),
      environment: {
        DOCS_BUCKET_NAME: docsBucket.bucketName,
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
      },
    });

    // Grant document list Lambda permissions
    docsBucket.grantReadWrite(lambdaDocumentList);  // ReadWrite for delete operations
    documentMetadataTable.grantReadWriteData(lambdaDocumentList);  // ReadWrite for delete operations

    /** Lambda for user feedback on AI responses */
    const lambdaFeedback = new Function(this, "Feedback", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/feedback")),
      functionName: `${resourcePrefix}-feedback`,
      timeout: Duration.seconds(10),
      environment: {
        FEEDBACK_TABLE_NAME: feedbackTable.tableName,
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant feedback Lambda permissions
    feedbackTable.grantReadWriteData(lambdaFeedback);
    loggingTable.grantWriteData(lambdaFeedback);

    /** Lambda for document status polling */
    const lambdaDocumentStatus = new Function(this, "DocumentStatus", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/document-status")),
      functionName: `${resourcePrefix}-document-status`,
      timeout: Duration.seconds(10),
      environment: {
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
        BUCKET_NAME: docsBucket.bucketName,
      },
    });

    // Grant document status Lambda permissions
    documentMetadataTable.grantReadData(lambdaDocumentStatus);

    /** Lambda for ingestion status checking (EventBridge scheduled) */
    const lambdaIngestionStatusChecker = new Function(this, "IngestionStatusChecker", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/ingestion-status-checker")),
      functionName: `${resourcePrefix}-ingestion-status-checker`,
      timeout: Duration.seconds(60),
      environment: {
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
        KNOWLEDGE_BASE_ID: knowledgeBaseV2.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
      },
    });

    // Grant ingestion status checker Lambda permissions
    documentMetadataTable.grantReadWriteData(lambdaIngestionStatusChecker);
    lambdaIngestionStatusChecker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:GetIngestionJob"],
        resources: ["*"],
      })
    );

    // EventBridge rule to trigger ingestion status checker every 1 minute
    const ingestionStatusRule = new events.Rule(this, "IngestionStatusRule", {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      description: "Check ingestion job status every minute",
    });
    ingestionStatusRule.addTarget(new targets.LambdaFunction(lambdaIngestionStatusChecker));

    /** Nightly KB Sync Job Lambda */
    const lambdaKbSyncJob = new Function(this, "KbSyncJob", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/kb-sync-job")),
      functionName: `${resourcePrefix}-kb-sync-job`,
      timeout: Duration.minutes(5),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBaseV2.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
      },
    });

    // Grant permissions to start ingestion jobs
    lambdaKbSyncJob.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob", "bedrock:GetIngestionJob"],
        resources: [knowledgeBaseV2.knowledgeBaseArn],
      })
    );

    // EventBridge rule to trigger KB sync job nightly at 2 AM UTC
    const kbSyncRule = new events.Rule(this, "KbSyncRule", {
      schedule: events.Schedule.cron({ hour: "2", minute: "0" }),
      description: "Trigger Knowledge Base sync job nightly at 2 AM UTC",
    });
    kbSyncRule.addTarget(new targets.LambdaFunction(lambdaKbSyncJob));

    /** Lambda for activity logging from frontend */
    const lambdaActivityLog = new Function(this, "ActivityLog", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/activity-log")),
      functionName: `${resourcePrefix}-activity-log`,
      timeout: Duration.seconds(10),
      environment: {
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant activity log Lambda permissions
    loggingTable.grantWriteData(lambdaActivityLog);

    /** Lambda for chat sessions management */
    const lambdaChatSessions = new Function(this, "ChatSessions", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/chat-sessions")),
      functionName: `${resourcePrefix}-chat-sessions`,
      timeout: Duration.seconds(10),
      environment: {
        CHAT_SESSIONS_TABLE_NAME: chatSessionsTable.tableName,
      },
    });

    // Grant chat sessions Lambda permissions
    chatSessionsTable.grantReadWriteData(lambdaChatSessions);

    /** Lambda for generating smart session titles using Claude Haiku */
    const lambdaGenerateTitle = new Function(this, "GenerateTitle", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/generate-title")),
      functionName: `${resourcePrefix}-generate-title`,
      timeout: Duration.seconds(30),
      environment: {
        // No special environment variables needed - uses Bedrock
      },
    });

    // Grant Bedrock permissions for title generation
    lambdaGenerateTitle.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    /** Lambda for transforming chat messages into roadmap items */
    const lambdaRoadmapTransform = new Function(this, "RoadmapTransform", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/roadmap-transform")),
      functionName: `${resourcePrefix}-roadmap-transform`,
      timeout: Duration.seconds(30),
      environment: {
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant Bedrock permissions to roadmap transform Lambda
    lambdaRoadmapTransform.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    // Grant write permissions to logging table
    loggingTable.grantWriteData(lambdaRoadmapTransform);

    /** Lambda for admin analytics dashboard */
    const lambdaAdminAnalytics = new Function(this, "AdminAnalytics", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/admin-analytics")),
      functionName: `${resourcePrefix}-admin-analytics`,
      timeout: Duration.seconds(30),
      environment: {
        USER_PROFILES_TABLE_NAME: userProfilesTable.tableName,
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
        FEEDBACK_TABLE_NAME: feedbackTable.tableName,
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant admin analytics Lambda read permissions to all tables
    userProfilesTable.grantReadData(lambdaAdminAnalytics);
    documentMetadataTable.grantReadData(lambdaAdminAnalytics);
    feedbackTable.grantReadData(lambdaAdminAnalytics);
    loggingTable.grantReadData(lambdaAdminAnalytics);

    /** Lambda for AI-powered document analysis */
    const lambdaDocumentAnalysis = new Function(this, "DocumentAnalysis", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/document-analysis")),
      functionName: `${resourcePrefix}-document-analysis`,
      timeout: Duration.minutes(5),  // AI extraction can take time
      environment: {
        BUCKET_NAME: docsBucket.bucketName,
        DOCUMENT_METADATA_TABLE_NAME: documentMetadataTable.tableName,
        MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250514-v1:0',
      },
    });

    // Grant document analysis Lambda permissions
    docsBucket.grantRead(lambdaDocumentAnalysis);
    docsBucket.grantWrite(lambdaDocumentAnalysis);  // For writing sidecar files
    documentMetadataTable.grantReadWriteData(lambdaDocumentAnalysis);

    // Grant Bedrock permissions for AI extraction
    lambdaDocumentAnalysis.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:GetInferenceProfile",
        ],
        resources: ["*"],
      })
    );

    // Now update the Ingest Lambda environment to include DocumentAnalysis Lambda name
    lambdaIngestionJob.addEnvironment('DOCUMENT_ANALYSIS_LAMBDA_NAME', lambdaDocumentAnalysis.functionName);

    // Grant Ingest Lambda permission to invoke DocumentAnalysis Lambda
    lambdaDocumentAnalysis.grantInvoke(lambdaIngestionJob);

    /** Lambda for handling retrieval and answer generation - Enhanced with profile context */

    const lambdaQuery = new Function(this, "Query", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/query")),
      functionName: `${resourcePrefix}-query`,
      //query lambda duration set to match API Gateway max timeout
      timeout: Duration.seconds(29),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBaseV2.knowledgeBaseId,
        LOGGING_TABLE_NAME: loggingTable.tableName,
        GUARDRAIL_ID: defaultGuardrail.guardrailId,
        USER_PROFILES_TABLE_NAME: userProfilesTable.tableName,
      },
    });

    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:RetrieveAndGenerate",
          "bedrock:Retrieve",
          "bedrock:InvokeModel",
          "bedrock:GetInferenceProfile",
          "bedrock:ListInferenceProfiles",
        ],
        resources: ["*"],
      })
    );

    // Grant guardrail permissions to the Lambda function
    defaultGuardrail.grantApply(lambdaQuery);
    defaultGuardrail.grant(lambdaQuery, "bedrock:GetGuardrail", "bedrock:ListGuardrails");

    // Grant permissions to write to the logging table
    loggingTable.grantWriteData(lambdaQuery);

    // Grant permissions to read user profiles for personalization
    userProfilesTable.grantReadData(lambdaQuery);

    // ============================================================================
    // COGNITO & API GATEWAY SETUP
    // ============================================================================

    /** Cognito User Pool for API Gateway */
    const userPool = new cognito.UserPool(this, "BackendUserPool", {
      userPoolName: `${resourcePrefix}-user-pool`,
      mfa: cognito.Mfa.OFF, // MFA disabled for simple authentication flow
      selfSignUpEnabled: true, // Enable users to self-register
      // signInAliases removed - immutable property that can't be changed on existing pool
      // Users will sign up and sign in with username (email can be used as username)
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      // Account recovery via email only
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Use Cognito's default email service (no SES required)
      email: cognito.UserPoolEmail.withCognito(),
      userInvitation: {
        emailSubject: 'Welcome to RevStar Wellness Navigator',
        emailBody: `Hello {username},

Welcome to RevStar Wellness Navigator! Your account has been created.

Your temporary password is: {####}

Please log in at your earliest convenience and change your password.

Best regards,
The RevStar Wellness Team`,
      },
    });

    // Explicitly disable EMAIL_OTP MFA (required for existing pools)
    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.mfaConfiguration = "OFF";

    const readScope = new cognito.ResourceServerScope({ scopeName: "read", scopeDescription: "Read access" });
    const writeScope = new cognito.ResourceServerScope({ scopeName: "write", scopeDescription: "Write access" });

    const resourceServer = userPool.addResourceServer("ResourceServer", {
      identifier: `${resourcePrefix}-api`,
      userPoolResourceServerName: "LLM-Ops-QuickStart API",
      scopes: [readScope, writeScope],
    });

    const appClient = userPool.addClient("BackendClient", {
      userPoolClientName: `${resourcePrefix}-client`,
      authFlows: {
        adminUserPassword: true,  // Enable ADMIN_NO_SRP_AUTH for testing
        userPassword: true,       // Enable USER_PASSWORD_AUTH
        userSrp: true,            // Enable SRP authentication
      },
      generateSecret: false,  // Web apps should not use client secrets
    });

    // Create an authorizer for API Gateway
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "BackendAuthorizer",
      {
        cognitoUserPools: [userPool],
      }
    );

    // Default authorization for all methods
    const defaultMethodOptions: apigw.MethodOptions = {
      authorizer: authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    // ============================================================================
    // LAMBDAS REQUIRING USER POOL
    // ============================================================================

    /** Lambda for admin activity log */
    const lambdaAdminActivityLog = new Function(this, "AdminActivityLog", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/admin-activity-log")),
      functionName: `${resourcePrefix}-admin-activity-log`,
      timeout: Duration.seconds(30),
      environment: {
        USER_PROFILES_TABLE_NAME: userProfilesTable.tableName,
        LOGGING_TABLE_NAME: loggingTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
    });

    // Grant admin activity log Lambda read permissions to required tables
    userProfilesTable.grantReadData(lambdaAdminActivityLog);
    loggingTable.grantReadData(lambdaAdminActivityLog);

    // Grant permission to list and read user details from Cognito
    lambdaAdminActivityLog.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminListGroupsForUser', 'cognito-idp:ListUsersInGroup'],
      resources: [userPool.userPoolArn],
    }));

    /** Lambda for admin users list */
    const lambdaAdminUsers = new Function(this, "AdminUsers", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/admin-users")),
      functionName: `${resourcePrefix}-admin-users`,
      timeout: Duration.seconds(30),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
    });

    // Grant permission to list users from Cognito
    lambdaAdminUsers.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cognito-idp:ListUsers'],
      resources: [userPool.userPoolArn],
    }));

    // Add USER_POOL_ID to admin analytics Lambda environment
    lambdaAdminAnalytics.addEnvironment('USER_POOL_ID', userPool.userPoolId);

    // Grant permission to check Cognito groups for admin filtering
    lambdaAdminAnalytics.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminListGroupsForUser'],
      resources: [userPool.userPoolArn],
    }));

    /** Lambda for user deletion (GDPR/CCPA compliance) */
    const lambdaUserDeletion = new Function(this, "UserDeletion", {
      ...lambdaConfig,
      code: Code.fromAsset(join(__dirname, "../../code/lambda/user-deletion")),
      functionName: `${resourcePrefix}-user-deletion`,
      timeout: Duration.seconds(300), // 5 minutes for complete deletion
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        DOCS_BUCKET_NAME: docsBucket.bucketName,
        TABLE_USER_PROFILES: userProfilesTable.tableName,
        TABLE_DOCUMENT_METADATA: documentMetadataTable.tableName,
        TABLE_CHAT_SESSIONS: chatSessionsTable.tableName,
        TABLE_FEEDBACK: feedbackTable.tableName,
        TABLE_PERSONALIZED_INSIGHTS: personalizedInsightsTable.tableName,
        TABLE_ACTIVITY_LOGS: loggingTable.tableName,
        OPENSEARCH_ENDPOINT: vectorStore.collectionEndpoint,
      },
    });

    // Grant user deletion Lambda full access to all tables
    userProfilesTable.grantReadWriteData(lambdaUserDeletion);
    documentMetadataTable.grantReadWriteData(lambdaUserDeletion);
    chatSessionsTable.grantReadWriteData(lambdaUserDeletion);
    feedbackTable.grantReadWriteData(lambdaUserDeletion);
    personalizedInsightsTable.grantReadWriteData(lambdaUserDeletion);
    loggingTable.grantReadWriteData(lambdaUserDeletion);

    // Grant S3 permissions to delete user documents
    docsBucket.grantDelete(lambdaUserDeletion);
    docsBucket.grantRead(lambdaUserDeletion); // Need read to list objects

    // Grant Cognito permissions to list and delete users
    lambdaUserDeletion.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:ListUsers',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminDeleteUser'
      ],
      resources: [userPool.userPoolArn],
    }));

    // Grant OpenSearch permissions (if needed for vector deletion)
    lambdaUserDeletion.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'aoss:APIAccessAll'
      ],
      resources: [vectorStore.collectionArn],
    }));

    // ============================================================================
    // API GATEWAY ENDPOINTS
    // ============================================================================

    // API Endpoints with Cognito authentication (no OAuth scopes required for user auth)

    // Profile management endpoints
    const profileResource = apiGateway.root.addResource("profile");
    profileResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaProfileManagement),
      defaultMethodOptions
    );
    profileResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaProfileManagement),
      defaultMethodOptions
    );
    profileResource.addMethod(
      "PUT",
      new apigw.LambdaIntegration(lambdaProfileManagement),
      defaultMethodOptions
    );

    // Roadmap management endpoints
    const roadmapResource = apiGateway.root.addResource("roadmap");
    roadmapResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaRoadmapManagement),
      defaultMethodOptions
    );
    roadmapResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaRoadmapManagement),
      defaultMethodOptions
    );

    // Roadmap item endpoints (with itemId path parameter)
    const roadmapItemResource = roadmapResource.addResource("{itemId}");
    roadmapItemResource.addMethod(
      "PUT",
      new apigw.LambdaIntegration(lambdaRoadmapManagement),
      defaultMethodOptions
    );
    roadmapItemResource.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(lambdaRoadmapManagement),
      defaultMethodOptions
    );

    // Document management endpoints
    const documentsResource = apiGateway.root.addResource("documents", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // GET /documents - List all documents
    documentsResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaDocumentList),
      defaultMethodOptions
    );

    // POST /documents/upload - Upload a document
    const uploadResource = documentsResource.addResource("upload");
    uploadResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaDocumentUpload),
      defaultMethodOptions
    );

    // GET /documents/{documentId} - Get specific document
    // DELETE /documents/{documentId} - Delete document
    const documentIdResource = documentsResource.addResource("{documentId}");
    documentIdResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaDocumentList),
      defaultMethodOptions
    );
    documentIdResource.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(lambdaDocumentList),
      defaultMethodOptions
    );

    // GET /documents/{documentId}/status - Get document processing status
    const statusResource = documentIdResource.addResource("status");
    statusResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaDocumentStatus),
      defaultMethodOptions
    );

    // Feedback endpoints
    const feedbackResource = apiGateway.root.addResource("feedback");

    // POST /feedback - Submit new feedback
    feedbackResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaFeedback),
      defaultMethodOptions
    );

    // GET /feedback/{messageId} - Get feedback for a message
    // PUT /feedback/{messageId} - Update existing feedback
    // DELETE /feedback/{messageId} - Delete feedback
    const feedbackMessageIdResource = feedbackResource.addResource("{messageId}");
    feedbackMessageIdResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaFeedback),
      defaultMethodOptions
    );
    feedbackMessageIdResource.addMethod(
      "PUT",
      new apigw.LambdaIntegration(lambdaFeedback),
      defaultMethodOptions
    );
    feedbackMessageIdResource.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(lambdaFeedback),
      defaultMethodOptions
    );

    // Activity log endpoint (for frontend to log user activities)
    const userActivityLogResource = apiGateway.root.addResource("activity-log");
    userActivityLogResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaActivityLog),
      defaultMethodOptions
    );

    // Chat sessions endpoints
    const chatResource = apiGateway.root.addResource("chat");
    const sessionsResource = chatResource.addResource("sessions");

    // GET /chat/sessions - List all sessions
    // POST /chat/sessions - Create new session
    sessionsResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaChatSessions),
      defaultMethodOptions
    );
    sessionsResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaChatSessions),
      defaultMethodOptions
    );

    // GET /chat/sessions/{sessionId} - Get specific session
    // PUT /chat/sessions/{sessionId} - Update session
    // DELETE /chat/sessions/{sessionId} - Delete session
    const sessionIdResource = sessionsResource.addResource("{sessionId}");
    sessionIdResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaChatSessions),
      defaultMethodOptions
    );
    sessionIdResource.addMethod(
      "PUT",
      new apigw.LambdaIntegration(lambdaChatSessions),
      defaultMethodOptions
    );
    sessionIdResource.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(lambdaChatSessions),
      defaultMethodOptions
    );

    // POST /generate-title - Generate smart title for chat session
    const generateTitleResource = apiGateway.root.addResource("generate-title");
    generateTitleResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaGenerateTitle),
      defaultMethodOptions
    );

    // Admin analytics endpoint
    const adminResource = apiGateway.root.addResource("admin");
    const analyticsResource = adminResource.addResource("analytics");
    analyticsResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaAdminAnalytics),
      defaultMethodOptions
    );

    // Admin activity log endpoint
    const activityLogResource = adminResource.addResource("activity-log");
    activityLogResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaAdminActivityLog),
      defaultMethodOptions
    );

    // Admin user deletion endpoint (GDPR/CCPA compliance)
    const userDeletionResource = adminResource.addResource("delete-user");
    userDeletionResource.addMethod(
      "DELETE",
      new apigw.LambdaIntegration(lambdaUserDeletion),
      defaultMethodOptions
    );

    // Admin users list endpoint
    const usersResource = adminResource.addResource("users");
    usersResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(lambdaAdminUsers),
      defaultMethodOptions
    );

    // RAG query endpoint
    apiGateway.root
      .addResource("docs")
      .addMethod(
        "POST",
        new apigw.LambdaIntegration(lambdaQuery),
        defaultMethodOptions
      );

    // Roadmap transform endpoint
    const roadmapTransformResource = apiGateway.root.addResource("roadmap-transform");
    roadmapTransformResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaRoadmapTransform),
      defaultMethodOptions
    );

    apiGateway.addUsagePlan("usage-plan", {
      name: `${resourcePrefix}-usage-plan`,
      description: "usage plan for LLM-Ops-QuickStart",
      apiStages: [
        {
          api: apiGateway,
          stage: apiGateway.deploymentStage,
        },
      ],
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    // Set up CloudWatch alarms for service health monitoring
    const apiErrorAlarm = new logs.MetricFilter(
      this,
      "APIGateway5xxErrorMetric",
      {
        logGroup: new logs.LogGroup(this, "APIGatewayLogs", {
          logGroupName: `/aws/apigateway/${apiGateway.restApiId}/${apiGateway.deploymentStage.stageName}`,
          removalPolicy: RemovalPolicy.RETAIN,
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        filterPattern: logs.FilterPattern.literal('{ $.status >= 500 }'),
        metricNamespace: "APIGateway",
        metricName: "5xxErrors",
      }
    );

    //CfnOutput is used to log API Gateway URL and S3 bucket name to console
    new CfnOutput(this, "APIGatewayUrl", {
      value: apiGateway.url,
    });

    new CfnOutput(this, "DocsBucketName", {
      value: docsBucket.bucketName,
    });

    new CfnOutput(this, "LoggingTableName", {
      value: loggingTable.tableName,
    });

    new CfnOutput(this, "GuardrailId", {
      value: defaultGuardrail.guardrailId,
      description: "Guardrail ID for LLM safety filtering",
    });

    new CfnOutput(this, "KnowledgeBaseId", {
      value: knowledgeBaseV2.knowledgeBaseId,
      description: "Bedrock Knowledge Base ID for RAG",
    });

    // Additional Outputs for Cognito
    new CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new CfnOutput(this, "UserPoolClientId", {
      value: appClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
    });

    /** QuickSight Resources for Analytics Dashboard */
    
    // Create QuickSight service role
    const quicksightServiceRole = new iam.Role(this, "QuickSightServiceRole", {
      assumedBy: new iam.ServicePrincipal("quicksight.amazonaws.com"),
      description: "Service role for QuickSight to access DynamoDB and CloudWatch",
    });

    // Grant QuickSight read access to DynamoDB logging table
    loggingTable.grantReadData(quicksightServiceRole);

    // Grant CloudWatch read permissions
    quicksightServiceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:FilterLogEvents",
        ],
        resources: ["*"],
      })
    );

    // Additional permissions for QuickSight to manage its own resources
    quicksightServiceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "quicksight:*",
          "dynamodb:DescribeTable",
          "dynamodb:ListTables",
          "dynamodb:Scan",
          "dynamodb:Query",
        ],
        resources: ["*"],
      })
    );

    new CfnOutput(this, "QuickSightServiceRoleArn", {
      value: quicksightServiceRole.roleArn,
      description: "QuickSight Service Role ARN - Use this role when setting up QuickSight data sources",
    });

    new CfnOutput(this, "QuickSightSetupInstructions", {
      value: "See docs/quicksight-setup.md for manual dashboard setup instructions",
      description: "QuickSight Dashboard Setup Instructions",
    });

    // Additional Outputs for new DynamoDB tables
    new CfnOutput(this, "UserProfilesTableName", {
      value: userProfilesTable.tableName,
      description: "DynamoDB table for user family profiles",
    });

    new CfnOutput(this, "DocumentMetadataTableName", {
      value: documentMetadataTable.tableName,
      description: "DynamoDB table for document metadata with sidecar references",
    });

    new CfnOutput(this, "PersonalizedInsightsTableName", {
      value: personalizedInsightsTable.tableName,
      description: "DynamoDB table for AI-generated personalized insights",
    });

    new CfnOutput(this, "FeedbackTableName", {
      value: feedbackTable.tableName,
      description: "DynamoDB table for user feedback on AI responses",
    });

    new CfnOutput(this, "ChatSessionsTableName", {
      value: chatSessionsTable.tableName,
      description: "DynamoDB table for chat sessions and message history",
    });

    // ============================================================================
    // POST-CONFIRMATION LAMBDA - Deploy without trigger (attach manually)
    // ============================================================================
    // Note: Due to circular dependencies with API Gateway, the Lambda trigger
    // must be attached manually after stack deployment using AWS CLI:
    //
    // aws cognito-idp update-user-pool --user-pool-id <pool-id> \
    //   --lambda-config PostConfirmation=<lambda-arn>
    //
    // Then grant invoke permission:
    // aws lambda add-permission --function-name <function-name> \
    //   --statement-id CognitoInvoke --action lambda:InvokeFunction \
    //   --principal cognito-idp.amazonaws.com --source-arn <pool-arn>

    /** Post-Confirmation Lambda - Auto-adds new users to 'users' group */
    const postConfirmationLambda = new Function(this, "PostConfirmationTrigger", {
      runtime: Runtime.PYTHON_3_12,
      handler: "index.handler",
      code: Code.fromAsset(join(__dirname, "../../code/lambda/cognito-post-confirmation")),
      functionName: `${resourcePrefix}-post-confirmation`,
      timeout: Duration.seconds(10),
      environment: {
        LOGGING_TABLE_NAME: loggingTable.tableName,
      },
    });

    // Grant Lambda permission to add users to groups (using wildcard to avoid circular dependency)
    postConfirmationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:AdminAddUserToGroup', 'cognito-idp:GetUser'],
        resources: ['*'],  // Using wildcard to avoid circular dependency with User Pool
      })
    );

    // Grant permission to write activity logs
    loggingTable.grantWriteData(postConfirmationLambda);

    new CfnOutput(this, "PostConfirmationLambdaArn", {
      value: postConfirmationLambda.functionArn,
      description: "Post-confirmation Lambda ARN - Use to attach trigger manually",
    });

    new CfnOutput(this, "PostConfirmationSetupCommand", {
      value: `aws cognito-idp update-user-pool --user-pool-id ${userPool.userPoolId} --lambda-config PostConfirmation=${postConfirmationLambda.functionArn} && aws lambda add-permission --function-name ${postConfirmationLambda.functionName} --statement-id CognitoInvoke --action lambda:InvokeFunction --principal cognito-idp.amazonaws.com --source-arn ${userPool.userPoolArn}`,
      description: "Command to attach post-confirmation trigger (run after stack deployment)",
    });

    // ============================================================================
    // USER REGISTRATION LAMBDA - Creates users via AdminCreateUser
    // ============================================================================

    /** User Registration Lambda - Handles sign-up via AdminCreateUser */
    const userRegistrationLambda = new Function(this, "UserRegistration", {
      runtime: Runtime.PYTHON_3_12,
      handler: "index.lambda_handler",
      code: Code.fromAsset(join(__dirname, "../../code/lambda/user-registration")),
      functionName: `${resourcePrefix}-user-registration`,
      timeout: Duration.seconds(10),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
    });

    // Grant Lambda permission to create users in Cognito
    userRegistrationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminSetUserPassword',
        ],
        resources: [userPool.userPoolArn],
      })
    );

    // Add API Gateway endpoint for user registration (no auth required)
    const authResource = apiGateway.root.addResource("auth");
    const registerResource = authResource.addResource("register");
    registerResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(userRegistrationLambda),
      {
        authorizationType: apigw.AuthorizationType.NONE, // Public endpoint
      }
    );

    new CfnOutput(this, "RegistrationEndpoint", {
      value: `${apiGateway.url}auth/register`,
      description: "User registration endpoint (POST)",
    });

  }
} 