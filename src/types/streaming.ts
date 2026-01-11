/**
 * Streaming types for real-time test output
 * Phase 2.4: WebSocket integration
 */

/**
 * WebSocket message types for streaming
 */
export type StreamMessageType = 
  | 'connected'
  | 'subscribed'
  | 'log'
  | 'error'
  | 'progress'
  | 'status'
  | 'result'
  | 'heartbeat'
  | 'unsubscribed'
  | 'closed';

/**
 * Base stream message structure
 */
export interface StreamMessage {
  type: StreamMessageType;
  jobId: string;
  timestamp: string;
  data?: unknown;
}

/**
 * Log stream message (stdout/stderr output)
 */
export interface LogStreamMessage extends StreamMessage {
  type: 'log' | 'error';
  data: {
    content: string;
    stream: 'stdout' | 'stderr';
    lineNumber?: number;
  };
}

/**
 * Progress stream message (test progress updates)
 */
export interface ProgressStreamMessage extends StreamMessage {
  type: 'progress';
  data: {
    phase: 'cloning' | 'installing' | 'testing' | 'cleanup';
    percent: number;
    message: string;
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
  };
}

/**
 * Status stream message (container lifecycle events)
 */
export interface StatusStreamMessage extends StreamMessage {
  type: 'status';
  data: {
    containerStatus: 'starting' | 'running' | 'idle' | 'stopped' | 'error';
    containerId: string;
    message: string;
  };
}

/**
 * Result stream message (final test result)
 */
export interface ResultStreamMessage extends StreamMessage {
  type: 'result';
  data: {
    status: 'success' | 'failure' | 'timeout' | 'error';
    exitCode?: number;
    durationMs: number;
    summary: {
      testsRun: number;
      testsPassed: number;
      testsFailed: number;
      testsSkipped: number;
    };
    coverage?: {
      lines: number;
      functions: number;
      branches: number;
      statements: number;
    };
    artifactUrls?: string[];
  };
}

/**
 * Heartbeat message for connection health
 */
export interface HeartbeatMessage extends StreamMessage {
  type: 'heartbeat';
  data: {
    serverTime: string;
    activeJobs: number;
  };
}

/**
 * Client subscription request
 */
export interface SubscriptionRequest {
  action: 'subscribe' | 'unsubscribe';
  jobId: string;
  token?: string; // Optional auth token
}

/**
 * Stream connection state
 */
export interface StreamConnection {
  id: string;
  subscribedJobs: Set<string>;
  connectedAt: Date;
  lastHeartbeat: Date;
  clientInfo?: {
    userAgent?: string;
    ip?: string;
  };
}

/**
 * Job stream state (tracks all subscribers for a job)
 */
export interface JobStreamState {
  jobId: string;
  subscribers: Set<string>; // Connection IDs
  bufferedMessages: StreamMessage[];
  maxBufferSize: number;
  startedAt: Date;
  lastMessageAt?: Date;
}

/**
 * GitHub comment update request
 */
export interface GitHubCommentUpdate {
  owner: string;
  repo: string;
  issueNumber: number;
  commentId?: number; // If updating existing comment
  body: string;
  updateType: 'create' | 'update' | 'append';
}

/**
 * Progress indicator format for GitHub comments
 */
export interface ProgressIndicator {
  emoji: string;
  label: string;
  percentage: number;
  barLength: number;
}
