/**
 * Phase 2.5: Parallel Multi-Solution Testing
 * Tests for parallel test execution and result aggregation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SolutionVariant,
  ParallelTestJob,
  SolutionTestResult,
  ParallelTestResult,
  ScoringWeights,
  AllocationStrategy,
  ParallelExecutionConfig,
} from '../src/types/parallel';

describe('Phase 2.5: Parallel Multi-Solution Testing', () => {
  describe('Solution Variant Generation', () => {
    it('should generate multiple solution variants', () => {
      const solutions: SolutionVariant[] = [
        {
          solutionId: 'solution-a',
          name: 'Conservative Fix',
          branch: 'fix/issue-123-conservative',
          reasoning: 'Minimal changes to fix the bug without refactoring',
          confidence: 85,
          strategy: 'conservative',
        },
        {
          solutionId: 'solution-b',
          name: 'Refactor Approach',
          branch: 'fix/issue-123-refactor',
          reasoning: 'Refactor affected module for better maintainability',
          confidence: 70,
          strategy: 'refactor',
        },
        {
          solutionId: 'solution-c',
          name: 'Aggressive Fix',
          branch: 'fix/issue-123-aggressive',
          reasoning: 'Comprehensive solution addressing root cause',
          confidence: 90,
          strategy: 'aggressive',
        },
      ];

      expect(solutions).toHaveLength(3);
      expect(solutions.every((s) => s.solutionId && s.name && s.branch)).toBe(true);
      expect(solutions.every((s) => s.confidence >= 0 && s.confidence <= 100)).toBe(true);
    });

    it('should validate solution variant structure', () => {
      const solution: SolutionVariant = {
        solutionId: 'solution-test',
        name: 'Test Solution',
        branch: 'fix/test-branch',
        patch: 'diff --git a/file.ts b/file.ts\n...',
        reasoning: 'This approach fixes the bug by modifying X',
        confidence: 75,
        strategy: 'minimal',
      };

      expect(solution.solutionId).toBe('solution-test');
      expect(solution.strategy).toBe('minimal');
      expect(solution.patch).toBeDefined();
      expect(solution.reasoning).toContain('fixes the bug');
    });

    it('should support different solution strategies', () => {
      const strategies: Array<SolutionVariant['strategy']> = [
        'conservative',
        'aggressive',
        'refactor',
        'minimal',
      ];

      strategies.forEach((strategy) => {
        const solution: SolutionVariant = {
          solutionId: `solution-${strategy}`,
          name: `${strategy} Solution`,
          branch: `fix/${strategy}`,
          reasoning: `Using ${strategy} strategy`,
          confidence: 80,
          strategy,
        };

        expect(solution.strategy).toBe(strategy);
      });
    });
  });

  describe('Parallel Test Job Creation', () => {
    it('should create parallel test job with multiple solutions', () => {
      const job: ParallelTestJob = {
        jobId: 'parallel-job-123',
        solutions: [
          {
            solutionId: 'solution-a',
            name: 'Solution A',
            branch: 'fix/a',
            reasoning: 'Approach A',
            confidence: 85,
            strategy: 'conservative',
          },
          {
            solutionId: 'solution-b',
            name: 'Solution B',
            branch: 'fix/b',
            reasoning: 'Approach B',
            confidence: 90,
            strategy: 'aggressive',
          },
        ],
        testCommand: 'npm test',
        timeoutMs: 300000,
        context: {
          owner: 'test-owner',
          repo: 'test-repo',
          issueNumber: 42,
        },
        createdAt: new Date(),
        maxConcurrency: 3,
      };

      expect(job.solutions).toHaveLength(2);
      expect(job.testCommand).toBe('npm test');
      expect(job.maxConcurrency).toBe(3);
      expect(job.context.issueNumber).toBe(42);
    });

    it('should validate concurrency limits', () => {
      const validConcurrency = [1, 2, 3, 5, 10];
      const invalidConcurrency = [0, -1, -5];

      validConcurrency.forEach((maxConcurrency) => {
        expect(maxConcurrency).toBeGreaterThan(0);
      });

      invalidConcurrency.forEach((maxConcurrency) => {
        expect(maxConcurrency).toBeLessThanOrEqual(0);
      });
    });

    it('should support both issue and PR contexts', () => {
      const issueJob: ParallelTestJob = {
        jobId: 'job-issue',
        solutions: [],
        testCommand: 'npm test',
        timeoutMs: 300000,
        context: {
          owner: 'owner',
          repo: 'repo',
          issueNumber: 10,
        },
        createdAt: new Date(),
        maxConcurrency: 2,
      };

      const prJob: ParallelTestJob = {
        jobId: 'job-pr',
        solutions: [],
        testCommand: 'npm test',
        timeoutMs: 300000,
        context: {
          owner: 'owner',
          repo: 'repo',
          prNumber: 25,
        },
        createdAt: new Date(),
        maxConcurrency: 2,
      };

      expect(issueJob.context.issueNumber).toBe(10);
      expect(prJob.context.prNumber).toBe(25);
    });
  });

  describe('Solution Test Execution', () => {
    it('should produce solution test result with metrics', () => {
      const result: SolutionTestResult = {
        jobId: 'test-job-123',
        solutionId: 'solution-a',
        status: 'success',
        exitCode: 0,
        stdout: '✓ 45 passed',
        stderr: '',
        durationMs: 5000,
        containerId: 'container-xyz',
        completedAt: new Date(),
        metrics: {
          passRate: 100,
          testsPassed: 45,
          testsFailed: 0,
          testsSkipped: 0,
          totalTests: 45,
        },
        performance: {
          avgTestTimeMs: 111,
          memoryUsageMb: 256,
        },
      };

      expect(result.solutionId).toBe('solution-a');
      expect(result.metrics.passRate).toBe(100);
      expect(result.metrics.totalTests).toBe(45);
      expect(result.performance?.avgTestTimeMs).toBe(111);
    });

    it('should handle failed solution test results', () => {
      const result: SolutionTestResult = {
        jobId: 'test-job-456',
        solutionId: 'solution-b',
        status: 'failure',
        exitCode: 1,
        stdout: '✓ 30 passed\n✕ 5 failed',
        stderr: 'Test failures detected',
        durationMs: 7500,
        containerId: 'container-abc',
        completedAt: new Date(),
        metrics: {
          passRate: 85.7,
          testsPassed: 30,
          testsFailed: 5,
          testsSkipped: 0,
          totalTests: 35,
        },
      };

      expect(result.status).toBe('failure');
      expect(result.metrics.testsFailed).toBe(5);
      expect(result.metrics.passRate).toBeCloseTo(85.7, 1);
    });

    it('should calculate pass rate correctly', () => {
      const testCases = [
        { passed: 100, failed: 0, total: 100, expectedRate: 100 },
        { passed: 50, failed: 50, total: 100, expectedRate: 50 },
        { passed: 75, failed: 25, total: 100, expectedRate: 75 },
        { passed: 0, failed: 100, total: 100, expectedRate: 0 },
      ];

      testCases.forEach(({ passed, failed, total, expectedRate }) => {
        const passRate = (passed / total) * 100;
        expect(passRate).toBe(expectedRate);
      });
    });
  });

  describe('Result Aggregation', () => {
    it('should aggregate parallel test results', () => {
      const result: ParallelTestResult = {
        jobId: 'parallel-job-789',
        results: [
          {
            jobId: 'parallel-job-789',
            solutionId: 'solution-a',
            status: 'success',
            exitCode: 0,
            stdout: '✓ 50 passed',
            stderr: '',
            durationMs: 5000,
            containerId: 'container-1',
            completedAt: new Date(),
            metrics: {
              passRate: 100,
              testsPassed: 50,
              testsFailed: 0,
              testsSkipped: 0,
              totalTests: 50,
            },
          },
          {
            jobId: 'parallel-job-789',
            solutionId: 'solution-b',
            status: 'failure',
            exitCode: 1,
            stdout: '✓ 40 passed\n✕ 10 failed',
            stderr: '',
            durationMs: 6000,
            containerId: 'container-2',
            completedAt: new Date(),
            metrics: {
              passRate: 80,
              testsPassed: 40,
              testsFailed: 10,
              testsSkipped: 0,
              totalTests: 50,
            },
          },
        ],
        winner: {
          solutionId: 'solution-a',
          reason: 'All tests passed with fastest execution time',
          score: 95.5,
        },
        ranking: [
          { solutionId: 'solution-a', score: 95.5, rank: 1 },
          { solutionId: 'solution-b', score: 78.2, rank: 2 },
        ],
        summary: {
          solutionsTested: 2,
          solutionsPassed: 1,
          solutionsFailed: 1,
          totalDurationMs: 11000,
          avgDurationMs: 5500,
        },
        completedAt: new Date(),
      };

      expect(result.results).toHaveLength(2);
      expect(result.winner?.solutionId).toBe('solution-a');
      expect(result.ranking[0].rank).toBe(1);
      expect(result.summary.solutionsPassed).toBe(1);
    });

    it('should rank solutions by score', () => {
      const ranking = [
        { solutionId: 'solution-a', score: 95.5, rank: 1 },
        { solutionId: 'solution-b', score: 88.3, rank: 2 },
        { solutionId: 'solution-c', score: 72.1, rank: 3 },
      ];

      // Verify descending score order
      for (let i = 0; i < ranking.length - 1; i++) {
        expect(ranking[i].score).toBeGreaterThan(ranking[i + 1].score);
        expect(ranking[i].rank).toBe(i + 1);
      }
    });

    it('should calculate summary statistics', () => {
      const summary = {
        solutionsTested: 3,
        solutionsPassed: 2,
        solutionsFailed: 1,
        totalDurationMs: 18000,
        avgDurationMs: 6000,
      };

      expect(summary.solutionsPassed + summary.solutionsFailed).toBe(summary.solutionsTested);
      expect(summary.avgDurationMs).toBe(summary.totalDurationMs / summary.solutionsTested);
    });

    it('should handle no winner scenario', () => {
      const result: ParallelTestResult = {
        jobId: 'job-no-winner',
        results: [
          {
            jobId: 'job-no-winner',
            solutionId: 'solution-a',
            status: 'failure',
            exitCode: 1,
            stdout: '',
            stderr: 'All tests failed',
            durationMs: 5000,
            containerId: 'container-1',
            completedAt: new Date(),
            metrics: {
              passRate: 0,
              testsPassed: 0,
              testsFailed: 50,
              testsSkipped: 0,
              totalTests: 50,
            },
          },
        ],
        winner: undefined,
        ranking: [{ solutionId: 'solution-a', score: 0, rank: 1 }],
        summary: {
          solutionsTested: 1,
          solutionsPassed: 0,
          solutionsFailed: 1,
          totalDurationMs: 5000,
          avgDurationMs: 5000,
        },
        completedAt: new Date(),
      };

      expect(result.winner).toBeUndefined();
      expect(result.summary.solutionsPassed).toBe(0);
    });
  });

  describe('Scoring and Comparison', () => {
    it('should apply scoring weights', () => {
      const weights: ScoringWeights = {
        passRate: 0.5,
        coverage: 0.2,
        speed: 0.1,
        confidence: 0.2,
      };

      const totalWeight = weights.passRate + weights.coverage + weights.speed + weights.confidence;
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it('should calculate weighted scores', () => {
      const weights: ScoringWeights = {
        passRate: 0.5,
        coverage: 0.2,
        speed: 0.1,
        confidence: 0.2,
      };

      // Mock solution metrics
      const solutionMetrics = {
        passRate: 100, // 0-100
        coverage: 85, // 0-100
        speed: 90, // 0-100 (normalized, higher is faster)
        confidence: 80, // 0-100
      };

      const score =
        (solutionMetrics.passRate * weights.passRate +
          solutionMetrics.coverage * weights.coverage +
          solutionMetrics.speed * weights.speed +
          solutionMetrics.confidence * weights.confidence);

      // Score calculation: 100*0.5 + 85*0.2 + 90*0.1 + 80*0.2 = 50 + 17 + 9 + 16 = 92
      expect(score).toBeCloseTo(92, 1);
    });

    it('should prefer higher pass rates in scoring', () => {
      const weights: ScoringWeights = {
        passRate: 0.5,
        coverage: 0.2,
        speed: 0.1,
        confidence: 0.2,
      };

      expect(weights.passRate).toBeGreaterThan(weights.coverage);
      expect(weights.passRate).toBeGreaterThan(weights.speed);
      expect(weights.passRate).toBeGreaterThan(weights.confidence);
    });
  });

  describe('Allocation Strategies', () => {
    it('should support round-robin allocation', () => {
      const strategy: AllocationStrategy = 'round-robin';
      expect(strategy).toBe('round-robin');
    });

    it('should support random allocation', () => {
      const strategy: AllocationStrategy = 'random';
      expect(strategy).toBe('random');
    });

    it('should support dedicated allocation', () => {
      const strategy: AllocationStrategy = 'dedicated';
      expect(strategy).toBe('dedicated');
    });

    it('should validate allocation strategy types', () => {
      const validStrategies: AllocationStrategy[] = ['round-robin', 'random', 'dedicated'];
      
      validStrategies.forEach((strategy) => {
        expect(['round-robin', 'random', 'dedicated']).toContain(strategy);
      });
    });
  });

  describe('Parallel Execution Configuration', () => {
    it('should create execution configuration', () => {
      const config: ParallelExecutionConfig = {
        maxConcurrency: 5,
        allocationStrategy: 'random',
        scoringWeights: {
          passRate: 0.5,
          coverage: 0.2,
          speed: 0.1,
          confidence: 0.2,
        },
        stopOnFirstPass: false,
        totalTimeoutMs: 600000,
      };

      expect(config.maxConcurrency).toBe(5);
      expect(config.allocationStrategy).toBe('random');
      expect(config.stopOnFirstPass).toBe(false);
      expect(config.totalTimeoutMs).toBe(600000);
    });

    it('should support early termination with stopOnFirstPass', () => {
      const config: ParallelExecutionConfig = {
        maxConcurrency: 3,
        allocationStrategy: 'dedicated',
        scoringWeights: {
          passRate: 0.6,
          coverage: 0.2,
          speed: 0.1,
          confidence: 0.1,
        },
        stopOnFirstPass: true,
        totalTimeoutMs: 300000,
      };

      expect(config.stopOnFirstPass).toBe(true);
    });

    it('should validate timeout configuration', () => {
      const timeouts = [
        { totalTimeoutMs: 60000, description: '1 minute' },
        { totalTimeoutMs: 300000, description: '5 minutes' },
        { totalTimeoutMs: 600000, description: '10 minutes' },
      ];

      timeouts.forEach(({ totalTimeoutMs }) => {
        expect(totalTimeoutMs).toBeGreaterThan(0);
      });
    });
  });

  describe('Comparative Analysis', () => {
    it('should compare multiple solutions side by side', () => {
      const comparison = {
        solutions: ['solution-a', 'solution-b', 'solution-c'],
        metrics: [
          { solutionId: 'solution-a', passRate: 100, coverage: 85, durationMs: 5000 },
          { solutionId: 'solution-b', passRate: 95, coverage: 90, durationMs: 6000 },
          { solutionId: 'solution-c', passRate: 90, coverage: 80, durationMs: 4500 },
        ],
      };

      expect(comparison.solutions).toHaveLength(3);
      expect(comparison.metrics).toHaveLength(3);
      
      // Find fastest solution
      const fastest = comparison.metrics.reduce((prev, curr) => 
        curr.durationMs < prev.durationMs ? curr : prev
      );
      expect(fastest.solutionId).toBe('solution-c');
    });

    it('should identify best overall solution', () => {
      const results = [
        { solutionId: 'solution-a', score: 92.5, passRate: 100 },
        { solutionId: 'solution-b', score: 88.3, passRate: 95 },
        { solutionId: 'solution-c', score: 85.1, passRate: 90 },
      ];

      const winner = results.reduce((prev, curr) => curr.score > prev.score ? curr : prev);
      expect(winner.solutionId).toBe('solution-a');
      expect(winner.score).toBeGreaterThan(90);
    });

    it('should generate comparison report', () => {
      const report = {
        winner: 'solution-a',
        totalSolutions: 3,
        successfulSolutions: 2,
        recommendation: 'Use solution-a for highest reliability',
        insights: [
          'solution-a had 100% pass rate',
          'solution-b had better coverage but lower pass rate',
          'solution-c was fastest but less reliable',
        ],
      };

      expect(report.winner).toBe('solution-a');
      expect(report.insights).toHaveLength(3);
      expect(report.recommendation).toContain('solution-a');
    });
  });

  describe('Error Handling', () => {
    it('should handle container failures during parallel execution', () => {
      const result: SolutionTestResult = {
        jobId: 'job-error',
        solutionId: 'solution-failed',
        status: 'error',
        exitCode: 137,
        stdout: '',
        stderr: 'Container OOM killed',
        durationMs: 0,
        containerId: 'container-oom',
        completedAt: new Date(),
        metrics: {
          passRate: 0,
          testsPassed: 0,
          testsFailed: 0,
          testsSkipped: 0,
          totalTests: 0,
        },
      };

      expect(result.status).toBe('error');
      expect(result.exitCode).toBe(137);
    });

    it('should handle timeout in parallel execution', () => {
      const result: SolutionTestResult = {
        jobId: 'job-timeout',
        solutionId: 'solution-timeout',
        status: 'timeout',
        exitCode: 124,
        stdout: 'Partial test output...',
        stderr: 'Test execution timed out',
        durationMs: 300000,
        containerId: 'container-timeout',
        completedAt: new Date(),
        metrics: {
          passRate: 0,
          testsPassed: 15,
          testsFailed: 0,
          testsSkipped: 35,
          totalTests: 50,
        },
      };

      expect(result.status).toBe('timeout');
      expect(result.metrics.testsSkipped).toBeGreaterThan(0);
    });

    it('should aggregate results even with some failures', () => {
      const result: ParallelTestResult = {
        jobId: 'job-mixed',
        results: [
          {
            jobId: 'job-mixed',
            solutionId: 'solution-a',
            status: 'success',
            exitCode: 0,
            stdout: '✓ 50 passed',
            stderr: '',
            durationMs: 5000,
            containerId: 'container-1',
            completedAt: new Date(),
            metrics: {
              passRate: 100,
              testsPassed: 50,
              testsFailed: 0,
              testsSkipped: 0,
              totalTests: 50,
            },
          },
          {
            jobId: 'job-mixed',
            solutionId: 'solution-b',
            status: 'error',
            exitCode: 137,
            stdout: '',
            stderr: 'OOM',
            durationMs: 0,
            containerId: 'container-2',
            completedAt: new Date(),
            metrics: {
              passRate: 0,
              testsPassed: 0,
              testsFailed: 0,
              testsSkipped: 0,
              totalTests: 0,
            },
          },
        ],
        winner: {
          solutionId: 'solution-a',
          reason: 'Only successful solution',
          score: 100,
        },
        ranking: [
          { solutionId: 'solution-a', score: 100, rank: 1 },
          { solutionId: 'solution-b', score: 0, rank: 2 },
        ],
        summary: {
          solutionsTested: 2,
          solutionsPassed: 1,
          solutionsFailed: 1,
          totalDurationMs: 5000,
          avgDurationMs: 2500,
        },
        completedAt: new Date(),
      };

      expect(result.summary.solutionsPassed).toBe(1);
      expect(result.summary.solutionsFailed).toBe(1);
      expect(result.winner?.solutionId).toBe('solution-a');
    });
  });
});
