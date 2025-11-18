import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface EnvironmentConfig {
  stack_name: string;
  environment: string;
  region: string;
  tags: { [key: string]: string };
  removal_policy: string;
  backup_enabled: boolean;
  features: {
    enable_document_analysis: boolean;
    enable_personalized_insights: boolean;
    enable_feedback_collection: boolean;
    enable_quicksight_dashboard: boolean;
    enable_advanced_guardrails: boolean;
  };
  dynamodb: {
    billing_mode: string;
    insights_ttl_days: number;
    enable_point_in_time_recovery: boolean;
  };
  bedrock: {
    default_model_id: string;
    guardrail_sexual_filter: string;
    guardrail_violence_filter: string;
    temperature: number;
    max_tokens: number;
  };
  cognito: {
    mfa_enabled: boolean;
    password_policy: {
      min_length: number;
      require_lowercase: boolean;
      require_uppercase: boolean;
      require_numbers: boolean;
      require_symbols: boolean;
    };
    auto_verify_email: boolean;
    advanced_security_mode?: string;
  };
  lambda: {
    log_retention_days: number;
    timeout_seconds: number;
    memory_size_mb: number;
  };
  monitoring: {
    enable_detailed_monitoring: boolean;
    enable_xray_tracing: boolean;
    alarm_email: string;
    enable_cloudwatch_insights?: boolean;
  };
}

/**
 * Load environment-specific configuration from YAML file
 * @param environment - The environment name (dev, staging, prod)
 * @returns Parsed configuration object
 */
export function loadConfig(environment: string): EnvironmentConfig {
  const configPath = path.join(__dirname, '..', '..', '..', 'config', 'environments', `${environment}.yaml`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const fileContents = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContents) as EnvironmentConfig;

  // Validate required fields
  const requiredFields = ['stack_name', 'environment', 'region'];
  for (const field of requiredFields) {
    if (!(field in config)) {
      throw new Error(`Missing required configuration field: ${field}`);
    }
  }

  return config;
}

/**
 * Get removal policy based on environment config
 */
export function getRemovalPolicy(config: EnvironmentConfig): 'DESTROY' | 'RETAIN' | 'SNAPSHOT' {
  const policy = config.removal_policy.toUpperCase();
  if (policy === 'DESTROY' || policy === 'RETAIN' || policy === 'SNAPSHOT') {
    return policy as 'DESTROY' | 'RETAIN' | 'SNAPSHOT';
  }
  throw new Error(`Invalid removal policy: ${config.removal_policy}`);
}
