import { GameLiftStreamsClient, AssociateApplicationsCommand } from "@aws-sdk/client-gameliftstreams";

const gameliftStreams = new GameLiftStreamsClient({});

interface AssociateAppEvent {
  ApplicationArn: string;
  submissionId: string;
}

export const handler = async (event: AssociateAppEvent) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { ApplicationArn, submissionId } = event;
  const streamGroupId = process.env.STREAM_GROUP_ID;

  if (!ApplicationArn || !streamGroupId) {
    throw new Error('Missing required input: ApplicationArn or STREAM_GROUP_ID environment variable');
  }

  try {
    console.log(`Associating application ${ApplicationArn} with stream group ${streamGroupId}`);
    
    const command = new AssociateApplicationsCommand({
      Identifier: streamGroupId,
      ApplicationIdentifiers: [ApplicationArn]
    });
    
    const response = await gameliftStreams.send(command);
    console.log("AssociateApplications successful:", response);

    // Return both ARNs for the next step
    return {
      ApplicationArn,
      StreamGroupId: streamGroupId,
      submissionId
    };

  } catch (error: any) {
    console.error(`Error associating application with stream group:`, error);
    throw new Error(`AssociateApplications failed: ${error.message}`);
  }
}; 