import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

// Define constants at the top
const DYNAMODB_TABLE_NAME = process.env.VITE_DYNAMODB_TABLE_NAME || 'submissions'; 
const STREAM_GROUP_ID = process.env.VITE_GAMELIFT_STREAM_GROUP_ID || 'sg-5ZVBpCfLM';

export class GameStreamProvisioningStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // === IAM Role Definitions ===

    // Import the existing submissions table instead of creating a new one
    const submissionsTable = dynamodb.Table.fromTableName(
      this,
      'SubmissionsTable',
      DYNAMODB_TABLE_NAME
    );

    const tableArn = submissionsTable.tableArn;

    // Create IAM role for Lambda functions
    const gameLiftLambdaRole = new iam.Role(this, 'GameLiftLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant specific inline permissions
    gameLiftLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        // GameLift Streams actions needed
        'gameliftstreams:CreateApplication',
        'gameliftstreams:TagResource',
        'gameliftstreams:AssociateApplications',
        'gameliftstreams:GetApplication',
        'gameliftstreams:ListApplications',
        'gameliftstreams:UpdateApplication',
        'gameliftstreams:DeleteApplication'
      ],
      resources: [
        `arn:aws:gameliftstreams:${this.region}:${this.account}:application/*`,
        `arn:aws:gameliftstreams:${this.region}:${this.account}:/applications`,
        `arn:aws:gameliftstreams:${this.region}:${this.account}:streamgroup/${STREAM_GROUP_ID}`
      ],
    }));

    // Add CloudWatch Logs permissions
    gameLiftLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`]
    }));

    gameLiftLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
      ],
      resources: [submissionsTable.tableArn],
    }));

    // Grant S3 read access to the Lambda role
    gameLiftLambdaRole.addToPolicy(new iam.PolicyStatement({
        actions: ['s3:ListBucket', 's3:GetObject'],
        resources: [
            `arn:aws:s3:::game-builds-remangu`,
            `arn:aws:s3:::game-builds-remangu/*`
        ]
    }));

    // === Lambda Function Definitions ===

    // Helper function to define Node.js Lambdas
    const createNodeLambda = (name: string, handlerFile: string, role: iam.IRole) => {
      return new nodeLambda.NodejsFunction(this, name, {
        entry: path.join(__dirname, `lambdas/${handlerFile}.ts`),
        handler: 'handler', 
        runtime: lambda.Runtime.NODEJS_18_X,
        role: role,
        timeout: Duration.minutes(5),
        memorySize: 512,
        retryAttempts: 2,
        bundling: {
          minify: true,
          sourceMap: true,
          externalModules: [
            '@aws-sdk/client-gameliftstreams',
            '@aws-sdk/client-dynamodb',
            '@aws-sdk/lib-dynamodb'
          ],
          nodeModules: [
            '@aws-sdk/client-gameliftstreams',
            '@aws-sdk/client-dynamodb',
            '@aws-sdk/lib-dynamodb'
          ],
          define: {
            'process.env.NODE_ENV': '"production"'
          }
        },
        environment: {
          DYNAMODB_TABLE_NAME: submissionsTable.tableName,
          STREAM_GROUP_ID,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
          NODE_OPTIONS: '--enable-source-maps'
        },
        tracing: lambda.Tracing.ACTIVE
      });
    };

    const createAppLambda = createNodeLambda('CreateAppFunction', 'createApp', gameLiftLambdaRole);
    const associateAppLambda = createNodeLambda('AssociateAppFunction', 'associateApp', gameLiftLambdaRole);
    const updateDbLambda = createNodeLambda('UpdateDbFunction', 'updateDb', gameLiftLambdaRole);
    const checkAppStatusLambda = createNodeLambda('CheckAppStatusFunction', 'checkAppStatus', gameLiftLambdaRole);

    // === Define Roles and State Machine FIRST ===
    
    const startSfnLambdaRole = new iam.Role(this, 'StartSfnLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    startSfnLambdaRole.addToPolicy(new iam.PolicyStatement({
        actions: ['dynamodb:GetItem'],
        resources: [tableArn], 
    }));

    // === Step Functions State Machine Definition ===

    const createAppTask = new tasks.LambdaInvoke(this, 'CreateAppTask', {
      lambdaFunction: createAppLambda,
      comment: 'Create GameLift Streams Application from S3 source',
      payloadResponseOnly: true,
      inputPath: '$',
      resultPath: '$.AppDetails',
      retryOnServiceExceptions: true
    });

    const associateAppTask = new tasks.LambdaInvoke(this, 'AssociateAppTask', {
      lambdaFunction: associateAppLambda,
      comment: 'Associate Application with Stream Group',
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        ApplicationArn: sfn.JsonPath.stringAt('$.AppDetails.ApplicationArn'),
        submissionId: sfn.JsonPath.stringAt('$.submissionId'),
      }),
      resultPath: '$.AssociationDetails',
      retryOnServiceExceptions: true
    });

    const updateDbTask = new tasks.LambdaInvoke(this, 'UpdateDbStatusTask', {
      lambdaFunction: updateDbLambda,
      comment: 'Update DynamoDB submission status to READY',
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        submissionId: sfn.JsonPath.stringAt('$.submissionId'), 
        applicationArn: sfn.JsonPath.stringAt('$.AppDetails.ApplicationArn'),
        streamGroupId: STREAM_GROUP_ID,
        status: 'READY'
      }),
      resultPath: sfn.JsonPath.DISCARD,
      retryOnServiceExceptions: true
    });

    const jobFailedState = new sfn.Fail(this, 'ProvisioningFailed', {
      comment: 'GameLift provisioning failed',
      cause: 'Task execution failed',
      error: 'ProvisioningError'
    });

    const jobSucceededState = new sfn.Succeed(this, 'ProvisioningSucceeded', {
      comment: 'GameLift provisioning completed successfully'
    });

    const waitState = new sfn.Wait(this, 'WaitForAppReady', {
      time: sfn.WaitTime.duration(Duration.seconds(10))
    });

    const checkAppStatusTask = new tasks.LambdaInvoke(this, 'CheckAppStatusTask', {
      lambdaFunction: checkAppStatusLambda,
      comment: 'Check if GameLift application is ready',
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        ApplicationArn: sfn.JsonPath.stringAt('$.AppDetails.ApplicationArn'),
        submissionId: sfn.JsonPath.stringAt('$.submissionId'),
      }),
      resultPath: '$.AppStatus',
      retryOnServiceExceptions: true
    });

    const isAppNotReady = new sfn.Choice(this, 'IsAppReady')
      .when(sfn.Condition.stringEquals('$.AppStatus.status', 'READY'), associateAppTask)
      .otherwise(waitState);

    // Define error handling paths with custom error states
    const handleCreateAppError = new sfn.Pass(this, 'HandleCreateAppError', {
      parameters: {
        'error.$': '$.Error',
        'cause.$': '$.Cause',
        'submissionId.$': '$.submissionId'
      }
    }).next(jobFailedState);

    const handleAssociateAppError = new sfn.Pass(this, 'HandleAssociateAppError', {
      parameters: {
        'error.$': '$.Error',
        'cause.$': '$.Cause',
        'submissionId.$': '$.submissionId',
        'applicationArn.$': '$.AppDetails.ApplicationArn'
      }
    }).next(jobFailedState);

    // Define the state machine flow with error handling
    const definition = createAppTask
      .addCatch(handleCreateAppError, {
        errors: ['States.ALL'],
        resultPath: '$.error'
      })
      .next(waitState)
      .next(checkAppStatusTask)
      .next(isAppNotReady);

    associateAppTask
      .addCatch(handleAssociateAppError, {
        errors: ['States.ALL'],
        resultPath: '$.error'
      })
      .next(updateDbTask)
      .next(jobSucceededState);

    // Define the State Machine with logging
    const stateMachine = new sfn.StateMachine(this, 'GameStreamProvisioningMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.hours(1),
      comment: 'State machine to provision GameLift Streams application',
      tracingEnabled: true,
      logs: {
        destination: new cdk.aws_logs.LogGroup(this, 'StepFunctionLogGroup', {
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        level: sfn.LogLevel.ALL,
        includeExecutionData: true
      }
    });
    
    startSfnLambdaRole.addToPolicy(new iam.PolicyStatement({
        actions: ['states:StartExecution'],
        resources: [stateMachine.stateMachineArn],
    }));

    // === Define Trigger Lambdas and API Gateway ===

    const startStepFunctionLambda = createNodeLambda(
      'StartStepFunctionLambda',
      'startStepFunction',
      startSfnLambdaRole
    );
    
    // Add environment variables separately
    startStepFunctionLambda.addEnvironment('DYNAMODB_TABLE_NAME', submissionsTable.tableName);
    startStepFunctionLambda.addEnvironment('STREAM_GROUP_ID', STREAM_GROUP_ID);
    startStepFunctionLambda.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);

    const api = new apigateway.RestApi(this, 'GameStreamProvisioningApi', {
      restApiName: 'GameStream Provisioning Service',
      description: 'API to trigger GameLift provisioning.',
      defaultCorsPreflightOptions: { 
        allowOrigins: [process.env.VITE_APP_URL || '*'],
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ],
        maxAge: Duration.days(1)
      },
      deployOptions: {
        stageName: 'prod',
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        tracingEnabled: true,
        metricsEnabled: true
      }
    });

    // Add request validator
    const validator = new apigateway.RequestValidator(this, 'ProvisioningRequestValidator', {
      restApi: api,
      validateRequestBody: true,
      validateRequestParameters: true
    });

    // Add model for request validation
    const provisioningModel = new apigateway.Model(this, 'ProvisioningModel', {
      restApi: api,
      contentType: 'application/json',
      modelName: 'ProvisioningRequest',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['submissionId'],
        properties: {
          submissionId: { type: apigateway.JsonSchemaType.STRING }
        }
      }
    });

    const provisionResource = api.root.addResource('provision');
    provisionResource.addMethod('POST', new apigateway.LambdaIntegration(startStepFunctionLambda), {
      requestValidator: validator,
      requestModels: {
        'application/json': provisioningModel
      },
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL
          },
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        }
      ]
    });

    // === Outputs === 
    new cdk.CfnOutput(this, 'ProvisioningApiEndpoint', {
      value: api.url,
      description: 'API endpoint for triggering GameLift provisioning',
    });
    new cdk.CfnOutput(this, 'StateMachineArnOutput', {
      value: stateMachine.stateMachineArn,
      description: 'ARN of the GameLift provisioning state machine',
    });
  }
}
