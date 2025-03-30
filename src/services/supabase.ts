// src/lib/awsService.ts (or your preferred file path and name)

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// --- AWS Client Initialization ---

// filepath: /workspaces/game-stream-nexus/src/services/supabase.ts

// Read configuration from environment variables (set via Vite)
const region = import.meta.env.VITE_AWS_REGION;
const s3BucketName = import.meta.env.VITE_S3_BUCKET_NAME;
const accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const dynamoDbTableName = import.meta.env.VITE_DYNAMODB_TABLE_NAME;

// Debug logs to verify environment variables
console.log("VITE_AWS_REGION:", region);
console.log("VITE_S3_BUCKET_NAME:", s3BucketName);
console.log("VITE_AWS_ACCESS_KEY_ID:", accessKeyId ? "Loaded" : "Missing");
console.log("VITE_AWS_SECRET_ACCESS_KEY:", secretAccessKey ? "Loaded" : "Missing");
console.log("VITE_DYNAMODB_TABLE_NAME:", dynamoDbTableName);

// Basic validation - Crucial for identifying configuration issues early
if (!region || !s3BucketName || !accessKeyId || !secretAccessKey) {
    console.error("AWS configuration environment variables missing. Check VITE_AWS_REGION, VITE_S3_BUCKET_NAME, VITE_AWS_ACCESS_KEY_ID, VITE_AWS_SECRET_ACCESS_KEY");
}



// Basic validation - Crucial for identifying configuration issues early
if (!region || !s3BucketName || !dynamoDbTableName || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("AWS configuration environment variables missing. Check Codespaces secrets: AWS_REGION, S3_BUCKET_NAME, DYNAMODB_TABLE_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    // You might want to throw an error or have a default safe behavior depending on your application's needs
    // For example: throw new Error("AWS environment configuration is incomplete.");
}

// Initialize S3 Client (only if region is available)
const s3Client = region ? new S3Client({ region }) : null;

// Initialize DynamoDB Client and Document Client (only if region is available)
const ddbClient = region ? new DynamoDBClient({ region }) : null;
const marshallOptions = { removeUndefinedValues: true }; // Remove undefined attributes during save
const unmarshallOptions = {};
const translateConfig = { marshallOptions, unmarshallOptions };
// Initialize the Document Client only if the base client was initialized
const ddbDocClient = ddbClient ? DynamoDBDocumentClient.from(ddbClient, translateConfig) : null;


// --- AWS Service Functions ---

/**
 * Function to upload a game build file to AWS S3.
 * Replaces the Supabase uploadGameBuild function.
 */
export const uploadGameBuildToS3 = async (file: File, email: string) => {
  // Ensure required config and client are available
  if (!s3Client || !s3BucketName) {
      throw new Error("S3 client or bucket name not configured due to missing environment variables.");
  }

  try {
    // Create a unique file key (path within the bucket), similar to Supabase logic
    const timestamp = new Date().getTime();
    const fileExt = file.name.split('.').pop();
    // Sanitize email to make it safe for S3 key name
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedEmail}_${timestamp}.${fileExt}`;
    // Define the key (path) within the S3 bucket (equivalent to Supabase filePath)
    const fileKey = `game-builds/${fileName}`;

    // Prepare the S3 upload command parameters
    const putObjectParams = {
      Bucket: s3BucketName,
      Key: fileKey,
      Body: file, // The File object can often be passed directly
      ContentType: file.type || 'application/octet-stream', // Use file's MIME type or a default
      CacheControl: 'max-age=3600', // Optional: Cache control header
    };

    // Create and send the command
    const command = new PutObjectCommand(putObjectParams);
    const response = await s3Client.send(command);

    console.log(`Successfully uploaded ${fileName} to s3://${s3BucketName}/${fileKey}`);

    // Return the necessary details for storing the reference in DynamoDB
    return {
        s3Bucket: s3BucketName,
        s3Key: fileKey,        // This is the unique identifier within the bucket (like Supabase path)
        fileName: fileName,    // The generated file name (like Supabase fileName)
        eTag: response.ETag    // S3's entity tag for the uploaded object version
    };

  } catch (error: any) {
    console.error('Error uploading file to S3:', error);
    // Re-throw a more specific error for the calling code to handle
    throw new Error(`S3 Upload Failed: ${error.message || String(error)}`);
  }
};

/**
 * Function to save submission metadata to AWS DynamoDB.
 * Replaces the Supabase saveSubmission function.
 */
export const saveSubmissionToDynamoDB = async (
  email: string,
  country: string,
  s3Bucket: string, // Passed from the S3 upload result
  s3Key: string,    // Passed from the S3 upload result (replaces filePath)
  originalOrUploadedFileName: string // Passed from upload result or original file (replaces fileName)
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
    // Note the mapping from old Supabase fields to new structure:
    // - file_path -> s3Key (primary identifier)
    // - file_name -> originalOrUploadedFileName (descriptive name)
    // - Added submissionId (primary key), s3Bucket, submittedAt
    const itemToSave = {
      submissionId: submissionId,        // Primary Key for DynamoDB table
      email: email,
      country: country,
      s3Bucket: s3Bucket,              // Store the bucket name
      s3Key: s3Key,                    // Store the S3 object key (path)
      originalFileName: originalOrUploadedFileName, // Store the file name
      status: 'pending',               // Set initial status
      submittedAt: submittedAt,          // Timestamp for submission
      // Add any other fields that were in your Supabase 'submissions' table
    };

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

    // Return confirmation and the data that was intended to be saved
    return {
        success: true,
        submissionId: submissionId,
        itemData: itemToSave // Return the saved item data for potential use in UI
    };

  } catch (error: any) {
    console.error('Error saving submission to DynamoDB:', error);
    // Re-throw a more specific error
    throw new Error(`DynamoDB Save Failed: ${error.message || String(error)}`);
  }
};

// You can also export the raw clients or config if needed elsewhere, but it's often cleaner
// to just export the functions that use them, like above.
// export { s3Client, ddbDocClient, s3BucketName, dynamoDbTableName };