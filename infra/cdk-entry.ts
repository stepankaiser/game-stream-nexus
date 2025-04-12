#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GameStreamProvisioningStack } from './cdk-stack';

const app = new cdk.App();
new GameStreamProvisioningStack(app, 'GameStreamProvisioningStack', {
  /* If you need to deploy to a specific account/region, uncomment and configure:
  env: { 
    account: process.env.CDK_DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEPLOY_REGION || process.env.CDK_DEFAULT_REGION 
  },
  */
});
