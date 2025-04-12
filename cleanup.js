import { config } from 'dotenv';
import { GameLiftClient, ListStreamSessionsCommand, TerminateStreamSessionCommand } from '@aws-sdk/client-gamelift';

// Load environment variables
config();

const client = new GameLiftClient({
    region: 'eu-central-1',
    credentials: {
        accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
    }
});

async function cleanupSessions() {
    try {
        // List all sessions
        const listCommand = new ListStreamSessionsCommand({
            StreamGroupId: 'sg-5ZVBpCfLM'
        });
        
        const response = await client.send(listCommand);
        const activeSessions = response.StreamSessions.filter(
            session => ['CONNECTED', 'ACTIVE', 'ACTIVATING'].includes(session.Status)
        );

        if (activeSessions.length === 0) {
            console.log('No active sessions found');
            return;
        }

        console.log(`Found ${activeSessions.length} active sessions`);

        // Terminate each session
        for (const session of activeSessions) {
            console.log(`Terminating session: ${session.Arn}`);
            const terminateCommand = new TerminateStreamSessionCommand({
                StreamSessionArn: session.Arn
            });
            await client.send(terminateCommand);
        }

        console.log('Cleanup complete');
    } catch (error) {
        console.error('Error:', error);
    }
}

cleanupSessions(); 