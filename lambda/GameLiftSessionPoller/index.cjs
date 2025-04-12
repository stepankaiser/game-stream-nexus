// Use standard CommonJS require for AWS SDK v3 GameLiftStreamsClient
const { GameLiftStreamsClient, GetStreamSessionCommand } = require('@aws-sdk/client-gameliftstreams');

const region = process.env.AWS_REGION || 'eu-central-1';

// Initialize the GameLift Streams client (v3)
const client = new GameLiftStreamsClient({ region });
console.log(`GameLiftStreams SDK v3 Client initialized for region: ${region}`);

// Define CORS headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Allow all origins (adjust in production)
    "Access-Control-Allow-Methods": "POST, OPTIONS", // Allow POST and OPTIONS
    "Access-Control-Allow-Headers": "Content-Type", // Allow Content-Type header
};

/**
 * Extracts Stream Group Identifier and Stream Session ID from ARN.
 * ARN format: arn:aws:gameliftstreams:{region}:{accountId}:streamsession/{streamGroupId}/{streamSessionId}
 * @param {string} arn - The Stream Session ARN.
 * @returns {{streamGroupId: string, streamSessionId: string} | null} Extracted IDs or null if invalid.
 */
function extractIdsFromArn(arn) {
    if (!arn) return null;
    const parts = arn.split(':');
    if (parts.length < 6) return null;
    const resourceParts = parts[5].split('/');
    if (resourceParts.length !== 3 || resourceParts[0] !== 'streamsession') return null;
    return {
        streamGroupId: resourceParts[1],
        streamSessionId: resourceParts[2]
    };
}

/**
 * Lambda function to poll the status of a GameLift Stream Session using SDK v3.
 */
exports.handler = async (event) => {
    console.log("--- Poller Lambda Handler (SDK v3) ---");
    console.log("Received event: ", JSON.stringify(event, null, 2));

    // Handle CORS preflight OPTIONS request
    if (event.requestContext.http.method === 'OPTIONS') {
        console.log("Handling OPTIONS preflight request");
        return {
            statusCode: 200,
            headers: corsHeaders
        };
    }

    let streamSessionArn;
    try {
        const body = JSON.parse(event.body);
        streamSessionArn = body.streamSessionArn;
        if (!streamSessionArn) {
            throw new Error('Missing streamSessionArn in request body');
        }
    } catch (error) {
        console.error("Error parsing request body or missing ARN:", error);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid request body or missing streamSessionArn' })
        };
    }

    console.log(`Polling session status for ARN: ${streamSessionArn}`);

    // Extract IDs needed for v3 command
    const identifiers = extractIdsFromArn(streamSessionArn);
    if (!identifiers) {
        console.error(`Failed to parse Stream Group and Session IDs from ARN: ${streamSessionArn}`);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid Stream Session ARN format' })
        };
    }

    // Construct v3 command parameters
    const params = {
        Identifier: identifiers.streamGroupId,
        StreamSessionIdentifier: identifiers.streamSessionId
    };

    try {
        console.log("Sending GetStreamSessionCommand (v3):", JSON.stringify(params, null, 2));
        const command = new GetStreamSessionCommand(params);
        const data = await client.send(command);
        console.log("GetStreamSessionCommand successful (v3). Response:", JSON.stringify(data, null, 2));

        // Return the entire data object from the successful SDK call
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(data) // Return the full response object
        };
    } catch (error) {
        console.error(`Error during GetStreamSessionCommand call (v3) for ARN ${streamSessionArn}:`, error);
        // Log specific error details
        console.error("Error Name:", error.name);
        console.error("Error Message:", error.message);
        console.error("Error Code:", error.code); // Might not exist directly on v3 error
        console.error("Error Metadata:", JSON.stringify(error.$metadata || {}, null, 2));
        console.error("Error Stack:", error.stack);

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: `Failed to get stream session status for ARN: ${streamSessionArn}`,
                errorName: error.name || 'Error',
                errorMessage: error.message || 'Unknown error'
            })
        };
    }
}; 