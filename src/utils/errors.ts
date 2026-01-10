/**
 * Custom error types for the agent system
 */

/**
 * Base agent error
 */
export class AgentError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata?: Record<string, unknown>;
  
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

/**
 * Agent configuration error
 */
export class AgentConfigError extends AgentError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'AGENT_CONFIG_ERROR', 500, metadata);
    this.name = 'AgentConfigError';
  }
}

/**
 * Agent execution timeout error
 */
export class AgentTimeoutError extends AgentError {
  constructor(agentName: string, timeoutMs: number) {
    super(
      `Agent ${agentName} timed out after ${timeoutMs}ms`,
      'AGENT_TIMEOUT',
      504,
      { agentName, timeoutMs }
    );
    this.name = 'AgentTimeoutError';
  }
}

/**
 * Agent not found error
 */
export class AgentNotFoundError extends AgentError {
  constructor(agentName: string) {
    super(
      `Agent ${agentName} not found in registry`,
      'AGENT_NOT_FOUND',
      404,
      { agentName }
    );
    this.name = 'AgentNotFoundError';
  }
}

/**
 * GitHub API error
 */
export class GitHubAPIError extends AgentError {
  constructor(message: string, statusCode: number, metadata?: Record<string, unknown>) {
    super(message, 'GITHUB_API_ERROR', statusCode, metadata);
    this.name = 'GitHubAPIError';
  }
}

/**
 * AI API error
 */
export class AIAPIError extends AgentError {
  constructor(message: string, statusCode: number, metadata?: Record<string, unknown>) {
    super(message, 'AI_API_ERROR', statusCode, metadata);
    this.name = 'AIAPIError';
  }
}

/**
 * Webhook verification error
 */
export class WebhookVerificationError extends AgentError {
  constructor(message: string = 'Webhook signature verification failed') {
    super(message, 'WEBHOOK_VERIFICATION_FAILED', 401);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AgentError {
  constructor(retryAfter?: number) {
    super(
      'Rate limit exceeded',
      'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfter }
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends AgentError {
  constructor(message: string, fields?: string[]) {
    super(message, 'VALIDATION_ERROR', 400, { fields });
    this.name = 'ValidationError';
  }
}

/**
 * Check if error is an AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Convert any error to AgentError
 */
export function toAgentError(error: unknown): AgentError {
  if (isAgentError(error)) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AgentError(error.message, 'INTERNAL_ERROR', 500);
  }
  
  return new AgentError('An unknown error occurred', 'UNKNOWN_ERROR', 500);
}
