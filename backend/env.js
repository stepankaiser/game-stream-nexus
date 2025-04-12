const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

module.exports.getEnvVariable = (variableName) => {
  const value = process.env[variableName];
  if (!value) {
    console.warn(`Warning: Environment variable ${variableName} not found in .env file.`);
    // Optional: Throw an error if the variable is strictly required
    // throw new Error(`Required environment variable ${variableName} not found.`);
  }
  return value || ''; // Return empty string if not found to avoid Serverless errors
}; 