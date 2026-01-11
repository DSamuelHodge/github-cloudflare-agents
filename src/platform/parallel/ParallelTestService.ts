/**
 * ParallelTestService - Orchestrates parallel multi-solution testing
 * Phase 2.5: Spawn 3-5 containers for parallel test execution
 * 
 * Aligned with PHASE2_RESEARCH.md:
 * - Create load-balanced routing (getRandom pattern)
 * - Spawn 3-5 containers for parallel test execution
 * - Aggregate results
 */

import type { Env } from '../../types/env';
import type { TestJob, TestResult } from '../../types/containers';
import type {
  ParallelTestJob,
  ParallelTestResult,
  SolutionVariant,
  SolutionTestResult,
  ParallelExecutionConfig,
  ScoringWeights,
  DEFAULT_PARALLEL_CONFIG,
} from '../../types/parallel';
import { Logger } from '../../utils/logger';

export class ParallelTestService {
  private logger: Logger;
  private env: Env;
  private config: ParallelExecutionConfig;

  constructor(env: Env, config?: Partial<ParallelExecutionConfig>) {
    this.env = env;
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 3,
      allocationStrategy: config?.allocationStrategy ?? 'random',
      scoringWeights: config?.scoringWeights ?? {
        passRate: 0.5,
        coverage: 0.2,
        speed: 0.1,
        confidence: 0.2,
      },
      stopOnFirstPass: config?.stopOnFirstPass ?? false,
      totalTimeoutMs: config?.totalTimeoutMs ?? 600000,
    };
    
    const logLevel = (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
    this.logger = new Logger(logLevel, { component: 'ParallelTestService' });
  }

  /**
   * Execute parallel tests across multiple solutions
   * Uses load-balanced routing per research spec
   */
  async executeParallelTests(job: ParallelTestJob): Promise<ParallelTestResult> {
    const startTime = Date.now();
    
    this.logger.info('Starting parallel test execution', {
      jobId: job.jobId,
      solutionCount: job.solutions.length,
      maxConcurrency: this.config.maxConcurrency,
    });

    // Limit concurrency
    const concurrency = Math.min(job.solutions.length, this.config.maxConcurrency);
    
    // Execute solutions in parallel batches
    const results: SolutionTestResult[] = [];
    const batches = this.createBatches(job.solutions, concurrency);
    
    for (const batch of batches) {
      // Check total timeout
      if (Date.now() - startTime > this.config.totalTimeoutMs) {
        this.logger.warn('Parallel execution timed out', {
          jobId: job.jobId,
          completedSolutions: results.length,
          totalSolutions: job.solutions.length,
        });
        break;
      }

      // Execute batch in parallel using load-balanced routing
      const batchResults = await Promise.all(
        batch.map(solution => this.executeSolutionTest(job, solution))
      );
      
      results.push(...batchResults);

      // Check for early termination
      if (this.config.stopOnFirstPass) {
        const passedSolution = batchResults.find(r => r.status === 'success');
        if (passedSolution) {
          this.logger.info('Early termination: solution passed', {
            jobId: job.jobId,
            solutionId: passedSolution.solutionId,
          });
          break;
        }
      }
    }

    // Aggregate and rank results
    const aggregatedResult = this.aggregateResults(job, results, startTime);
    
    this.logger.info('Parallel test execution completed', {
      jobId: job.jobId,
      solutionsTested: results.length,
      winner: aggregatedResult.winner?.solutionId,
      totalDurationMs: aggregatedResult.summary.totalDurationMs,
    });

    return aggregatedResult;
  }

  /**
   * Execute test for a single solution using load-balanced container
   * Uses random routing per research spec (getRandom pattern)
   */
  private async executeSolutionTest(
    job: ParallelTestJob,
    solution: SolutionVariant
  ): Promise<SolutionTestResult> {
    const solutionJobId = `${job.jobId}-${solution.solutionId}`;
    
    this.logger.debug('Executing solution test', {
      jobId: job.jobId,
      solutionId: solution.solutionId,
      branch: solution.branch,
    });

    try {
      // Get container using load-balanced routing (random selection)
      const container = await this.getLoadBalancedContainer(solutionJobId);
      
      // Create test job for this solution
      const testJob: TestJob = {
        jobId: solutionJobId,
        branch: solution.branch,
        command: job.testCommand,
        timeoutMs: job.timeoutMs,
        env: {
          SOLUTION_ID: solution.solutionId,
          SOLUTION_STRATEGY: solution.strategy,
          NODE_ENV: 'test',
          CI: 'true',
        },
        context: job.context,
        createdAt: new Date(),
      };

      // Send job to container
      const response = await container.fetch('http://container/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testJob,
          createdAt: testJob.createdAt.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Container returned ${response.status}`);
      }

      const result = await response.json() as TestResult;
      
      // Parse test metrics from output
      const metrics = this.parseTestMetrics(result.stdout, result.stderr);

      return {
        ...result,
        solutionId: solution.solutionId,
        metrics,
      };
    } catch (error) {
      this.logger.error('Solution test failed', error instanceof Error ? error : undefined, {
        jobId: job.jobId,
        solutionId: solution.solutionId,
      });

      return {
        jobId: solutionJobId,
        solutionId: solution.solutionId,
        status: 'error',
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: 0,
        containerId: 'unknown',
        completedAt: new Date(),
        metrics: {
          passRate: 0,
          testsPassed: 0,
          testsFailed: 0,
          testsSkipped: 0,
          totalTests: 0,
        },
      };
    }
  }

  /**
   * Get container using load-balanced routing
   * Implements getRandom pattern from research spec
   */
  private async getLoadBalancedContainer(jobId: string): Promise<DurableObjectStub> {
    if (!this.env.TEST_CONTAINER) {
      throw new Error('TEST_CONTAINER binding not configured');
    }

    // Use allocation strategy
    switch (this.config.allocationStrategy) {
      case 'random':
        // Random instance selection (load-balanced per research spec)
        // Generate random instance ID to distribute load
        const randomIndex = Math.floor(Math.random() * this.config.maxConcurrency);
        const randomId = this.env.TEST_CONTAINER.idFromName(`instance-${randomIndex}`);
        return this.env.TEST_CONTAINER.get(randomId);

      case 'round-robin':
        // Round-robin based on hash of jobId
        const hash = this.hashString(jobId);
        const rrIndex = hash % this.config.maxConcurrency;
        const rrId = this.env.TEST_CONTAINER.idFromName(`instance-${rrIndex}`);
        return this.env.TEST_CONTAINER.get(rrId);

      case 'dedicated':
      default:
        // Dedicated container per job (original behavior)
        const dedicatedId = this.env.TEST_CONTAINER.idFromName(jobId);
        return this.env.TEST_CONTAINER.get(dedicatedId);
    }
  }

  /**
   * Simple string hash for round-robin distribution
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Create batches for parallel execution
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Parse test metrics from stdout/stderr
   * Supports common test runner output formats
   */
  private parseTestMetrics(stdout: string, stderr: string): SolutionTestResult['metrics'] {
    const output = stdout + stderr;
    
    // Try to parse Jest/Vitest format: "Tests: X passed, Y failed, Z total"
    const jestMatch = output.match(/Tests:\s*(\d+)\s*passed,?\s*(\d+)?\s*failed?,?\s*(\d+)?\s*skipped?,?\s*(\d+)\s*total/i);
    if (jestMatch) {
      const passed = parseInt(jestMatch[1]) || 0;
      const failed = parseInt(jestMatch[2]) || 0;
      const skipped = parseInt(jestMatch[3]) || 0;
      const total = parseInt(jestMatch[4]) || (passed + failed + skipped);
      
      return {
        passRate: total > 0 ? (passed / total) * 100 : 0,
        testsPassed: passed,
        testsFailed: failed,
        testsSkipped: skipped,
        totalTests: total,
      };
    }

    // Try to parse Mocha format: "X passing, Y failing"
    const mochaMatch = output.match(/(\d+)\s*passing.*?(\d+)?\s*failing/i);
    if (mochaMatch) {
      const passed = parseInt(mochaMatch[1]) || 0;
      const failed = parseInt(mochaMatch[2]) || 0;
      const total = passed + failed;
      
      return {
        passRate: total > 0 ? (passed / total) * 100 : 0,
        testsPassed: passed,
        testsFailed: failed,
        testsSkipped: 0,
        totalTests: total,
      };
    }

    // Try to parse pytest format: "X passed, Y failed"
    const pytestMatch = output.match(/(\d+)\s*passed.*?(\d+)?\s*failed/i);
    if (pytestMatch) {
      const passed = parseInt(pytestMatch[1]) || 0;
      const failed = parseInt(pytestMatch[2]) || 0;
      const total = passed + failed;
      
      return {
        passRate: total > 0 ? (passed / total) * 100 : 0,
        testsPassed: passed,
        testsFailed: failed,
        testsSkipped: 0,
        totalTests: total,
      };
    }

    // Default: No metrics found
    return {
      passRate: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0,
      totalTests: 0,
    };
  }

  /**
   * Aggregate results and determine winner
   */
  private aggregateResults(
    job: ParallelTestJob,
    results: SolutionTestResult[],
    startTime: number
  ): ParallelTestResult {
    const totalDurationMs = Date.now() - startTime;
    
    // Calculate scores for each solution
    const scoredResults = results.map(result => {
      const solution = job.solutions.find(s => s.solutionId === result.solutionId);
      const score = this.calculateScore(result, solution);
      return { result, score };
    });

    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);

    // Create ranking
    const ranking = scoredResults.map((sr, index) => ({
      solutionId: sr.result.solutionId,
      score: sr.score,
      rank: index + 1,
    }));

    // Determine winner (must have passed tests)
    const passedSolutions = scoredResults.filter(sr => sr.result.status === 'success');
    const winner = passedSolutions.length > 0 ? {
      solutionId: passedSolutions[0].result.solutionId,
      reason: this.getWinnerReason(passedSolutions[0].result),
      score: passedSolutions[0].score,
    } : undefined;

    // Summary statistics
    const solutionsPassed = results.filter(r => r.status === 'success').length;
    const solutionsFailed = results.length - solutionsPassed;
    const avgDurationMs = results.length > 0
      ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
      : 0;

    return {
      jobId: job.jobId,
      results,
      winner,
      ranking,
      summary: {
        solutionsTested: results.length,
        solutionsPassed,
        solutionsFailed,
        totalDurationMs,
        avgDurationMs,
      },
      completedAt: new Date(),
    };
  }

  /**
   * Calculate weighted score for a solution
   */
  private calculateScore(result: SolutionTestResult, solution?: SolutionVariant): number {
    const weights = this.config.scoringWeights;
    
    // Pass rate score (0-100)
    const passRateScore = result.metrics.passRate;
    
    // Coverage score (0-100, default 50 if not available)
    const coverageScore = result.coverage
      ? (result.coverage.lines + result.coverage.functions + result.coverage.branches + result.coverage.statements) / 4
      : 50;
    
    // Speed score (inverse of duration, normalized 0-100)
    // Assume 60s is slow (0), 1s is fast (100)
    const speedScore = Math.max(0, Math.min(100, 100 - (result.durationMs / 600)));
    
    // Confidence score (from AI solution)
    const confidenceScore = solution?.confidence ?? 50;
    
    // Weighted total
    const total = 
      (passRateScore * weights.passRate) +
      (coverageScore * weights.coverage) +
      (speedScore * weights.speed) +
      (confidenceScore * weights.confidence);
    
    return Math.round(total * 100) / 100;
  }

  /**
   * Generate reason string for winner selection
   */
  private getWinnerReason(result: SolutionTestResult): string {
    const { metrics } = result;
    
    if (metrics.passRate === 100) {
      return `All ${metrics.totalTests} tests passed in ${(result.durationMs / 1000).toFixed(2)}s`;
    }
    
    return `${metrics.testsPassed}/${metrics.totalTests} tests passed (${metrics.passRate.toFixed(1)}%)`;
  }
}
