// generatePresignedUrl.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Read required environment variables
const region = process.env.AWS_REGION || 'eu-central-1'; // Replace with your region if different
const bucketName = process.env.S3_BUCKET_NAME; // Ensure this is set in Lambda env vars
const allowedOrigin = process.env.FRONTEND_URL || '*'; // Set your frontend URL for stricter CORS, or use '*' for development

if (!bucketName) {
    throw new Error("S3_BUCKET_NAME environment variable is not set.");
}

const s3Client = new S3Client({ region });
const PRESIGNED_URL_EXPIRATION = 300; // URL expires in 300 seconds (5 minutes)

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    let objectKey: string | undefined;
    let contentType: string | undefined;

    try {
        if (!event.body) {
            throw new Error("Request body is missing");
        }
        const body = JSON.parse(event.body);
        objectKey = body.objectKey;
        contentType = body.contentType;

        if (!objectKey) {
            throw new Error("Missing 'objectKey' in request body");
        }
         if (!contentType) {
            console.warn("Missing 'contentType' in request body, defaulting to application/octet-stream");
            contentType = 'application/octet-stream';
        }

        // Basic validation/sanitization for the key (prevent path traversal etc.)
        // Ensure it starts with the expected prefix
        if (objectKey.includes('..') || !objectKey.startsWith('game-builds/')) {
             throw new Error("Invalid objectKey format.");
        }

        console.log(`Generating presigned URL for bucket: ${bucketName}, key: ${objectKey}, contentType: ${contentType}`);

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            ContentType: contentType,
            // Consider adding ACL if needed, e.g., ACL: 'bucket-owner-full-control'
            // Add Metadata if desired, e.g., Metadata: { 'submitter-email': 'user@example.com' } (get from authenticated user later)
        });

        const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: PRESIGNED_URL_EXPIRATION,
        });

        console.log("Successfully generated signed URL.");

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": allowedOrigin,
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                presignedUrl: signedUrl,
                objectKey: objectKey // Return key for confirmation
            }),
        };

    } catch (error: unknown) {
        console.error("Error generating presigned URL:", error);
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return {
            statusCode: 500,
            headers: {
                 "Access-Control-Allow-Origin": allowedOrigin,
                 "Access-Control-Allow-Methods": "POST, OPTIONS",
                 "Access-Control-Allow-Headers": "Content-Type",
                 "Content-Type": "application/json",
            },
            body: JSON.stringify({ error: "Failed to generate presigned URL", details: message }),
        };
    }
};