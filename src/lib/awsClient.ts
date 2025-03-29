import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Read configuration from environment variables (Codespaces secrets)
const region = process.env.AWS_REGION;
export const s3BucketName = process.env.S3_BUCKET_NAME;
export const dynamoDbTableName = process.env.DYNAMODB_TABLE_NAME;

// Basic validation
if (!region || !s3BucketName || !dynamoDbTableName || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("AWS configuration missing from environment variables (AWS_REGION, S3_BUCKET_NAME, DYNAMODB_TABLE_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY). Check Codespaces secrets.");
    // Depending on your app's setup, you might throw an error here or handle it differently
}

// Initialize S3 Client
export const s3Client = new S3Client({ region });

// Initialize DynamoDB Client and Document Client
const ddbClient = new DynamoDBClient({ region });
const marshallOptions = { removeUndefinedValues: true }; // Recommended
const unmarshallOptions = {};
const translateConfig = { marshallOptions, unmarshallOptions };
export const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, translateConfig);