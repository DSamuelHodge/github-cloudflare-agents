/**
 * TestContainer - Cloudflare Container for test execution
 * Manages git-worktree-runner test environments with lifecycle hooks
 * Includes R2 FUSE mounting for persistent artifact storage
 *
 * This is a Durable Object that manages container lifecycle
 * and handles test job execution requests from the Worker
 */

import { Container } from '@cloudflare/containers';

/**
 * Environment interface for TestContainer
 * R2 credentials passed as Worker secrets
 */
interface ContainerEnv {
  TEST_CONTAINER: DurableObjectNamespace<TestContainer>;
  // R2 FUSE mount credentials (secrets)
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  // R2 configuration (variables)
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
}

/**
 * TestContainer - Cloudflare Container class
 * Extends Container base class from @cloudflare/containers
 */
export class TestContainer extends Container<ContainerEnv> {
  /**
   * Port the container's HTTP server listens on
   */
  defaultPort = 4000;

  /**
   * Duration to keep container alive after last request
   * After idle period, container stops (fresh start on next request)
   * Prevents accumulation of stale worktrees
   */
  sleepAfter = '10m';

  /**
   * Environment variables passed to container on startup
   * Includes R2 FUSE credentials for persistent storage
   */
  envVars = {
    // Container will receive CLOUDFLARE_DEPLOYMENT_ID automatically
    GIT_GTR_ENABLE_COLORS: 'false', // Disable ANSI colors in gtr output
    NODE_ENV: 'production',
    // R2 FUSE mount credentials will be set in constructor
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    R2_BUCKET_NAME: '',
    R2_ACCOUNT_ID: '',
    R2_MOUNT_PATH: '/mnt/r2',
  };

  constructor(ctx: DurableObjectState, env: ContainerEnv) {
    super(ctx as DurableObjectState<Record<string, never>>, env);
    // Set R2 FUSE credentials from Worker secrets
    this.envVars.AWS_ACCESS_KEY_ID = env.AWS_ACCESS_KEY_ID || '';
    this.envVars.AWS_SECRET_ACCESS_KEY = env.AWS_SECRET_ACCESS_KEY || '';
    this.envVars.R2_BUCKET_NAME = env.R2_BUCKET_NAME || 'github-ai-agent-artifacts';
    this.envVars.R2_ACCOUNT_ID = env.R2_ACCOUNT_ID || '';
  }

  /**
   * Lifecycle hook: Runs when container starts
   * Used for health checks and initialization logging
   */
  override onStart(): void {
    console.log(`[TestContainer] Started at ${new Date().toISOString()}`);
    console.log(`[TestContainer] R2 bucket: ${this.env.R2_BUCKET_NAME || 'not configured'}`);
  }

  /**
   * Lifecycle hook: Runs when container stops
   * Used for graceful cleanup (kill dangling worktrees, etc.)
   */
  override onStop(): void {
    console.log(`[TestContainer] Stopping at ${new Date().toISOString()}`);
    // The container will receive SIGTERM, then SIGKILL after 15 minutes
    // Cleanup handlers in startup.sh handle unmounting R2
  }

  /**
   * Lifecycle hook: Runs when container encounters an error
   * Used for error logging and recovery strategies
   */
  override onError(error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[TestContainer] Error: ${errorMsg}`);
  }
}

/**
 * Export as default for Durable Object binding
 */
export default TestContainer;
