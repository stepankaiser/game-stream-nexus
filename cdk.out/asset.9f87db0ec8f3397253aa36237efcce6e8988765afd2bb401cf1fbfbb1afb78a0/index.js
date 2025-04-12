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

// infra/lambdas/createApp.ts
var createApp_exports = {};
__export(createApp_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(createApp_exports);
var import_client_gameliftstreams = require("@aws-sdk/client-gameliftstreams");

// node_modules/uuid/dist/esm/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

// node_modules/uuid/dist/esm/rng.js
var import_crypto = require("crypto");
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    (0, import_crypto.randomFillSync)(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/uuid/dist/esm/native.js
var import_crypto2 = require("crypto");
var native_default = { randomUUID: import_crypto2.randomUUID };

// node_modules/uuid/dist/esm/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// infra/lambdas/createApp.ts
var gameliftStreams = new import_client_gameliftstreams.GameLiftStreamsClient({});
var handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  const { submissionId, s3Bucket, s3Prefix, operatingSystem } = event;
  if (!submissionId || !s3Bucket || !s3Prefix || !operatingSystem) {
    throw new Error("Missing required input: submissionId, s3Bucket, s3Prefix, operatingSystem");
  }
  const appDescription = `GameLift Streams application for submission ${submissionId}`;
  const s3SourceUri = `s3://${s3Bucket}/${s3Prefix}`;
  const executablePath = process.env.VITE_GAMELIFT_EXECUTABLE_PATH || "q2rtx.exe";
  const launchParameters = process.env.VITE_GAMELIFT_LAUNCH_PARAMS || "";
  let runtimeEnv = void 0;
  switch (operatingSystem) {
    case "WINDOWS_2016":
      runtimeEnv = { Type: "WINDOWS", Version: "2016" };
      break;
    case "WINDOWS_2022":
      runtimeEnv = { Type: "WINDOWS", Version: "2022" };
      break;
    case "UBUNTU_22_04_LTS":
      runtimeEnv = { Type: "UBUNTU", Version: "22_04_LTS" };
      break;
    case "PROTON_20241007":
      runtimeEnv = { Type: "PROTON", Version: "20241007" };
      break;
    case "PROTON_20230704":
      runtimeEnv = { Type: "PROTON", Version: "20230704" };
      break;
    // Add other mappings as needed
    default:
      console.warn(`Unsupported OperatingSystem value: ${operatingSystem}. Defaulting or throwing error might be needed.`);
      runtimeEnv = { Type: "WINDOWS", Version: "2022" };
  }
  if (!runtimeEnv) {
    throw new Error(`Could not determine RuntimeEnvironment for OS: ${operatingSystem}`);
  }
  const params = {
    ClientToken: v4_default(),
    Description: appDescription,
    RuntimeEnvironment: runtimeEnv,
    ExecutablePath: executablePath,
    ApplicationSourceUri: s3SourceUri,
    // LaunchParameters: launchParameters, // Removed based on linter error
    Tags: {
      "SubmissionId": submissionId
    }
  };
  try {
    console.log("Calling GameLiftStreams CreateApplication with params:", params);
    const command = new import_client_gameliftstreams.CreateApplicationCommand(params);
    const response = await gameliftStreams.send(command);
    console.log("CreateApplication successful:", response);
    if (!response.Arn) {
      throw new Error("CreateApplication response did not include expected Application ARN (response.Arn).");
    }
    return {
      ApplicationArn: response.Arn,
      SubmissionId: submissionId
    };
  } catch (error) {
    console.error(`Error calling GameLiftStreams CreateApplication for S3 source ${s3SourceUri}:`, error);
    throw new Error(`CreateApplication failed: ${error.message}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
