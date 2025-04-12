import { GameLiftClient, DescribeBuildCommand, DescribeBuildCommandInput } from "@aws-sdk/client-gamelift";

const gamelift = new GameLiftClient({});

interface DescribeBuildEvent {
  BuildId: string;
  // Other fields might be passed through the state, like SubmissionId
  SubmissionId?: string;
}

export const handler = async (event: DescribeBuildEvent) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { BuildId } = event;

  if (!BuildId) {
    throw new Error('Missing required input: BuildId');
  }

  const params: DescribeBuildCommandInput = {
    BuildId: BuildId,
  };

  try {
    console.log("Calling GameLift DescribeBuild with params:", params);
    const command = new DescribeBuildCommand(params);
    const response = await gamelift.send(command);

    console.log("DescribeBuild successful:", response);

    if (!response.Build) {
      // Consider if this should be a failure or just indicate not found yet
      console.warn(`Build with ID ${BuildId} not found yet.`);
      // Returning a status that will cause the loop to continue might be appropriate
      // Or throw an error if it *should* exist by now.
      // Let's assume for now it should exist if we got here.
      throw new Error(`DescribeBuild response did not include Build information for ${BuildId}.`);
    }

    // Return the relevant Build details, especially the status
    // The Step Function ResultPath maps this to `$.BuildStatus`
    return {
      Build: {
          BuildId: response.Build.BuildId,
          BuildArn: response.Build.BuildArn,
          Status: response.Build.Status,
          OperatingSystem: response.Build.OperatingSystem, // Pass OS for CreateApp
          // Add other fields if needed by subsequent steps
      },
      SubmissionId: event.SubmissionId // Pass through context
    };

  } catch (error: any) {
    console.error(`Error calling GameLift DescribeBuild for ${BuildId}:`, error);
    throw new Error(`DescribeBuild failed: ${error.message}`); // Let Step Functions handle the catch
  }
};
