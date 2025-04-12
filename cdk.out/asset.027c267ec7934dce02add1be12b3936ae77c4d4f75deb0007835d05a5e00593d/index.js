"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// infra/lambdas/startStepFunction.ts
var startStepFunction_exports = {};
__export(startStepFunction_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(startStepFunction_exports);
var import_client_sfn = require("@aws-sdk/client-sfn");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var sfn = new import_client_sfn.SFNClient({});
var ddbClient = new import_client_dynamodb.DynamoDBClient({});
var ddbDocClient = import_lib_dynamodb.DynamoDBDocumentClient.from(ddbClient);
var stateMachineArn = process.env.STATE_MACHINE_ARN;
var tableName = process.env.DYNAMODB_TABLE_NAME;
var handler = async (event) => {
  console.log("Received API Gateway event:", JSON.stringify(event, null, 2));
  if (!stateMachineArn) {
    throw new Error("STATE_MACHINE_ARN environment variable is not set.");
  }
  if (!tableName) {
    throw new Error("DYNAMODB_TABLE_NAME environment variable is not set.");
  }
  let requestBody;
  try {
    requestBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    if (!requestBody || !requestBody.submissionId) {
      throw new Error("Missing submissionId in request body.");
    }
  } catch (e) {
    console.error("Failed to parse request body:", e);
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body", error: e.message }) };
  }
  const { submissionId } = requestBody;
  try {
    console.log(`Fetching details for submission ${submissionId} from ${tableName}...`);
    const getParams = {
      TableName: tableName,
      Key: { submissionId }
    };
    const getItemCommand = new import_lib_dynamodb.GetCommand(getParams);
    const { Item: submissionItem } = await ddbDocClient.send(getItemCommand);
    if (!submissionItem) {
      throw new Error(`Submission with ID ${submissionId} not found in DynamoDB.`);
    }
    console.log("Found submission item:", submissionItem);
    const s3Uri = submissionItem.s3BuildUri;
    if (!s3Uri || !s3Uri.startsWith("s3://")) {
      throw new Error(`Invalid or missing s3BuildUri found for submission ${submissionId}`);
    }
    const uriParts = s3Uri.substring(5).split("/");
    const s3Bucket = uriParts.shift();
    const s3Prefix = uriParts.join("/");
    if (!s3Bucket || !s3Prefix) {
      throw new Error(`Could not parse S3 bucket/prefix from URI: ${s3Uri}`);
    }
    const operatingSystem = submissionItem.operatingSystem || "WINDOWS_2016";
    const stepFunctionInput = {
      submissionId,
      s3Bucket,
      // s3Key: s3KeyForZip, // REMOVE incorrect key
      s3Prefix,
      // Pass the actual folder prefix
      operatingSystem
    };
    const params = {
      stateMachineArn,
      input: JSON.stringify(stepFunctionInput),
      name: `provision-${submissionId}-${Date.now()}`
      // Optional: unique execution name
    };
    console.log("Starting Step Function execution with input:", stepFunctionInput);
    const command = new import_client_sfn.StartExecutionCommand(params);
    const response = await sfn.send(command);
    console.log("Step Function execution started:", response);
    return {
      statusCode: 202,
      // Accepted
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        message: "Provisioning process started successfully.",
        executionArn: response.executionArn,
        submissionId
      })
    };
  } catch (error) {
    console.error(`Error starting provisioning for ${submissionId}:`, error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: "Failed to start provisioning process.", error: error.message })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
