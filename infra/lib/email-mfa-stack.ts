import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export interface EmailMfaStackProps extends cdk.StackProps {
  environment: string;
}

export class EmailMfaStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly testLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: EmailMfaStackProps) {
    super(scope, id, props);

    const resourcePrefix = `email-mfa-${props.environment}`;

    // Create User Pool with email MFA configuration
    // Using L2 construct first, then will convert to L1 (CfnUserPool) for email MFA support
    this.userPool = new cognito.UserPool(this, "EmailMfaUserPool", {
      userPoolName: `${resourcePrefix}-user-pool`,
      selfSignUpEnabled: false, // Admin creates users for testing
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false, // Simpler for testing
      },
      // NOTE: Cannot use EMAIL_ONLY when email MFA is enabled
      // Must have at least one non-email recovery mechanism
      accountRecovery: cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      // Email MFA requires SES - cannot use COGNITO_DEFAULT
      // Using SES with verified email address
      email: cognito.UserPoolEmail.withSES({
        fromEmail: "greg.black@revstarconsulting.com",
        fromName: "Parenting Autism Navigator - MFA Test",
        sesRegion: "us-east-1",
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For testing - easy cleanup
    });

    // Get the underlying CfnUserPool to enable email MFA
    // This is required because the L2 construct doesn't support email MFA
    const cfnUserPool = this.userPool.node.defaultChild as cognito.CfnUserPool;

    // Configure MFA settings at the CloudFormation level
    cfnUserPool.mfaConfiguration = "ON"; // REQUIRED MFA

    // Enable email MFA by adding it to the enabled MFA types
    cfnUserPool.enabledMfas = ["EMAIL_OTP"];

    // Configure email verification message for MFA
    cfnUserPool.emailVerificationMessage = "Your verification code is {####}";
    cfnUserPool.emailVerificationSubject = "Parenting Autism Navigator - Verify your email";

    // Create User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(
      this,
      "EmailMfaUserPoolClient",
      {
        userPool: this.userPool,
        userPoolClientName: `${resourcePrefix}-client`,
        authFlows: {
          userPassword: true,
          userSrp: true,
          custom: false,
          adminUserPassword: true,
        },
        generateSecret: false, // Web/mobile apps don't need client secret
        preventUserExistenceErrors: true,
        // Email MFA support
        readAttributes: new cognito.ClientAttributes().withStandardAttributes({
          email: true,
          emailVerified: true,
        }),
        writeAttributes: new cognito.ClientAttributes().withStandardAttributes({
          email: true,
        }),
      }
    );

    // Create Test Lambda for user management and MFA testing
    this.testLambda = new lambda.Function(this, "EmailMfaTestLambda", {
      functionName: `${resourcePrefix}-test-function`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../code/lambda/email-mfa-test")
      ),
      timeout: cdk.Duration.seconds(30),
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        CLIENT_ID: this.userPoolClient.userPoolClientId,
        ENVIRONMENT: props.environment,
      },
      description: "Lambda function for testing email MFA user operations",
    });

    // Grant Lambda permissions to manage users in the User Pool
    this.testLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminSetUserMFAPreference",
          "cognito-idp:AdminUpdateUserAttributes",
        ],
        resources: [this.userPool.userPoolArn],
      })
    );

    // CloudFormation Outputs for testing
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      description: "Email MFA User Pool ID",
      exportName: `${resourcePrefix}-user-pool-id`,
    });

    new cdk.CfnOutput(this, "UserPoolArn", {
      value: this.userPool.userPoolArn,
      description: "Email MFA User Pool ARN",
      exportName: `${resourcePrefix}-user-pool-arn`,
    });

    new cdk.CfnOutput(this, "ClientId", {
      value: this.userPoolClient.userPoolClientId,
      description: "Email MFA User Pool Client ID",
      exportName: `${resourcePrefix}-client-id`,
    });

    new cdk.CfnOutput(this, "TestLambdaArn", {
      value: this.testLambda.functionArn,
      description: "Test Lambda Function ARN",
      exportName: `${resourcePrefix}-test-lambda-arn`,
    });

    new cdk.CfnOutput(this, "TestLambdaName", {
      value: this.testLambda.functionName,
      description: "Test Lambda Function Name",
      exportName: `${resourcePrefix}-test-lambda-name`,
    });

    // Tags for resource organization
    cdk.Tags.of(this).add("Stack", "EmailMfaStack");
    cdk.Tags.of(this).add("Environment", props.environment);
    cdk.Tags.of(this).add("Purpose", "Email MFA Testing");
  }
}
