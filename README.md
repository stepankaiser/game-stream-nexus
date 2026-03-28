# Game Stream Nexus

**Cloud-based game streaming testing platform built on AWS GameLift Streams.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![AWS](https://img.shields.io/badge/AWS-GameLift%20Streams-ff9900.svg)](https://aws.amazon.com/gamelift/)

Game Stream Nexus lets game developers submit builds and stream them from cloud infrastructure powered by AWS GameLift Streams. Upload your game executable, provision a streaming session, and play it directly in the browser -- no local GPU required.

---

## Built With

| Layer          | Technologies                                                    |
| -------------- | --------------------------------------------------------------- |
| Frontend       | React 18, TypeScript 5.8, Vite 5.4, Tailwind CSS 3.4, shadcn/ui |
| State / Forms  | TanStack Query, React Hook Form, Zod                           |
| Backend        | AWS Lambda (Node.js 18), Serverless Framework, AWS SDK v3       |
| Infrastructure | AWS CDK 2.x, API Gateway, Step Functions, DynamoDB, S3, SES    |
| Streaming      | AWS GameLift Streams                                            |
| Auth           | Supabase                                                        |

## Features

- **Build management** -- upload game executables to S3 and track build metadata in DynamoDB.
- **One-click streaming sessions** -- provision GameLift Streams sessions and connect via a browser-embedded player.
- **Automated provisioning pipeline** -- Step Functions orchestrate session creation, health checks, and teardown.
- **Pre-signed upload URLs** -- secure, direct-to-S3 uploads with Lambda-generated pre-signed URLs.
- **Email notifications** -- SES-powered alerts for session status changes.
- **Responsive dashboard** -- Tailwind + shadcn/ui interface with real-time status via TanStack Query.

## Architecture

```
                        +------------+
                        |  Supabase  |
                        |   (Auth)   |
                        +-----+------+
                              |
  +-----------+        +------+-------+        +-----------------+
  |  React /  | -----> | API Gateway  | -----> |  AWS Lambda     |
  |  Vite SPA |  HTTP  |              |  REST  |  (Node.js 18)   |
  +-----------+        +--------------+        +---+----+--------+
                                                   |    |
                                 +-----------------+    +----------+
                                 |                                 |
                          +------+------+                   +------+------+
                          |  DynamoDB   |                   |     S3      |
                          | (metadata)  |                   |  (builds)   |
                          +-------------+                   +-------------+

  Provisioning Pipeline (Step Functions)
  =======================================
  [ Create Session ] --> [ Poll Status ] --> [ Ready? ] --yes--> [ Notify via SES ]
                                                 |
                                                 no
                                                 |
                                            [ Wait & Retry ]

  Streaming
  =========
  Browser  <---WebRTC--->  AWS GameLift Streams  <---  Game Executable (S3)
```

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **AWS CLI** v2, configured with appropriate credentials
- **Serverless Framework** (`npm i -g serverless`)
- **AWS CDK** (`npm i -g aws-cdk`)
- A **Supabase** project for authentication

### Installation

```bash
# Clone the repository
git clone https://github.com/stepankaiser/game-stream-nexus.git
cd game-stream-nexus

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install CDK dependencies
cd infra && npm install && cd ..

# Copy the example env file and fill in your values
cp .env.example .env
```

### Environment Variables

Create a `.env` file in the project root (see `.env.example` for reference). Key variables include:

| Variable                    | Description                              |
| --------------------------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`        | Supabase project URL                     |
| `VITE_SUPABASE_ANON_KEY`   | Supabase anonymous/public key            |
| `VITE_API_BASE_URL`        | API Gateway endpoint                     |

Backend and CDK stacks pull AWS configuration from the CLI profile and `serverless.yml` / `cdk.json`.

### Running Locally

```bash
# Start the frontend dev server
npm run dev

# The app will be available at http://localhost:5173
```

## Project Structure

```
game-stream-nexus/
├── src/                  # React frontend
│   ├── components/       #   UI components (+ shadcn/ui)
│   ├── hooks/            #   Custom React hooks
│   ├── lib/              #   Utilities and helpers
│   ├── pages/            #   Route-level page components
│   ├── services/         #   API client layer
│   └── types/            #   Shared TypeScript types
├── backend/              # Serverless Framework backend
│   └── serverless.yml    #   Lambda + API Gateway config
├── infra/                # AWS CDK infrastructure
│   ├── cdk-stack.ts      #   Main CDK stack
│   └── lambdas/          #   Lambda handlers for CDK-deployed functions
├── lambda/               # Standalone Lambda utilities
├── public/               # Static assets
├── vite.config.ts        # Vite configuration
├── tailwind.config.ts    # Tailwind CSS configuration
└── package.json
```

## Deployment

### Backend (Serverless Framework)

```bash
cd backend
serverless deploy --stage prod
```

### Infrastructure (AWS CDK)

```bash
cd infra
cdk bootstrap   # first time only
cdk deploy
```

### Frontend

Build the production bundle and deploy to your hosting provider of choice (S3 + CloudFront, Vercel, Netlify, etc.):

```bash
npm run build   # outputs to dist/
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
