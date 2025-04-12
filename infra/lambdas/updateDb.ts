import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

interface UpdateDbEvent {
  submissionId: string;
  applicationArn: string;
  streamGroupId: string;
  status: string;
}

export const handler = async (event: UpdateDbEvent) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { submissionId, applicationArn, streamGroupId, status } = event;
  const tableName = process.env.DYNAMODB_TABLE_NAME;

  if (!submissionId || !applicationArn || !streamGroupId || !status || !tableName) {
    throw new Error('Missing required input: submissionId, applicationArn, streamGroupId, status, or DYNAMODB_TABLE_NAME');
  }

  try {
    const command = new UpdateCommand({
      TableName: tableName,
      Key: {
        submissionId: submissionId
      },
      UpdateExpression: 'SET #status = :status, applicationArn = :applicationArn, streamGroupId = :streamGroupId, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':applicationArn': applicationArn,
        ':streamGroupId': streamGroupId,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    });

    console.log("Updating DynamoDB with command:", command);
    const response = await ddbDocClient.send(command);
    console.log("DynamoDB update successful:", response);

    return {
      statusCode: 200,
      body: JSON.stringify(response.Attributes)
    };

  } catch (error: any) {
    console.error("Error updating DynamoDB:", error);
    throw new Error(`Failed to update DynamoDB: ${error.message}`);
  }
};
