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

// infra/lambdas/associateApp.ts
var associateApp_exports = {};
__export(associateApp_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(associateApp_exports);
var import_client_gameliftstreams = require("@aws-sdk/client-gameliftstreams");
var gameliftStreams = new import_client_gameliftstreams.GameLiftStreamsClient({});
var handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  const { ApplicationArn, submissionId } = event;
  const streamGroupId = process.env.STREAM_GROUP_ID;
  if (!ApplicationArn || !streamGroupId) {
    throw new Error("Missing required input: ApplicationArn or STREAM_GROUP_ID environment variable");
  }
  try {
    console.log(`Associating application ${ApplicationArn} with stream group ${streamGroupId}`);
    const command = new import_client_gameliftstreams.AssociateApplicationsCommand({
      Identifier: streamGroupId,
      ApplicationIdentifiers: [ApplicationArn]
    });
    const response = await gameliftStreams.send(command);
    console.log("AssociateApplications successful:", response);
    return {
      ApplicationArn,
      StreamGroupId: streamGroupId,
      submissionId
    };
  } catch (error) {
    console.error(`Error associating application with stream group:`, error);
    throw new Error(`AssociateApplications failed: ${error.message}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
