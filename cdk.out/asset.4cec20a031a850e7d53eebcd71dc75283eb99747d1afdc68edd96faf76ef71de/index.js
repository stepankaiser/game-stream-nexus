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

// infra/lambdas/updateDb.ts
var updateDb_exports = {};
__export(updateDb_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(updateDb_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var client = new import_client_dynamodb.DynamoDBClient({});
var ddbDocClient = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
var tableName = process.env.DYNAMODB_TABLE_NAME;
var handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  const { submissionId, applicationArn, status, errorMessage } = event;
  if (!tableName) {
    throw new Error("DYNAMODB_TABLE_NAME environment variable is not set.");
  }
  if (!submissionId || !status || status === "READY" && !applicationArn) {
    throw new Error("Missing required input: submissionId, status, and applicationArn (if status is READY)");
  }
  const params = {
    TableName: tableName,
    Key: {
      submissionId
    },
    UpdateExpression: "set submissionStatus = :s, applicationArn = :a, lastUpdatedAt = :ts",
    ExpressionAttributeValues: {
      ":s": status,
      ":a": applicationArn || null,
      // Store null if not provided (e.g., on failure)
      ":ts": (/* @__PURE__ */ new Date()).toISOString()
    },
    ReturnValues: "UPDATED_NEW"
    // Optional: return updated values
  };
  if (errorMessage) {
    if (!params.ExpressionAttributeValues) {
      params.ExpressionAttributeValues = {};
    }
    params.UpdateExpression += ", errorMessage = :e";
    params.ExpressionAttributeValues[":e"] = errorMessage;
  }
  try {
    console.log(`Updating DynamoDB item ${submissionId} with status ${status}...`);
    const command = new import_lib_dynamodb.UpdateCommand(params);
    const response = await ddbDocClient.send(command);
    console.log("DynamoDB update successful:", response);
    return {
      message: `Successfully updated submission ${submissionId} status to ${status}`,
      attributes: response.Attributes
    };
  } catch (error) {
    console.error(`Error updating DynamoDB for submission ${submissionId}:`, error);
    throw new Error(`DynamoDB update failed: ${error.message}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
