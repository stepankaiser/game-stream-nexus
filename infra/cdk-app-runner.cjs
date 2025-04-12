#!/usr/bin/env node
// cdk-app-runner.cjs
// This file exists solely to run the compiled JS entry point (cdk-entry.js)
// in a CommonJS context, because the root package.json has "type": "module".

const { App } = require('aws-cdk-lib');
const { GameStreamProvisioningStack } = require('./infra/cdk-stack'); // Use the compiled JS file

const app = new App();
new GameStreamProvisioningStack(app, 'GameStreamProvisioningStack');
app.synth(); 