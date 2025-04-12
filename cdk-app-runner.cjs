// cdk-app-runner.cjs
// This file uses the .cjs extension to ensure it runs as CommonJS
// even if the root package.json has "type": "module".

// It requires the compiled CDK entry point, which itself should be CommonJS.
require('./dist/infra/cdk-entry.js'); 