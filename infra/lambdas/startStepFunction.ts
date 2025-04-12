import { SFNClient, StartExecutionCommand, StartExecutionCommandInput } from "@aws-sdk/client-sfn";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, GetCommandInput } from "@aws-sdk/lib-dynamodb";

const sfn = new SFNClient({});
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const stateMachineArn = process.env.STATE_MACHINE_ARN;
const tableName = process.env.DYNAMODB_TABLE_NAME;

interface StartRequest {
  submissionId: string;
}

export const handler = async (event: any) => {
  console.log("Received API Gateway event:", JSON.stringify(event, null, 2));

  if (!stateMachineArn) {
    throw new Error("STATE_MACHINE_ARN environment variable is not set.");
  }
  if (!tableName) {
    throw new Error("DYNAMODB_TABLE_NAME environment variable is not set.");
  }

  let requestBody: StartRequest;
  try {
    requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    if (!requestBody || !requestBody.submissionId) {
        throw new Error("Missing submissionId in request body.");
    }
  } catch (e: any) {
    console.error("Failed to parse request body:", e);
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body", error: e.message }) };
  }

  const { submissionId } = requestBody;

  try {
    console.log(`Fetching details for submission ${submissionId} from ${tableName}...`);
    const getParams: GetCommandInput = {
        TableName: tableName,
        Key: { submissionId: submissionId }
    };
    const getItemCommand = new GetCommand(getParams);
    const { Item: submissionItem } = await ddbDocClient.send(getItemCommand);

    if (!submissionItem) {
      throw new Error(`Submission with ID ${submissionId} not found in DynamoDB.`);
    }
    console.log("Found submission item:", submissionItem);

    // Extract S3 info directly from the fields
    const { 
      s3Bucket,
      s3Prefix,
      executablePath,
      operatingSystem = 'WINDOWS_2022'
    } = submissionItem;

    if (!s3Bucket || !s3Prefix) {
        throw new Error(`Missing required information for submission ${submissionId}`);
    }

    // Clean up s3Prefix by removing s3://bucket-name/ if present
    const cleanPrefix = s3Prefix.replace(new RegExp(`^s3://${s3Bucket}/`), '');

    // Use the provided executablePath or fall back to environment variable
    const finalExecutablePath = executablePath || process.env.GAMELIFT_EXECUTABLE_PATH || 'MyProject.exe';

    const stepFunctionInput = {
      submissionId,
      s3Bucket,
      s3Prefix: cleanPrefix,
      operatingSystem,
      executablePath: finalExecutablePath,
    };

    const params: StartExecutionCommandInput = {
      stateMachineArn: stateMachineArn,
      input: JSON.stringify(stepFunctionInput),
      name: `provision-${submissionId}-${Date.now()}`
    };

    console.log("Starting Step Function execution with input:", stepFunctionInput);
    const command = new StartExecutionCommand(params);
    const response = await sfn.send(command);
    console.log("Step Function execution started:", response);

    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: "Provisioning process started successfully.",
        executionArn: response.executionArn,
        submissionId: submissionId,
      })
    };

  } catch (error: any) {
    console.error(`Error starting provisioning for ${submissionId}:`, error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: "Failed to start provisioning process.", error: error.message })
    };
  }
};
