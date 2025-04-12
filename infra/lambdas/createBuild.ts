import { GameLiftClient, CreateBuildCommand, CreateBuildCommandInput } from "@aws-sdk/client-gamelift";
import { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } from "@aws-sdk/client-sfn"; // Optional: For reporting back if needed, though step function handles output mapping

const gamelift = new GameLiftClient({});
const sfn = new SFNClient({}); // Optional

interface CreateBuildEvent {
  // Expected input from Step Function or initial trigger
  submissionId: string;
  s3Bucket: string;
  s3Key: string; // Key for the zip file in the bucket
  buildName?: string; // Optional: Can construct from submissionId
  operatingSystem: 'WINDOWS_2016' | 'AMAZON_LINUX_2'; // Or others GameLift supports
}

export const handler = async (event: CreateBuildEvent) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { submissionId, s3Bucket, s3Key, operatingSystem } = event;

  if (!submissionId || !s3Bucket || !s3Key || !operatingSystem) {
    throw new Error('Missing required input: submissionId, s3Bucket, s3Key, operatingSystem');
  }

  // Construct a build name (optional, can be customized)
  const buildName = event.buildName || `game-build-${submissionId}`;

  const params: CreateBuildCommandInput = {
    Name: buildName,
    OperatingSystem: operatingSystem, 
    StorageLocation: {
      Bucket: s3Bucket,
      Key: s3Key,
      // Assuming the role executing this Lambda has S3 read access
      // RoleArn: 'YOUR_GAMELIFT_S3_ACCESS_ROLE_ARN' // Specify only if needed
    },
    // Add tags if desired
    Tags: [
      {
        Key: 'SubmissionId',
        Value: submissionId,
      },
    ],
  };

  try {
    console.log("Calling GameLift CreateBuild with params:", params);
    const command = new CreateBuildCommand(params);
    const response = await gamelift.send(command);

    console.log("CreateBuild successful:", response);

    if (!response.Build || !response.Build.BuildId) {
      throw new Error("CreateBuild response did not include expected Build information.");
    }

    // Return the BuildId and potentially other details needed by the next step
    // The Step Function ResultPath maps this to `$.BuildDetails`
    return {
      BuildId: response.Build.BuildId,
      BuildArn: response.Build.BuildArn, // Pass ARN too if useful
      SubmissionId: submissionId, // Pass through for context
    };

  } catch (error: any) {
    console.error("Error calling GameLift CreateBuild:", error);
    // Optionally send failure to Step Functions Task Token if using callback pattern
    // await sfn.send(new SendTaskFailureCommand({ taskToken: event.taskToken, error: error.name, cause: error.message }));
    throw new Error(`CreateBuild failed: ${error.message}`); // Let Step Functions handle the catch
  }
};
