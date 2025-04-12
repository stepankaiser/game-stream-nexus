// src/lib/awsService.ts (or your preferred file path and name)

// Remove S3Client import if no longer needed by other functions
// import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'; // Import SES components
import { GameLiftStreamsClient, StartStreamSessionCommand, CreateApplicationCommand, CreateApplicationCommandInput, RuntimeEnvironmentType } from '@aws-sdk/client-gameliftstreams';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
// Remove Upload import
// import { Upload } from "@aws-sdk/lib-storage";
// Remove FetchHttpHandler import if S3Client is removed
// import { FetchHttpHandler } from "@aws-sdk/fetch-http-handler";
import AWS from 'aws-sdk'; // Import AWS SDK v2

// --- AWS SDK v3 Configuration & Client Initialization ---

const region = import.meta.env.VITE_AWS_REGION;
const s3BucketName = import.meta.env.VITE_S3_BUCKET_NAME;
const accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const dynamoDbTableName = import.meta.env.VITE_DYNAMODB_TABLE_NAME;
const sesSenderEmail = import.meta.env.VITE_SES_SENDER_EMAIL; 

// Debug logs
console.log("VITE_AWS_REGION:", region);
console.log("VITE_S3_BUCKET_NAME:", s3BucketName);
console.log("VITE_AWS_ACCESS_KEY_ID:", accessKeyId ? "Loaded" : "Missing");
console.log("VITE_AWS_SECRET_ACCESS_KEY:", secretAccessKey ? "Loaded" : "Missing");
console.log("VITE_DYNAMODB_TABLE_NAME:", dynamoDbTableName);
console.log("VITE_SES_SENDER_EMAIL:", sesSenderEmail); 

// Initialize v3 clients
const gameliftStreamsClient = region && accessKeyId && secretAccessKey
  ? new GameLiftStreamsClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })
  : null;

const ddbClient = region && accessKeyId && secretAccessKey
  ? new DynamoDBClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })
  : null;

const marshallOptions = { removeUndefinedValues: true };
const unmarshallOptions = {};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = ddbClient ? DynamoDBDocumentClient.from(ddbClient, translateConfig) : null;

const sesClient = region && accessKeyId && secretAccessKey
  ? new SESClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })
  : null;

console.log("GameLiftStreams v3 Client initialized:", !!gameliftStreamsClient);
console.log("DynamoDB v3 Client initialized:", !!ddbClient);
console.log("SES v3 Client initialized:", !!sesClient); 
console.log("DynamoDB Table Name:", dynamoDbTableName);

// Log GameLift specific vars
console.log("VITE_GAMELIFT_STREAM_GROUP_ID:", import.meta.env.VITE_GAMELIFT_STREAM_GROUP_ID);
console.log("VITE_GAMELIFT_PLATFORM:", import.meta.env.VITE_GAMELIFT_PLATFORM);
// ... other gamelift vars ...
console.log("VITE_GAMELIFT_EXECUTABLE_PATH:", import.meta.env.VITE_GAMELIFT_EXECUTABLE_PATH);


// --- AWS Service Functions (v3) ---

/**
 * Function to save submission metadata to AWS DynamoDB (v3).
 */
export const saveSubmissionToDynamoDB = async (
  submissionId: string,
  email: string,
  country: string,
  originalFileName: string,
  gameBuildUrlOrPrefix?: string,
  executablePath?: string  // Add executablePath parameter
): Promise<{ success: boolean; submissionId: string; itemData?: any, error?: string }> => {
  if (!ddbDocClient || !dynamoDbTableName) {
    console.error("DynamoDB v3 client or table name not configured.");
    return { success: false, submissionId, error: "DynamoDB not configured." };
  }

  const submittedAt = new Date().toISOString();
  const submissionType = gameBuildUrlOrPrefix?.startsWith('s3://') ? 'upload' : 'url';

  const itemToSave: any = {
    submissionId: submissionId,
    email: email,
    country: country,
    submittedAt: submittedAt,
    status: 'received', 
    submissionType: submissionType,
  };

  if (submissionType === 'upload') {
    itemToSave.originalFileName = originalFileName;
    itemToSave.s3Bucket = s3BucketName;
    itemToSave.s3Prefix = gameBuildUrlOrPrefix;
    itemToSave.executablePath = executablePath || import.meta.env.VITE_GAMELIFT_EXECUTABLE_PATH;  // Use env var as fallback
    itemToSave.status = 'pending_gamelift_app';
  } else if (submissionType === 'url') {
    itemToSave.gameBuildUrl = gameBuildUrlOrPrefix;
    itemToSave.status = 'pending_stream';
  } else {
    return { success: false, submissionId, error: "Could not determine submission type." };
  }

  // --- Step 1: Save Initial Record (v3) ---
  try {
    const putParams = { 
      TableName: dynamoDbTableName,
      Item: itemToSave,
      ConditionExpression: "attribute_not_exists(submissionId)" 
    };
    console.log(`Saving initial submission record to DynamoDB (v3): ${submissionId}`);
    await ddbDocClient.send(new PutCommand(putParams)); 
    console.log('Initial submission record saved successfully (v3).');
    // Return success after the initial save
    return { success: true, submissionId, itemData: itemToSave }; 

  } catch (error: any) {
    console.error(`Error saving initial submission ${submissionId} to DynamoDB (v3):`, error);
    if (error.name === 'ConditionalCheckFailedException') { 
      return { success: false, submissionId, error: `Submission ID ${submissionId} already exists.` };
    }
    return { success: false, submissionId, error: error.message || 'Failed to save initial submission to DynamoDB (v3)' };
  }
};

/**
 * Function to send a confirmation email using AWS SES (v3).
 */
export const sendConfirmationEmail = async (
    recipientEmail: string,
    submissionId: string,
    submissionType: 'upload' | 'url',
    details: { fileName?: string; gameBuildUrl?: string }
) => {
    if (!sesClient || !sesSenderEmail) {
        console.error("SES v3 client or sender email not configured. Skipping email.");
        return;
    }

    const subject = "Your Game Build Submission - Next Steps";
    const adminSubject = "New Game Build Submission Received";
    // --- Email content (remains the same) ---
    let bodyText = `Hello,\n\nThank you for submitting your game build! We've received it successfully.\n\n`;
    bodyText += `Submission ID: ${submissionId}\n`;
    if (submissionType === 'upload' && details.fileName) {
        bodyText += `Uploaded File: ${details.fileName}\n`;
    } else if (submissionType === 'url' && details.gameBuildUrl) {
        bodyText += `Submitted URL: ${details.gameBuildUrl}\n`;
    }
    bodyText += `\nHere's what happens next:\n\n`;
    bodyText += `1. 24-Hour Setup:\n   Our team will prepare the cloud streaming environment using Amazon GameLift Streams technology within 24 hours.\n\n`;
    bodyText += `2. Receive Link:\n   We'll send you a secure link to access your game in the cloud. No downloads or installations required.\n\n`;
    bodyText += `3. Play & Evaluate:\n   Experience your game through cloud streaming and evaluate if this technology fits your needs and use cases.\n\n`;
    bodyText += `If you have any questions in the meantime, please don't hesitate to contact us at stepan@remangu.com.\n\n`;
    bodyText += `Best regards,\nThe Team`;

    // Admin email content
    let adminBodyText = `New Game Build Submission Received\n\n`;
    adminBodyText += `Submission ID: ${submissionId}\n`;
    adminBodyText += `User Email: ${recipientEmail}\n`;
    if (submissionType === 'upload' && details.fileName) {
        adminBodyText += `Uploaded File: ${details.fileName}\n`;
    } else if (submissionType === 'url' && details.gameBuildUrl) {
        adminBodyText += `Submitted URL: ${details.gameBuildUrl}\n`;
    }
    adminBodyText += `\nPlease process this submission within 24 hours.\n`;

    let bodyHtml = `<p>Hello,</p>`;
    bodyHtml += `<p>Thank you for submitting your game build! We've received it successfully.</p>`;
    bodyHtml += `<p><strong>Submission ID:</strong> ${submissionId}</p>`;
    if (submissionType === 'upload' && details.fileName) {
        bodyHtml += `<p><strong>Uploaded File:</strong> ${details.fileName}</p>`;
    } else if (submissionType === 'url' && details.gameBuildUrl) {
        bodyHtml += `<p><strong>Submitted URL:</strong> ${details.gameBuildUrl}</p>`;
    }
    bodyHtml += `<p>Here's what happens next:</p>`;
    bodyHtml += `<ol style="padding-left: 20px;">`;
    bodyHtml += `<li style="margin-bottom: 10px;"><strong>24-Hour Setup:</strong><br>Our team will prepare the cloud streaming environment using Amazon GameLift Streams technology within 24 hours.</li>`;
    bodyHtml += `<li style="margin-bottom: 10px;"><strong>Receive Link:</strong><br>We'll send you a secure link to access your game in the cloud. No downloads or installations required.</li>`;
    bodyHtml += `<li style="margin-bottom: 10px;"><strong>Play & Evaluate:</strong><br>Experience your game through cloud streaming and evaluate if this technology fits your needs and use cases.</li>`;
    bodyHtml += `</ol>`; // Close the ordered list
    bodyHtml += `<p>If you have any questions in the meantime, please don't hesitate to contact us at <a href="mailto:stepan@remangu.com">stepan@remangu.com</a>.</p>`;
    bodyHtml += `<p>Best regards,<br>The Remangu Team</p>`;

    // User email params (v3)
    const userParams = { 
        Source: sesSenderEmail,
        Destination: { ToAddresses: [recipientEmail] },
        Message: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
                Text: { Data: bodyText, Charset: 'UTF-8' },
                Html: { Data: bodyHtml, Charset: 'UTF-8' }
            }
        }
    };
    
    // Admin email params (v3)
    const adminParams = { 
        Source: sesSenderEmail,
        Destination: { ToAddresses: [sesSenderEmail] }, 
        Message: {
            Subject: { Data: adminSubject, Charset: 'UTF-8' },
            Body: { Text: { Data: adminBodyText, Charset: 'UTF-8' } }
        }
    };

    try {
        console.log(`Sending confirmation email to ${recipientEmail} (v3)...`);
        const userCommand = new SendEmailCommand(userParams); // Create v3 command
        const userResponse = await sesClient.send(userCommand); // Use v3 send
        console.log("User confirmation email sent (v3), SES Response:", JSON.stringify(userResponse, null, 2));

        console.log(`Sending admin notification email to ${sesSenderEmail} (v3)...`);
        const adminCommand = new SendEmailCommand(adminParams); // Create v3 command
        const adminResponse = await sesClient.send(adminCommand); // Use v3 send
        console.log("Admin notification email sent (v3), SES Response:", JSON.stringify(adminResponse, null, 2));

    } catch (error) {
        console.error("Error sending SES email (v3):", error);
    }
};

/**
 * Retrieves submission details including the GameLift ARN (v3).
 */
export const getSubmissionDetails = async (submissionId: string): Promise<any | null> => {
  if (!ddbDocClient || !dynamoDbTableName) {
    console.error("DynamoDB v3 client or table name not configured.");
    return null;
  }

  try {
    const params = {
      TableName: dynamoDbTableName,
      Key: {
        submissionId: submissionId,
      },
      ConsistentRead: true // Add this to ensure we get the latest data
    };
    console.log("[getSubmissionDetails] Fetching with params:", JSON.stringify(params, null, 2));
    const command = new GetCommand(params);
    const response = await ddbDocClient.send(command);
    console.log("[getSubmissionDetails] Raw DynamoDB response:", JSON.stringify(response, null, 2));
    console.log("[getSubmissionDetails] Item details:", {
      status: response.Item?.status,
      applicationArn: response.Item?.applicationArn,
      streamGroupId: response.Item?.streamGroupId,
      submissionId: response.Item?.submissionId,
      updatedAt: response.Item?.updatedAt
    });
    return response.Item;
  } catch (error) {
    console.error('[getSubmissionDetails] Error fetching details:', error);
    throw error;
  }
};

/**
 * Helper Function to Create GameLift Application (v3).
 */
export const createGameLiftApplication = async (
  submissionId: string,
  applicationSourceUri: string 
): Promise<string | null> => {
  if (!gameliftStreamsClient) {
    console.error("GameLift Streams v3 client not initialized.");
    return null; 
  }

  const platform = import.meta.env.VITE_GAMELIFT_PLATFORM; // e.g., "WINDOWS"
  const runtimeVersion = import.meta.env.VITE_GAMELIFT_RUNTIME_VERSION; // e.g., "2022"
  const executablePath = import.meta.env.VITE_GAMELIFT_EXECUTABLE_PATH; // e.g., "Game/Game.exe"

  if (!platform || !runtimeVersion || !executablePath || !applicationSourceUri) {
    console.error("Missing required GameLift environment variables or parameters for CreateApplication (v3).");
    throw new Error("Missing required GameLift configuration (v3).");
  }

  try {
    console.log(`Attempting to create GameLift Application for submission ${submissionId} (v3)...`);
    console.log(`Using S3 Source URI (Folder): ${applicationSourceUri}`);

    const description = `GameLift Application for Submission ${submissionId}`;

    // Use v3 input structure
    const commandInput: CreateApplicationCommandInput = { // Use specific v3 input type
      Description: description,         
      RuntimeEnvironment: {              
        Type: platform as RuntimeEnvironmentType, // Cast may be needed
        Version: runtimeVersion,
      },
      ExecutablePath: executablePath,    
      ApplicationSourceUri: applicationSourceUri, 
      Tags: { // v3 uses an object for tags
        SubmissionId: submissionId,
        CreatedBy: "GameStreamNexusApp"
      },
    };

    console.log('Sending CreateApplicationCommand (v3) with input:', JSON.stringify(commandInput, null, 2));

    const command = new CreateApplicationCommand(commandInput); // Create v3 command
    const response = await gameliftStreamsClient.send(command); // Use v3 send

    console.log(`GameLift Application creation initiated successfully (v3) for submission ${submissionId}. ARN: ${response.Arn}`);
    return response.Arn || null;

  } catch (error: any) {
    console.error(`Error creating GameLift Application (v3) for submission ${submissionId}:`, error);
    throw error; 
  }
};

// --- Function to INITIATE Stream Session (v3 - Modified) ---
// Returns ARN and initial status, polling happens separately
export const startStreamSession = async (
  applicationArn: string,
  streamGroupId: string,
  signalRequest: string
): Promise<{ streamSessionArn: string; initialStatus: string }> => {
  if (!gameliftStreamsClient) {
    throw new Error("GameLift Streams v3 client not initialized.");
  }

  console.log(`Initiating StartStreamSession with App: ${applicationArn}, Group: ${streamGroupId} (v3)`);
  let initialResponse: any;
  try {
      const playerId = `player-${uuidv4()}`; // Generate PlayerId as per sample
      const startCommandInput = { 
          Identifier: streamGroupId, 
          ApplicationIdentifier: applicationArn,
          PlayerId: playerId, // Add PlayerId
          Protocol: "WebRTC",
          SignalRequest: signalRequest,
      };
      const startCommand = new StartStreamSessionCommand(startCommandInput as any); 
      console.log("Sending StartStreamSessionCommand (v3):", startCommand.input);
      initialResponse = await gameliftStreamsClient.send(startCommand) as any; 
      console.log("Initial StartStreamSession RAW response (v3):", JSON.stringify(initialResponse, null, 2));

      const streamSessionArn = initialResponse?.Arn;
      const initialStatus = initialResponse?.Status;

      if (!streamSessionArn || !initialStatus) {
        console.error("Initial StartStreamSession response (v3) missing Arn or Status.", initialResponse);
        throw new Error("Failed to get Stream Session ARN or Status from initial response.");
      }
      
      // Return ARN and Status for frontend to poll
      console.log(`Stream session initiated. ARN: ${streamSessionArn}, Status: ${initialStatus}`);
      return { streamSessionArn, initialStatus };

  } catch (error: any) {
    console.error(`Error during initial StartStreamSession call (v3) for App ${applicationArn}, Group ${streamGroupId}:`, error);
    throw error; // Re-throw to be caught by frontend
  }
};

/**
 * Get the status of a GameLift Stream Session using the provided ARN.
 * Calls the configured Poller Lambda function via its HTTP endpoint (API Gateway or Function URL).
 */
export async function getStreamSessionStatus(sessionArn: string): Promise<any> {
  const lambdaUrl = import.meta.env.VITE_POLLER_LAMBDA_URL;
  console.log("[getStreamSessionStatus] Starting with ARN:", sessionArn);
  console.log("[getStreamSessionStatus] Lambda URL:", lambdaUrl);

  if (!lambdaUrl) {
    // Fallback for safety, but ideally VITE_POLLER_LAMBDA_URL should be set
    console.warn("Warning: VITE_POLLER_LAMBDA_URL is not set. Falling back to potentially stale hardcoded URL.");
    const fallbackUrl = "https://1wgy408by5.execute-api.eu-central-1.amazonaws.com/poll"; 
    console.log(`Calling Poller Lambda (Fallback URL: ${fallbackUrl}) for ARN: ${sessionArn}`);
    return callLambdaViaHttp(fallbackUrl, sessionArn);
  } else {
      console.log(`Calling Poller Lambda (URL: ${lambdaUrl}) for ARN: ${sessionArn}`);
      return callLambdaViaHttp(lambdaUrl, sessionArn);
  }
}

// Helper function to encapsulate the fetch logic
async function callLambdaViaHttp(url: string, sessionArn: string): Promise<any> {
   try {
     const response = await fetch(url, {
       method: 'POST',
       mode: 'cors',
       credentials: 'omit',
       headers: {
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ streamSessionArn: sessionArn }),
     });

     console.log(`Lambda response status: ${response.status}`);

     if (!response.ok) {
       let errorBodyText = await response.text(); // Get raw text
       let errorBodyJson = {};
       try {
         errorBodyJson = JSON.parse(errorBodyText); // Try parsing as JSON
         console.error("Lambda returned error JSON:", errorBodyJson);
       } catch (parseError) {
         console.error("Lambda returned non-OK status, body not valid JSON:", errorBodyText);
       }
       // Throw an error including the status and body text
       throw new Error(`Lambda function returned status ${response.status}. Body: ${errorBodyText}`);
     }

     const responseData = await response.json(); // Parse the successful JSON response (outer layer)
     console.log("Lambda Raw Response Body (Outer JSON Parsed):", responseData);

     // Check if the Lambda response itself indicates an error (e.g., non-200 statusCode in body)
     if (responseData.statusCode && responseData.statusCode !== 200) {
        console.error(`Lambda function internal status code ${responseData.statusCode}. Body:`, responseData.body);
        throw new Error(`Lambda execution failed internally with status ${responseData.statusCode}`);
     }

     // Assuming the actual GameLift data is in the 'body' field and needs parsing
     if (responseData.body) {
         try {
             const gameliftResponse = JSON.parse(responseData.body);
             console.log('Lambda response body (parsed inner - GameLift data):', gameliftResponse);

             // Check for the nested StreamSession structure (as expected from the deployed Lambda)
             if (gameliftResponse && gameliftResponse.StreamSession) {
                 console.log("Extracted StreamSession:", gameliftResponse.StreamSession);
                 // Return the object containing StreamSession, matching GameStream.tsx expectation
                 return gameliftResponse;
             } else {
                 console.warn("Lambda response body did not contain expected StreamSession structure:", gameliftResponse);
                 // Return the parsed body anyway for debugging, but it might cause issues downstream
                 return gameliftResponse;
             }
         } catch (innerParseError) {
             console.error("Failed to parse inner body from Lambda response:", responseData.body, innerParseError);
             throw new Error("Failed to parse the GameLift data from the Lambda response body.");
         }
     } else {
         // If there's no 'body', the API Gateway/Function URL might be returning the raw GetStreamSession result directly.
         console.warn("Lambda response did not have a 'body' field. Assuming outer response is raw GameLift data.", responseData);

         // Check if StreamSession is MISSING (as expected for raw response) AND if essential fields exist
         if (!responseData.StreamSession && responseData.Arn && responseData.Status) {
             console.log("Confirmed raw response structure: No body, no StreamSession key, but Arn and Status found. Returning outer response object.");
             // Return the whole responseData object. GameStream.tsx expects the object containing the fields.
             return responseData;
         } else {
            // If StreamSession *is* present unexpectedly, or Arn/Status are missing, the structure is wrong.
            console.error("Lambda response structure is unexpected. Expected raw data (no body, no StreamSession key) but found StreamSession key OR missing Arn/Status:", responseData);
            throw new Error("Unexpected Lambda response structure received.");
         }
     }

   } catch (error: any) {
     console.error(`Error calling Poller Lambda at ${url} for ARN ${sessionArn}:`, error);
     // Re-throw the error to be handled by the frontend polling logic
     throw new Error(`Failed to get stream session status via Lambda HTTP call: ${error.message || 'Unknown fetch error'}`);
   }
}