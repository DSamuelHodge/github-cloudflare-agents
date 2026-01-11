/**
 * ContainerService - Worker-side interface for container management
 * Manages container instances, job routing, and test execution
 */

import type { Env } from '../../types/env';
import type {
  TestJob,
  TestResult,
  ContainerInstance,
  ContainerMetrics,
} from '../../types/containers';
import { Logger } from '../../utils/logger';

export class ContainerService {
  private logger: Logger;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    const logLevel = (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
    this.logger = new Logger(logLevel, { component: 'ContainerService' });
  }

  /**
   * Submit a test job to an available container instance
   * Statefully routes to a specific container by ID
   *
   * @param job - Test job to execute
   * @returns Promise resolving to test result
   */
  async submitTestJob(job: TestJob): Promise<TestResult> {
    try {
      this.logger.info('Submitting test job', {
        jobId: job.jobId,
        branch: job.branch,
        command: job.command,
      });

      // Get container instance (Durable Object backed)
      // Using jobId ensures same job routes to same container if retried
      if (!this.env.TEST_CONTAINER) {
        throw new Error('TEST_CONTAINER binding not configured');
      }
      const container = this.env.TEST_CONTAINER.get(this.env.TEST_CONTAINER.idFromName(job.jobId));

      // Prepare job payload for container
      const jobPayload = {
        jobId: job.jobId,
        branch: job.branch,
        command: job.command,
        timeoutMs: job.timeoutMs,
        env: job.env,
        context: job.context,
        createdAt: job.createdAt.toISOString(),
      };

      // Send job to container via HTTP
      const response = await container.fetch('http://container/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobPayload),
      });

      if (!response.ok) {
        throw new Error(
          `Container returned ${response.status}: ${response.statusText}`
        );
      }

      // Parse result
      const result = (await response.json()) as TestResult;

      this.logger.info('Test job completed', {
        jobId: job.jobId,
        status: result.status,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      this.logger.error(
        'Test job submission failed',
        error instanceof Error ? error : undefined,
        {
          jobId: job.jobId,
        }
      );

      throw error;
    }
  }

  /**
   * Get status of a specific container instance
   *
   * @param containerId - Container instance ID
   * @returns Container instance status
   */
  async getContainerStatus(
    containerId: string
  ): Promise<ContainerInstance | null> {
    try {
      if (!this.env.TEST_CONTAINER) {
        return null;
      }
      const container = this.env.TEST_CONTAINER.get(this.env.TEST_CONTAINER.idFromName(containerId));
      const response = await container.fetch('http://container/status');

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as ContainerInstance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to get container status', {
        containerId,
        errorMessage,
      });
      return null;
    }
  }

  /**
   * Gracefully shut down a container instance
   * Allows 15-minute grace period for cleanup
   *
   * @param containerId - Container instance ID
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      this.logger.info('Stopping container', { containerId });

      if (!this.env.TEST_CONTAINER) {
        throw new Error('TEST_CONTAINER binding not configured');
      }
      const container = this.env.TEST_CONTAINER.get(this.env.TEST_CONTAINER.idFromName(containerId));
      await container.fetch('http://container/stop', { method: 'POST' });

      this.logger.info('Container stopped', { containerId });
    } catch (error) {
      this.logger.error(
        'Failed to stop container',
        error instanceof Error ? error : undefined,
        {
          containerId,
        }
      );
    }
  }

  /**
   * Get metrics for container fleet
   *
   * @returns Aggregated metrics across all container instances
   */
  async getMetrics(): Promise<ContainerMetrics> {
    try {
      // TODO: Implement metrics collection
      // This would aggregate metrics from all active container instances
      // For now, return placeholder

      return {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        timeoutJobs: 0,
        avgExecutionTimeMs: 0,
        avgColdStartTimeMs: 2500, // typical Cloudflare cold start
        activeInstanceCount: 0,
        maxInstances: 5,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get metrics',
        error instanceof Error ? error : undefined
      );

      return {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        timeoutJobs: 0,
        avgExecutionTimeMs: 0,
        avgColdStartTimeMs: 2500,
        activeInstanceCount: 0,
        maxInstances: 5,
      };
    }
  }

  /**
   * Generate unique job ID
   * Can be overridden for testing
   *
   * @returns UUID string
   */
  generateJobId(): string {
    return crypto.randomUUID();
  }
}
