/**
 * Event system types for agent communication
 */

/**
 * Base event structure
 */
export interface BaseEvent {
  /** Event type identifier */
  type: string;
  /** Timestamp when event was created */
  timestamp: Date;
  /** Event payload */
  payload: unknown;
  /** Event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * GitHub webhook event types
 */
export type GitHubEventType =
  | 'issues'
  | 'issue_comment'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'push'
  | 'release'
  | 'workflow_run'
  | 'ping';

/**
 * GitHub event wrapper for type safety
 */
export interface GitHubEvent {
  type: string;
  action?: string;
  payload: unknown;
  headers: Record<string, string>;
}

/**
 * GitHub webhook event actions
 */
export interface GitHubEventAction {
  issues: 'opened' | 'edited' | 'closed' | 'reopened' | 'labeled' | 'unlabeled' | 'assigned' | 'unassigned';
  pull_request: 'opened' | 'edited' | 'closed' | 'reopened' | 'synchronize' | 'labeled' | 'unlabeled';
  issue_comment: 'created' | 'edited' | 'deleted';
}

/**
 * Internal system events for agent coordination
 */
export type SystemEventType =
  | 'agent.registered'
  | 'agent.unregistered'
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed';

/**
 * System event structure
 */
export interface SystemEvent extends BaseEvent {
  type: SystemEventType;
  agentName?: string;
  workflowId?: string;
}

/**
 * Agent execution event
 */
export interface AgentExecutionEvent extends SystemEvent {
  type: 'agent.started' | 'agent.completed' | 'agent.failed';
  agentName: string;
  executionTimeMs?: number;
  error?: string;
}

/**
 * Workflow execution event
 */
export interface WorkflowExecutionEvent extends SystemEvent {
  type: 'workflow.started' | 'workflow.completed' | 'workflow.failed';
  workflowId: string;
  agentsExecuted?: string[];
  totalExecutionTimeMs?: number;
}

/**
 * Event bus interface for pub/sub pattern
 */
export interface IEventBus {
  /**
   * Publish an event
   */
  publish(event: BaseEvent): Promise<void>;
  
  /**
   * Subscribe to events by type
   */
  subscribe(eventType: string, handler: EventHandler): void;
  
  /**
   * Unsubscribe from events
   */
  unsubscribe(eventType: string, handler: EventHandler): void;
}

/**
 * Event handler function signature
 */
export type EventHandler = (event: BaseEvent) => Promise<void> | void;
