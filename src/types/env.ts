/**
 * Cloudflare Workers environment bindings and types
 */

/**
 * Main environment interface with all bindings
 */
export interface Env {
  // Secrets
  GITHUB_TOKEN: string;
  GITHUB_BOT_USERNAME: string;
  GITHUB_WEBHOOK_SECRET: string;
  GEMINI_API_KEY: string;
  API_SECRET_TOKEN: string; // Phase 1.5.4: Bearer token for API endpoints
  
  // R2 FUSE mount credentials (secrets - Phase 2.4b)
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  
  // Variables
  GEMINI_MODEL?: string;
  TARGET_REPO?: string;
  REPO_CONFIG?: string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  
  // R2 FUSE mount configuration (variables - Phase 2.4b)
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  
  // Cloudflare bindings
  DURABLE_OBJECTS?: DurableObjectNamespace;
  KV?: KVNamespace;
  R2?: R2Bucket;
  CONTAINERS?: Fetcher; // Cloudflare Containers namespace
  
  // Container binding (Phase 2: Test execution)
  TEST_CONTAINER: DurableObjectNamespace;
  
  // R2 bucket for test artifacts (Phase 2.3)
  TEST_ARTIFACTS: R2Bucket;
  
  // KV namespace for document embeddings (Phase 1.5 - Stage 5)
  DOC_EMBEDDINGS?: KVNamespace;
  
  // Workflow binding (legacy - will be replaced by agent system)
  GITHUB_ISSUE_WORKFLOW?: Workflow;
  
  // Phase 4.1: Cloudflare AI Gateway configuration
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_GATEWAY_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  AI_PROVIDER?: 'gemini' | 'huggingface' | 'anthropic';
  AI_MODEL?: string;
  
  // Phase 4.1 Stage 3: Fallback Strategy
  AI_FALLBACK_PROVIDERS?: string; // Comma-separated provider chain (e.g., "gemini,huggingface,anthropic")
  CIRCUIT_BREAKER_FAILURE_THRESHOLD?: string; // Number of failures before opening circuit (default: 3)
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD?: string; // Number of successes to close circuit (default: 2)
  CIRCUIT_BREAKER_OPEN_TIMEOUT?: string; // Time in ms to stay open (default: 60000)

  // Alerting / Notification configuration (Phase 4.1 Stage 8)
  RESEND_API_KEY?: string; // API key for Resend email provider (resend.com)
  ALERT_EMAIL_PROVIDER?: 'resend' | 'sendgrid' | 'smtp';
  ALERT_FROM?: string; // Email "from" address for notifications (e.g., "noreply@company.com")
  ALERT_SLACK_WEBHOOK?: string; // Incoming webhook URL for Slack (optional)
  ALERT_SLACK_BOT_TOKEN?: string; // Bot token if using Slack app (optional)
  ALERT_STAGING_CHANNEL?: string; // Slack channel for staging notifications
  ALERT_DEDUPE_WINDOW_MS?: string; // Dedupe window in ms (default: 60000)
}

/**
 * Configuration from wrangler.toml [vars]
 */
export interface WorkerVars {
  GEMINI_MODEL: string;
  GITHUB_BOT_USERNAME: string;
  TARGET_REPO?: string;
  REPO_CONFIG?: string;
  LOG_LEVEL?: string;
  // Alerting variables (wrangler [vars])
  RESEND_API_KEY?: string;
  ALERT_SLACK_WEBHOOK?: string;
  ALERT_FROM?: string;
  ALERT_STAGING_CHANNEL?: string;
}

/**
 * Request context with environment
 */
export interface RequestContext {
  request: Request;
  env: Env;
  executionContext: ExecutionContext;
}
