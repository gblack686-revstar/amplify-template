/**
 * Centralized Environment Configuration
 *
 * This file provides a single source of truth for all environment variables.
 * All environment variable access should go through this config to ensure consistency.
 */

export const config = {
  // Cognito Authentication
  userPoolId: process.env.REACT_APP_USER_POOL_ID || '',
  clientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || '',

  // AWS Configuration
  region: process.env.REACT_APP_REGION || 'us-east-1',

  // API Configuration
  apiUrl: process.env.REACT_APP_API_URL || '',

  // S3 Configuration
  documentBucket: process.env.REACT_APP_DOCUMENT_BUCKET || '',

  // Bedrock Configuration
  knowledgeBaseId: process.env.REACT_APP_KNOWLEDGE_BASE_ID || '',
  guardrailId: process.env.REACT_APP_GUARDRAIL_ID || '',
} as const;

/**
 * Validate that all required environment variables are set
 * Call this during app initialization to fail fast if config is missing
 */
export function validateConfig(): { isValid: boolean; missingVars: string[] } {
  const requiredVars = {
    userPoolId: 'REACT_APP_USER_POOL_ID',
    clientId: 'REACT_APP_USER_POOL_CLIENT_ID',
    region: 'REACT_APP_REGION',
    apiUrl: 'REACT_APP_API_URL',
    documentBucket: 'REACT_APP_DOCUMENT_BUCKET',
    knowledgeBaseId: 'REACT_APP_KNOWLEDGE_BASE_ID',
    guardrailId: 'REACT_APP_GUARDRAIL_ID',
  };

  const missingVars: string[] = [];

  Object.entries(requiredVars).forEach(([key, envVarName]) => {
    if (!config[key as keyof typeof config]) {
      missingVars.push(envVarName);
    }
  });

  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
}

export default config;
