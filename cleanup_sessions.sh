#!/bin/bash

# Source the .env file
if [ -f .env ]; then
    # Export only the AWS credentials
    export VITE_AWS_ACCESS_KEY_ID=$(grep VITE_AWS_ACCESS_KEY_ID .env | cut -d '=' -f2)
    export VITE_AWS_SECRET_ACCESS_KEY=$(grep VITE_AWS_SECRET_ACCESS_KEY .env | cut -d '=' -f2)
else
    echo "Error: .env file not found"
    exit 1
fi

# Configure AWS CLI
aws configure set aws_access_key_id "$VITE_AWS_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$VITE_AWS_SECRET_ACCESS_KEY"
aws configure set region eu-central-1

echo "AWS credentials configured"

# List all sessions and store their ARNs
echo "Listing active sessions..."
session_arns=$(aws gamelift list-stream-sessions \
  --identifier sg-5ZVBpCfLM \
  --region eu-central-1 \
  --query "StreamSessions[?Status=='CONNECTED' || Status=='ACTIVE' || Status=='ACTIVATING'].Arn" \
  --output text)

# Check if we got any sessions
if [ -z "$session_arns" ]; then
    echo "No active sessions found"
    exit 0
fi

# Terminate each session
echo "Found active sessions, terminating..."
for arn in $session_arns; do
    echo "Terminating session: $arn"
    aws gamelift terminate-stream-session \
      --identifier "$arn" \
      --region eu-central-1
done

echo "Cleanup complete"
