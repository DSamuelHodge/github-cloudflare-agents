/**
 * Agent execution context - encapsulates all information needed for agent execution
 */

import type { AgentContext, AgentLogger, AgentMetrics, AgentEnv } from '../../types/agents';
import type { GitHubEvent } from '../../types/events';
import type { RepositoryContext } from '../../types/repository';

export class AgentExecutionContext implements AgentContext {
  requestId: string;
  timestamp: Date;
  eventType: string;
  payload: unknown;
  repository?: RepositoryContext;
  env: AgentEnv;
  logger: AgentLogger;
  metrics: AgentMetrics;
  
  private _metadata: Map<string, unknown> = new Map();
  
  constructor(
    requestId: string,
    event: GitHubEvent,
    env: AgentEnv,
    logger: AgentLogger,
    metrics: AgentMetrics,
    repository?: RepositoryContext
  ) {
    this.requestId = requestId;
    this.timestamp = new Date();
    this.eventType = event.type;
    this.payload = event.payload;
    this.repository = repository;
    this.env = env;
    this.logger = logger;
    this.metrics = metrics;
  }
  
  /**
   * Store arbitrary metadata for the execution
   */
  setMetadata(key: string, value: unknown): void {
    this._metadata.set(key, value);
  }
  
  /**
   * Retrieve metadata
   */
  getMetadata(key: string): unknown {
    return this._metadata.get(key);
  }
  
  /**
   * Get all metadata
   */
  getAllMetadata(): Record<string, unknown> {
    return Object.fromEntries(this._metadata);
  }
}
