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
  
  // Variables
  GEMINI_MODEL?: string;
  TARGET_REPO?: string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  
  // Cloudflare bindings
  DURABLE_OBJECTS?: DurableObjectNamespace;
  KV?: KVNamespace;
  R2?: R2Bucket;
  CONTAINERS?: any; // Cloudflare Containers namespace
  
  // Workflow binding (legacy - will be replaced by agent system)
  GITHUB_ISSUE_WORKFLOW?: any;
}

/**
 * Configuration from wrangler.toml [vars]
 */
export interface WorkerVars {
  GEMINI_MODEL: string;
  GITHUB_BOT_USERNAME: string;
  TARGET_REPO?: string;
  LOG_LEVEL?: string;
}

/**
 * Request context with environment
 */
export interface RequestContext {
  request: Request;
  env: Env;
  executionContext: ExecutionContext;
}
