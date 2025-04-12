const { GameLiftClient, ListStreamSessionsCommand, StopStreamSessionCommand } = require("@aws-sdk/client-gamelift");
const dotenv = require('dotenv');

dotenv.config();

const client = new GameLiftClient({
    region: process.env.VITE_AWS_REGION,
    credentials: {
        accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
    }
});

async function cleanupSessions() {
    try {
        // List all active sessions
        const listCommand = new ListStreamSessionsCommand({
            MaxResults: 100
        });
        const response = await client.send(listCommand);
        
        console.log('Found sessions:', response.StreamSessions || []);

        // Stop each active session
        if (response.StreamSessions && response.StreamSessions.length > 0) {
            for (const session of response.StreamSessions) {
                console.log(`Stopping session: ${session.StreamSessionArn}`);
                const stopCommand = new StopStreamSessionCommand({
                    StreamSessionArn: session.StreamSessionArn
                });
                await client.send(stopCommand);
                console.log(`Successfully stopped session: ${session.StreamSessionArn}`);
            }
        } else {
            console.log('No active sessions found.');
        }
    } catch (error) {
        console.error('Error cleaning up sessions:', error);
        if (error.message) {
            console.error('Error message:', error.message);
        }
        if (error.$metadata) {
            console.error('Error metadata:', error.$metadata);
        }
    }
}

cleanupSessions(); 