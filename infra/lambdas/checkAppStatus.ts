import { GameLiftStreamsClient, GetApplicationCommand } from "@aws-sdk/client-gameliftstreams";

const gameLiftStreams = new GameLiftStreamsClient({});

interface CheckAppStatusEvent {
  ApplicationArn: string;
  submissionId: string;
}

export const handler = async (event: CheckAppStatusEvent) => {
  console.log("Checking application status for:", event);

  try {
    const { ApplicationArn } = event;
    
    // Extract application ID from ARN
    const applicationId = ApplicationArn.split('/').pop() || '';

    const getAppCommand = new GetApplicationCommand({
      Identifier: applicationId
    });

    const response = await gameLiftStreams.send(getAppCommand);
    console.log("Application status response:", response);

    return {
      status: response?.Status || 'UNKNOWN',
      submissionId: event.submissionId,
      ApplicationArn
    };

  } catch (error: any) {
    console.error("Error checking application status:", error);
    throw error;
  }
}; 