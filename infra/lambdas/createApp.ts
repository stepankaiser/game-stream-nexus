import { GameLiftStreamsClient, CreateApplicationCommand, CreateApplicationCommandInput, RuntimeEnvironment } from "@aws-sdk/client-gameliftstreams";
import { v4 as uuidv4 } from 'uuid';

const gameliftStreams = new GameLiftStreamsClient({});

interface CreateAppEvent {
  // Input from the Step Function state (started by startStepFunction lambda)
  submissionId: string;
  s3Bucket: string;
  s3Prefix: string; // Expecting the prefix now
  operatingSystem: 'WINDOWS_2016' | 'AMAZON_LINUX_2' | 'WINDOWS_2022' | 'UBUNTU_22_04_LTS' | 'PROTON_20241007' | 'PROTON_20230704'; // Match expected OS types
  executablePath: string; // Path to the executable relative to the upload root
  // Add other relevant fields if needed, like executable path override
}

export const handler = async (event: CreateAppEvent) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { submissionId, s3Bucket, s3Prefix, operatingSystem, executablePath } = event;

  if (!submissionId || !s3Bucket || !s3Prefix || !operatingSystem || !executablePath) {
    throw new Error('Missing required input: submissionId, s3Bucket, s3Prefix, operatingSystem, executablePath');
  }

  // Construct needed values
  const appDescription = `GameLift Streams application for submission ${submissionId}`;
  const s3SourceUri = `s3://${s3Bucket}/${s3Prefix}`; // Use the prefix directly
  const launchParameters = process.env.VITE_GAMELIFT_LAUNCH_PARAMS || ''
  
  // Map input OS string to RuntimeEnvironment object
  let runtimeEnv: RuntimeEnvironment | undefined = undefined;
  switch (operatingSystem) {
      case 'WINDOWS_2016':
          runtimeEnv = { Type: 'WINDOWS', Version: '2016' }; break;
      case 'WINDOWS_2022':
          runtimeEnv = { Type: 'WINDOWS', Version: '2022' }; break;
      case 'UBUNTU_22_04_LTS':
          runtimeEnv = { Type: 'UBUNTU', Version: '22_04_LTS' }; break;
      case 'PROTON_20241007':
          runtimeEnv = { Type: 'PROTON', Version: '20241007' }; break;
       case 'PROTON_20230704':
          runtimeEnv = { Type: 'PROTON', Version: '20230704' }; break;
      // Add other mappings as needed
      default:
          console.warn(`Unsupported OperatingSystem value: ${operatingSystem}. Defaulting or throwing error might be needed.`);
          // For now, let it pass through, API call might fail if invalid
          runtimeEnv = { Type: 'WINDOWS', Version: '2022' }; // Default guess
  }
  if (!runtimeEnv) {
      throw new Error(`Could not determine RuntimeEnvironment for OS: ${operatingSystem}`);
  }

  const params: CreateApplicationCommandInput = {
    ClientToken: uuidv4(),
    Description: appDescription,
    RuntimeEnvironment: runtimeEnv,
    ExecutablePath: executablePath,
    ApplicationSourceUri: s3SourceUri,
    // LaunchParameters: launchParameters, // Removed based on linter error
    Tags: {
      'SubmissionId': submissionId
    },
  };

  try {
    console.log("Calling GameLiftStreams CreateApplication with params:", params);
    const command = new CreateApplicationCommand(params);
    const response = await gameliftStreams.send(command);

    console.log("CreateApplication successful:", response);

    if (!response.Arn) { 
      throw new Error("CreateApplication response did not include expected Application ARN (response.Arn).");
    }

    // Output for the next step (UpdateDB)
    return {
      ApplicationArn: response.Arn,
      SubmissionId: submissionId 
    };

  } catch (error: any) {
    console.error(`Error calling GameLiftStreams CreateApplication for S3 source ${s3SourceUri}:`, error);
    throw new Error(`CreateApplication failed: ${error.message}`);
  }
};
