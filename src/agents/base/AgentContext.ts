/**
 * Agent execution context - encapsulates all information needed for agent execution
 */

import type { AgentContext, AgentLogger, AgentMetrics, AgentEnv } from '../../types/agents';
import type { GitHubEvent } from '../../types/events';
import type { RepositoryContext } from '../../types/repository';
import type { AgentRole } from '../roles/roles.schema';
import { globalRoleAssignmentService } from '../../platform/security/RoleAssignmentService';
import { AuditService } from '../../platform/audit/AuditService';

export class AgentExecutionContext implements AgentContext {
  requestId: string;
  timestamp: Date;
  eventType: string;
  payload: unknown;
  repository?: RepositoryContext;
  env: AgentEnv;
  role?: AgentRole;
  logger: AgentLogger;
  metrics: AgentMetrics;
  audit?: AuditService;
  
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
    this.audit = env.AUDIT_KV ? new AuditService({ kv: env.AUDIT_KV, persistToKV: true }) : undefined;
  }
  
  /**
   * Assign role for a specific agent
   */
  assignRoleForAgent(agentName: string): void {
    this.role = globalRoleAssignmentService.assignRole(agentName, this.repository);
    this.logger.debug('Role assigned to agent', {
      agent: agentName,
      role: this.role?.name,
      repository: this.repository?.fullName,
    });
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
