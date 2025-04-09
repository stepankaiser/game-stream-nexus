// src/lib/awsService.ts (or your preferred file path and name)

import { S3Client } from '@aws-sdk/client-s3'; // Keep S3Client
import { Upload } from "@aws-sdk/lib-storage"; // Import Upload
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'; // Import SES components
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';


// --- AWS Client Initialization ---

// filepath: /workspaces/game-stream-nexus/src/services/supabase.ts

// Read configuration from environment variables (set via Vite)
const region = import.meta.env.VITE_AWS_REGION;
const s3BucketName = import.meta.env.VITE_S3_BUCKET_NAME;
const accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const dynamoDbTableName = import.meta.env.VITE_DYNAMODB_TABLE_NAME;
const sesSenderEmail = import.meta.env.VITE_SES_SENDER_EMAIL; // Read SES sender email

// Debug logs to verify environment variables
console.log("VITE_AWS_REGION:", region);
console.log("VITE_S3_BUCKET_NAME:", s3BucketName);
console.log("VITE_AWS_ACCESS_KEY_ID:", accessKeyId ? "Loaded" : "Missing");
console.log("VITE_AWS_SECRET_ACCESS_KEY:", secretAccessKey ? "Loaded" : "Missing");
console.log("VITE_DYNAMODB_TABLE_NAME:", dynamoDbTableName);
console.log("VITE_SES_SENDER_EMAIL:", sesSenderEmail); // Log SES sender email
console.log("VITE_AWS_ACCESS_KEY_ID:", accessKeyId ? "Loaded" : "Missing");
console.log("VITE_AWS_SECRET_ACCESS_KEY:", secretAccessKey ? "Loaded" : "Missing");



// Basic validation - Crucial for identifying configuration issues early
if (!region || !s3BucketName || !accessKeyId || !secretAccessKey || !sesSenderEmail) {
    console.error("AWS configuration environment variables missing. Check VITE_AWS_REGION, VITE_S3_BUCKET_NAME, VITE_AWS_ACCESS_KEY_ID, VITE_AWS_SECRET_ACCESS_KEY, VITE_SES_SENDER_EMAIL");
}



// Basic validation - Crucial for identifying configuration issues early
if (!region || !s3BucketName || !dynamoDbTableName || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("AWS configuration environment variables missing. Check Codespaces secrets: AWS_REGION, S3_BUCKET_NAME, DYNAMODB_TABLE_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    // You might want to throw an error or have a default safe behavior depending on your application's needs
    // For example: throw new Error("AWS environment configuration is incomplete.");
}

// Initialize S3 Client with credentials
const s3Client = region
    ? new S3Client({
          region,
          credentials: {
              accessKeyId: accessKeyId || '',
              secretAccessKey: secretAccessKey || '',
          },
      })
    : null;

// Initialize DynamoDB Client and Document Client (only if region is available)
const ddbClient = region
  ? new DynamoDBClient({
      region,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    })
  : null;
const marshallOptions = { removeUndefinedValues: true }; // Remove undefined attributes during save
const unmarshallOptions = {};
const translateConfig = { marshallOptions, unmarshallOptions };
// Initialize the Document Client only if the base client was initialized
const ddbDocClient = ddbClient ? DynamoDBDocumentClient.from(ddbClient, translateConfig) : null;

// Initialize SES Client (only if region and credentials are available)
const sesClient = region && accessKeyId && secretAccessKey
  ? new SESClient({
      region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })
  : null;

console.log("DynamoDB Client initialized:", !!ddbClient);
console.log("SES Client initialized:", !!sesClient); // Log SES client status
console.log("DynamoDB Table Name:", dynamoDbTableName);
console.log("AWS Access Key ID:", accessKeyId ? "Loaded" : "Missing");
console.log("AWS Secret Access Key:", secretAccessKey ? "Loaded" : "Missing");


// --- AWS Service Functions ---

/**
 * Function to upload a game build file to AWS S3 using managed upload for progress.
 * Replaces the Supabase uploadGameBuild function.
 * @param onProgress Callback function to report progress (percentage 0-100).
 */
export const uploadGameBuildToS3 = async (
    file: File,
    email: string,
    onProgress?: (percentage: number) => void // Add optional progress callback
) => {
  // Ensure required config and client are available
  if (!s3Client || !s3BucketName) {
    throw new Error("S3 client or bucket name not configured due to missing environment variables.");
  }

  try {
    // Create a unique file key (path within the bucket)
    const timestamp = new Date().getTime();
    const fileExt = file.name.split('.').pop() || 'bin'; // Default to 'bin' if no extension
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedEmail}_${timestamp}.${fileExt}`;
    const fileKey = `game-builds/${fileName}`;

    // Debug the file object
    console.log("File object:", file);
    console.log("File type:", file.type);
    console.log("File size:", file.size);
    console.log("File instanceof Blob:", file instanceof Blob); // Keep for debugging if needed

    // Handle MIME type issues (optional, but can be useful)
    const contentType = file.type === 'application/x-apple-diskimage' ? 'application/octet-stream' : file.type || 'application/octet-stream';

    // Use the Upload class from lib-storage
    const parallelUploads3 = new Upload({
      client: s3Client,
      params: {
        Bucket: s3BucketName,
        Key: fileKey,
        Body: file, // Pass the File object directly, lib-storage handles streaming
        ContentType: contentType,
        CacheControl: 'max-age=3600', // Optional: set cache control
        // ChecksumAlgorithm: 'CRC32' // Commented out to avoid checksum mismatch issue with SDK update
      },

      // Optional: Adjust queue size and part size for performance
      // queueSize: 4, // Number of concurrent parts uploads
      // partSize: 1024 * 1024 * 5, // Part size in bytes (min 5MB for S3 multipart)

      // Enable progress reporting
      leavePartsOnError: false, // Clean up parts on error
    });

    parallelUploads3.on("httpUploadProgress", (progress) => {
      if (progress.loaded && progress.total && onProgress) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        onProgress(percentage);
        console.log(`Upload Progress: ${percentage}%`); // Log progress
      } else {
         console.log("Upload Progress:", progress); // Log raw progress if needed
      }
    });

    // Perform the upload
    const response = await parallelUploads3.done();

    // Check the response structure from lib-storage Upload
    // It might differ slightly from PutObjectCommand response
    // Typically includes ETag, Location, Key, Bucket
    console.log(`Successfully uploaded ${fileName} to s3://${s3BucketName}/${fileKey}. Response:`, response);

    // Return the necessary details
    return {
      s3Bucket: s3BucketName,
      s3Key: fileKey,
      fileName: fileName,
      // ETag might be nested differently, adjust if needed based on 'response' structure
      eTag: response.ETag,
      location: response.Location, // Location URL might also be useful
    };
  } catch (error: unknown) {
    console.error("Error uploading file to S3:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`S3 Upload Failed: ${errorMessage}`);
  }
};

/**
 * Function to save submission metadata to AWS DynamoDB.
 * Replaces the Supabase saveSubmission function.
 */
export const saveSubmissionToDynamoDB = async (
  email: string,
  country: string,
  s3Bucket?: string, // Optional: Passed from S3 upload
  s3Key?: string,    // Optional: Passed from S3 upload
  originalOrUploadedFileName?: string, // Optional: Passed from S3 upload
  gameBuildUrl?: string // Optional: Passed if URL submission
) => {
  // Ensure required config and client are available
  if (!ddbDocClient || !dynamoDbTableName) {
      throw new Error("DynamoDB client or table name not configured due to missing environment variables.");
  }

  try {
    // Generate a unique identifier for the DynamoDB item
    const submissionId = uuidv4();
    const submittedAt = new Date().toISOString();

    // Prepare the item structure for DynamoDB
    // Determine submission type based on provided arguments
    const submissionType = gameBuildUrl ? 'url' : 'upload';

    // Prepare the item structure for DynamoDB
    const itemToSave: { [key: string]: any } = { // Use index signature for flexibility
      submissionId: submissionId,        // Primary Key
      email: email,
      country: country,
      submissionType: submissionType,    // Store how it was submitted
      status: 'pending',               // Initial status
      submittedAt: submittedAt,          // Timestamp
      // Conditionally add S3 details or URL
      ...(submissionType === 'upload' && s3Bucket && s3Key && originalOrUploadedFileName && {
        s3Bucket: s3Bucket,
        s3Key: s3Key,
        originalFileName: originalOrUploadedFileName,
      }),
      ...(submissionType === 'url' && gameBuildUrl && {
        gameBuildUrl: gameBuildUrl,
      }),
      // Add any other common fields
    };

    // Validate that we have the necessary data for the determined type
    if (submissionType === 'upload' && (!s3Bucket || !s3Key || !originalOrUploadedFileName)) {
        throw new Error("Missing S3 details for upload submission type.");
    }
    if (submissionType === 'url' && !gameBuildUrl) {
        throw new Error("Missing URL for url submission type.");
    }


    // Prepare the DynamoDB Put command parameters
    const params = {
      TableName: dynamoDbTableName,
      Item: itemToSave,
      // ConditionExpression: 'attribute_not_exists(submissionId)' // Optional: Uncomment to prevent overwriting an existing ID
    };

    // Create and send the command
    const command = new PutCommand(params);
    await ddbDocClient.send(command); // PutCommand doesn't return the item by default

    console.log('Successfully saved submission to DynamoDB:', submissionId);

    // --- ADDED: Send Admin Notification Email ---
    try {
        await sendAdminNotificationEmail(itemToSave);
        console.log(`Admin notification email sent for submission ${submissionId}.`);
    } catch (adminEmailError) {
        console.error(`Failed to send admin notification email for submission ${submissionId}:`, adminEmailError);
        // Continue even if admin email fails
    }
    // --- END ADDED ---


    // Return confirmation and the data that was intended to be saved
    return {
        success: true,
        submissionId: submissionId,
        itemData: itemToSave // Return the saved item data for potential use in UI
    };

  } catch (error: unknown) {
    console.error('Error saving submission to DynamoDB:', error);
    // Re-throw a more specific error
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`DynamoDB Save Failed: ${errorMessage}`);
  }
};


/**
 * Function to send a confirmation email using AWS SES.
 */
export const sendConfirmationEmail = async (
    recipientEmail: string,
    submissionId: string,
    submissionType: 'upload' | 'url',
    details: { fileName?: string; gameBuildUrl?: string }
) => {
    // Ensure required config and client are available
    if (!sesClient || !sesSenderEmail) {
        console.error("SES client or sender email not configured. Skipping email.");
        // Decide if you want to throw an error or just log and continue
        // throw new Error("SES client or sender email not configured due to missing environment variables.");
        return; // Silently fail if not configured
    }

    const subject = "Your Game Build Submission - Next Steps";

    // --- Updated Email Content ---
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
    bodyText += `If you have any questions in the meantime, please don't hesitate to contact us at stepan@remangu.com.\n\n`; // Corrected email address
    bodyText += `Best regards,\nThe Team`;


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
    bodyHtml += `</ol>`;
    bodyHtml += `<p>If you have any questions in the meantime, please don't hesitate to contact us at <a href="mailto:stepan@remangu.com">stepan@remangu.com</a>.</p>`; // Corrected email address
    bodyHtml += `<p>Best regards,<br>The Remangu Team</p>`;
    // --- End of Updated Email Content ---


    const params = {
        Source: sesSenderEmail, // The verified 'From' address
        Destination: {
            ToAddresses: [recipientEmail], // The user's email
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8',
            },
            Body: {
                Text: {
                    Data: bodyText,
                    Charset: 'UTF-8',
                },
                Html: {
                    Data: bodyHtml,
                    Charset: 'UTF-8',
                },
            },
        },
        // Optional: ConfigurationSetName for tracking, ReplyToAddresses, etc.
    };

    try {
        console.log("Attempting to send email with params:", JSON.stringify(params, null, 2)); // Log parameters
        const command = new SendEmailCommand(params);
        const response = await sesClient.send(command); // Capture response
        console.log(`Confirmation email successfully sent to ${recipientEmail}. SES Response:`, JSON.stringify(response, null, 2)); // Log success response
    } catch (error: unknown) {
        console.error(`Error sending confirmation email via SES to ${recipientEmail}. Params Sent:`, JSON.stringify(params, null, 2)); // Log params on error
        console.error("Full SES Error:", error); // Log the full error object
        // Decide how to handle email failure - log, maybe notify admin, but likely don't fail the whole submission
        // const errorMessage = error instanceof Error ? error.message : String(error);
        // throw new Error(`SES Email Send Failed: ${errorMessage}`);
    }
};


// --- ADDED: Admin Notification Email Function ---
/**
 * Function to send an admin notification email about a new submission.
 */
const sendAdminNotificationEmail = async (submissionData: { [key: string]: any }) => {
    const adminEmail = "stepan@remangu.com"; // Admin email address

    // Ensure SES client and sender email are configured
    if (!sesClient || !sesSenderEmail) {
        console.error("SES client or sender email not configured. Skipping admin notification email.");
        return; // Silently fail if not configured
    }

    const subject = `New Game Build Submission Received (ID: ${submissionData.submissionId})`;

    // Construct email body with submission details
    let bodyText = `A new game build submission has been received:\\n\\n`;
    bodyText += `Submission ID: ${submissionData.submissionId}\\n`;
    bodyText += `Submitted At: ${new Date(submissionData.submittedAt).toLocaleString()}\\n`;
    bodyText += `Submitter Email: ${submissionData.email}\\n`;
    bodyText += `Country: ${submissionData.country}\\n`;
    bodyText += `Submission Type: ${submissionData.submissionType}\\n`;

    if (submissionData.submissionType === 'upload') {
        bodyText += `Original File Name: ${submissionData.originalFileName}\\n`;
        bodyText += `S3 Bucket: ${submissionData.s3Bucket}\\n`;
        bodyText += `S3 Key: ${submissionData.s3Key}\\n`;
    } else if (submissionData.submissionType === 'url') {
        bodyText += `Submitted URL: ${submissionData.gameBuildUrl}\\n`;
    }

    bodyText += `\\nStatus: ${submissionData.status}\\n`;
    bodyText += `\\nPlease review the submission in the system.\\n`;


    let bodyHtml = `<p>A new game build submission has been received:</p>`;
    bodyHtml += `<ul>`;
    bodyHtml += `<li><strong>Submission ID:</strong> ${submissionData.submissionId}</li>`;
    bodyHtml += `<li><strong>Submitted At:</strong> ${new Date(submissionData.submittedAt).toLocaleString()}</li>`;
    bodyHtml += `<li><strong>Submitter Email:</strong> ${submissionData.email}</li>`;
    bodyHtml += `<li><strong>Country:</strong> ${submissionData.country}</li>`;
    bodyHtml += `<li><strong>Submission Type:</strong> ${submissionData.submissionType}</li>`;

    if (submissionData.submissionType === 'upload') {
        bodyHtml += `<li><strong>Original File Name:</strong> ${submissionData.originalFileName}</li>`;
        bodyHtml += `<li><strong>S3 Bucket:</strong> ${submissionData.s3Bucket}</li>`;
        bodyHtml += `<li><strong>S3 Key:</strong> ${submissionData.s3Key}</li>`;
    } else if (submissionData.submissionType === 'url') {
        bodyHtml += `<li><strong>Submitted URL:</strong> <a href="${submissionData.gameBuildUrl}">${submissionData.gameBuildUrl}</a></li>`;
    }

    bodyHtml += `<li><strong>Status:</strong> ${submissionData.status}</li>`;
    bodyHtml += `</ul>`;
    bodyHtml += `<p>Please review the submission in the system.</p>`;


    const params = {
        Source: sesSenderEmail,
        Destination: {
            ToAddresses: [adminEmail],
        },
        Message: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
                Text: { Data: bodyText, Charset: 'UTF-8' },
                Html: { Data: bodyHtml, Charset: 'UTF-8' },
            },
        },
    };

    try {
        console.log(`Attempting to send admin notification email to ${adminEmail} for submission ${submissionData.submissionId}`);
        const command = new SendEmailCommand(params);
        await sesClient.send(command);
        console.log(`Admin notification email successfully sent for submission ${submissionData.submissionId}.`);
    } catch (error: unknown) {
        console.error(`Error sending admin notification email via SES for submission ${submissionData.submissionId}:`, error);
        // Re-throw or handle as needed, but currently logged above where called
        throw error; // Re-throw to be caught by the caller
    }
};
// --- END ADDED ---


// You can also export the raw clients or config if needed elsewhere, but it's often cleaner
// to just export the functions that use them, like above.
// export { s3Client, ddbDocClient, sesClient, s3BucketName, dynamoDbTableName, sesSenderEmail };
