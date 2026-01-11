/**
 * Container-related types for stateful test execution
 * Supports Phase 2: Container-Based Worktree Integration
 */

export interface TestJob {
  /**
   * Unique job identifier (UUID)
   */
  jobId: string;

  /**
   * Branch name to test
   */
  branch: string;

  /**
   * Test command to execute in worktree
   * Example: "npm test" or "npm run lint"
   */
  command: string;

  /**
   * Maximum execution time in milliseconds
   * Container forcefully stops if exceeded
   */
  timeoutMs: number;

  /**
   * Environment variables for test execution
   */
  env: Record<string, string>;

  /**
   * GitHub issue/PR context (for logging)
   */
  context?: {
    owner: string;
    repo: string;
    prNumber?: number;
    issueNumber?: number;
  };

  /**
   * Timestamp when job was created
   */
  createdAt: Date;
}

export interface TestResult {
  /**
   * Reference to original job
   */
  jobId: string;

  /**
   * Execution status
   */
  status: 'success' | 'failure' | 'timeout' | 'error';

  /**
   * Exit code from test command
   */
  exitCode?: number;

  /**
   * Standard output from test execution
   */
  stdout: string;

  /**
   * Standard error from test execution
   */
  stderr: string;

  /**
   * Duration of execution in milliseconds
   */
  durationMs: number;

  /**
   * Container instance ID that executed this job
   */
  containerId: string;

  /**
   * Timestamp when result was generated
   */
  completedAt: Date;

  /**
   * Test coverage metrics (if parser extracted them)
   */
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };

  /**
   * Optional error message (if status is 'error')
   */
  error?: string;
}

export interface ContainerInstance {
  /**
   * Unique container instance ID
   */
  id: string;

  /**
   * Durable Object container binding name
   */
  bindingName: string;

  /**
   * Container status
   */
  status: 'starting' | 'running' | 'idle' | 'stopped' | 'error';

  /**
   * Timestamp when container was created
   */
  createdAt: Date;

  /**
   * Timestamp of last request to this container
   */
  lastRequestAt?: Date;

  /**
   * Number of jobs executed by this container
   */
  jobsExecuted: number;

  /**
   * Container configuration
   */
  config: {
    port: number;
    sleepAfterMs: number;
    maxInstances: number;
  };
}

export interface StreamingMessage {
  /**
   * Message type
   */
  type: 'log' | 'error' | 'status' | 'result';

  /**
   * Message content
   */
  content: string;

  /**
   * Timestamp of message
   */
  timestamp: Date;

  /**
   * Associated job ID
   */
  jobId: string;
}

export interface TestExecutionContext {
  /**
   * Current test job
   */
  job: TestJob;

  /**
   * Container instance handling this job
   */
  container: ContainerInstance;

  /**
   * Streaming message handler
   */
  onStreamingMessage?: (msg: StreamingMessage) => void;

  /**
   * Abort signal for cancellation
   */
  abortSignal?: AbortSignal;
}

export interface ContainerMetrics {
  /**
   * Total number of jobs executed
   */
  totalJobs: number;

  /**
   * Number of successful executions
   */
  successfulJobs: number;

  /**
   * Number of failed executions
   */
  failedJobs: number;

  /**
   * Number of timed-out executions
   */
  timeoutJobs: number;

  /**
   * Average execution time in milliseconds
   */
  avgExecutionTimeMs: number;

  /**
   * Average container cold start time in milliseconds
   */
  avgColdStartTimeMs: number;

  /**
   * Current number of active container instances
   */
  activeInstanceCount: number;

  /**
   * Maximum configured instances
   */
  maxInstances: number;

  /**
   * Cost estimate (if available)
   */
  costEstimateUSD?: number;
}
