/**
 * Abstract base class for all agents
 */
export abstract class BaseAgent implements IAgent {
  readonly name: string;
  readonly version: string;
  readonly triggers: string[] = [];
  readonly config: AgentConfig;

  constructor(config: AgentConfig & { name: string; version: string; description?: string }) {
    this.name = config.name;
    this.version = config.version;
    this.config = config;
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;

  async shouldHandle(_context: AgentContext): Promise<boolean> {
    return true;
  }

  async run(context: AgentContext): Promise<AgentResult> {
    if (this.beforeExecute) await this.beforeExecute(context);
    let result: AgentResult;
    try {
      result = await this.execute(context);
    } catch (error) {
      if (this.onError) {
        result = await this.onError(context, error as Error);
      } else {
        throw error;
      }
    }
    if (this.afterExecute) await this.afterExecute(context, result);
    return result;
  }

  beforeExecute?(context: AgentContext): Promise<void>;
  afterExecute?(context: AgentContext, result: AgentResult): Promise<void>;
  onError?(context: AgentContext, error: Error): Promise<AgentResult>;
}
/**
 * Core agent system types and interfaces
 */

import type { RepositoryContext } from './repository';

/**
 * Agent execution context passed to all agents
 */
export interface AgentContext {
  /** Unique request ID for tracing */
  requestId: string;
  /** Timestamp when the request was received */
  timestamp: Date;
  /** GitHub event type (issues, pull_request, etc.) */
  eventType: string;
  /** Raw webhook payload */
  payload: unknown;
  /** Repository context (resolved per webhook) */
  repository?: RepositoryContext;
  /** Environment variables and secrets */
  env: AgentEnv;
  /** Logger instance */
  logger: AgentLogger;
  /** Metrics collector */
  metrics: AgentMetrics;
}

/**
 * Environment variables required by agents
 */
export interface AgentEnv {
  // GitHub
  GITHUB_TOKEN: string;
  GITHUB_BOT_USERNAME: string;
  GITHUB_WEBHOOK_SECRET: string;
  TARGET_REPO?: string;
  REPO_CONFIG?: string;
  
  // AI
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  
  // Storage (Phase 1.5 & Phase 2)
  TEST_ARTIFACTS?: R2Bucket;
  DOC_EMBEDDINGS?: KVNamespace;
  
  // Optional bindings
  DURABLE_OBJECTS?: DurableObjectNamespace;
  KV?: KVNamespace;
  R2?: R2Bucket;
  CONTAINERS?: Fetcher; // Cloudflare Containers binding
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  agentName: string;
  action?: string;
  data?: Record<string, unknown>;
  error?: string;
  metadata?: {
    executionTimeMs?: number;
    tokensUsed?: number;
    [key: string]: unknown;
  };
}

/**
 * Logger interface for agents
 */
export interface AgentLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

/**
 * Metrics interface for agents
 */
export interface AgentMetrics {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Base agent interface that all agents must implement
 */
export interface IAgent {
  /** Unique agent identifier */
  readonly name: string;
  
  /** Agent version */
  readonly version: string;
  
  /** GitHub event types this agent handles */
  readonly triggers: string[];
  
  /** Agent configuration */
  readonly config: AgentConfig;
  
  /**
   * Check if this agent should handle the given event
   */
  shouldHandle(context: AgentContext): Promise<boolean>;
  
  /**
   * Execute the agent logic
   */
  execute(context: AgentContext): Promise<AgentResult>;
  
  /**
   * Optional: Called before agent execution
   */
  beforeExecute?(context: AgentContext): Promise<void>;
  
  /**
   * Optional: Called after agent execution
   */
  afterExecute?(context: AgentContext, result: AgentResult): Promise<void>;
  
  /**
   * Optional: Handle errors during execution
   */
  onError?(context: AgentContext, error: Error): Promise<AgentResult>;
  
  /**
   * Run the agent with full lifecycle (implemented by BaseAgent)
   */
  run(context: AgentContext): Promise<AgentResult>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Is the agent enabled */
  enabled: boolean;
  
  /** Priority for execution (higher runs first) */
  priority?: number;
  
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
  
  /** Agent-specific configuration */
  [key: string]: unknown;
}

/**
 * Agent registration metadata
 */
export interface AgentRegistration {
  agent: IAgent;
  config: AgentConfig;
  createdAt: Date;
}
