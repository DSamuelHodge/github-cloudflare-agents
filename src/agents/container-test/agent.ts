/**
 * ContainerTestAgent - Routes test jobs to container instances
 * Executes tests in isolated git worktree environments
 * 
 * Phase 2.5: Supports parallel multi-solution testing
 */

import { BaseAgent } from '../base/BaseAgent';
import type { AgentContext, AgentResult } from '../../types/agents';
import type { GitHubEvent } from '../../types/events';
import type { TestJob, TestResult } from '../../types/containers';
import type { Env } from '../../types/env';
import type {
  ParallelTestJob,
  ParallelTestResult,
} from '../../types/parallel';
import { ContainerService } from '../../platform/containers/service';
import { R2StorageService, type ArtifactMetadata, type StoredArtifact } from '../../platform/storage';
import { GitHubStreamUpdater } from '../../platform/streaming';
import {
  ParallelTestService,
  SolutionGenerator,
  ResultAggregator,
} from '../../platform/parallel';
import { AgentError } from '../../utils/errors';
import { containerTestAgentConfig } from './config';

export class ContainerTestAgent extends BaseAgent {
  name = 'ContainerTestAgent';
  version = '1.0.0';
  description = 'Executes tests in isolated container environments using git-worktree-runner';
  triggers: GitHubEvent['type'][] = ['issue_comment', 'pull_request'];

  private containerService: ContainerService | null = null;
  private storageService: R2StorageService | null = null;
  private streamUpdater: GitHubStreamUpdater | null = null;
  private parallelService: ParallelTestService | null = null;
  private resultAggregator: ResultAggregator | null = null;

  constructor() {
    super(containerTestAgentConfig);
  }

  /**
   * Determines if this agent should handle the event
   */
  async shouldHandle(context: AgentContext): Promise<boolean> {
    // First call parent shouldHandle for basic checks
    const parentShouldHandle = await super.shouldHandle(context);
    if (!parentShouldHandle) {
      return false;
    }

    const payload = context.payload as { comment?: { body?: string }; action?: string; pull_request?: { head: { ref: string } } };

    // Handle issue comments with test trigger
    if (context.eventType === 'issue_comment') {
      const comment = payload.comment?.body || '';
      // Support parallel test trigger: /test-parallel or /test --parallel
      return comment.includes('/test') || 
             comment.includes('/run-tests') ||
             comment.includes('/test-parallel');
    }

    // Handle PR events for test suite
    if (context.eventType === 'pull_request') {
      const action = payload.action;
      return action === 'opened' || action === 'synchronize';
    }

    return false;
  }

  /**
   * Execute test job in container
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // Initialize container service with full Env
      const fullEnv: Env = {
        ...context.env,
        TEST_CONTAINER: context.env.TEST_ARTIFACTS as unknown as DurableObjectNamespace,
      } as Env;
      
      this.containerService = new ContainerService(fullEnv);
      
      // Initialize storage service for artifact persistence
      try {
        this.storageService = new R2StorageService(fullEnv);
      } catch {
        context.logger.warn('R2 storage not available, artifacts will not be persisted');
        this.storageService = null;
      }

      // Initialize stream updater for real-time GitHub comments
      this.streamUpdater = new GitHubStreamUpdater(fullEnv);
      
      // Initialize parallel testing services (Phase 2.5)
      this.parallelService = new ParallelTestService(fullEnv, {
          maxConcurrency: 5,
        allocationStrategy: 'random',
      });
      this.resultAggregator = new ResultAggregator();

      // Extract test parameters from event
      const testParams = this.extractTestParameters(context);
      
      // Check if parallel mode is requested
      const isParallelMode = this.isParallelModeRequested(context);
      
      if (isParallelMode) {
        return await this.executeParallelTests(context, testParams, startTime);
      }

      // Create test job
      const job: TestJob = {
        jobId: this.containerService.generateJobId(),
        branch: testParams.branch,
        command: testParams.command,
        timeoutMs: testParams.timeoutMs,
        env: testParams.env,
        context: testParams.githubContext,
        createdAt: new Date(),
      };

      context.logger.info('Starting test job', {
        jobId: job.jobId,
        branch: job.branch,
        command: job.command,
      });

      // Post initial progress comment to GitHub
      const issueNumber = testParams.githubContext.prNumber || testParams.githubContext.issueNumber;
      if (this.streamUpdater && issueNumber) {
        await this.streamUpdater.updateProgressComment(
          testParams.githubContext.owner,
          testParams.githubContext.repo,
          issueNumber,
          job.jobId,
          {
            phase: 'cloning',
            percent: 10,
            message: `Starting test execution for branch \`${job.branch}\`...`,
          }
        );
      }

      // Submit job to container
      const coldStartTime = Date.now();
      const result = await this.containerService.submitTestJob(job);
      const executionTime = Date.now() - coldStartTime;

      // Log cold start detection
      if (executionTime > 3000) {
        context.logger.info('Cold start detected', {
          jobId: job.jobId,
          executionTimeMs: executionTime,
        });
      }

      // Log test results
      context.logger.info('Test job completed', {
        jobId: job.jobId,
        status: result.status,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });

      // Persist artifacts to R2
      let artifacts: StoredArtifact[] = [];
      if (this.storageService) {
        try {
          artifacts = await this.persistTestArtifacts(result, job, testParams.githubContext);
          context.logger.info('Test artifacts persisted', {
            jobId: job.jobId,
            artifactCount: artifacts.length,
          });
        } catch (storageError) {
          context.logger.error('Failed to persist artifacts', storageError instanceof Error ? storageError : undefined);
        }
      }

      // Post final result comment to GitHub (replaces progress comment)
      if (this.streamUpdater && issueNumber) {
        await this.streamUpdater.postResultComment(
          testParams.githubContext.owner,
          testParams.githubContext.repo,
          issueNumber,
          job.jobId,
          {
            status: result.status,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            stdout: result.stdout,
            stderr: result.stderr,
            coverage: result.coverage,
            artifactUrls: artifacts.map(a => a.url),
          }
        );
      }

      // Record metrics
      context.metrics.increment('test_jobs_executed', 1);
      context.metrics.timing('test_execution_time', result.durationMs);
      
      if (result.status === 'success') {
        context.metrics.increment('test_jobs_succeeded', 1);
      } else {
        context.metrics.increment('test_jobs_failed', 1);
      }

      // Format result for GitHub comment
      const commentBody = this.formatTestResult(result, job, artifacts);

      return {
        success: result.status === 'success',
        agentName: this.name,
        data: {
          testResult: result,
          artifacts,
          commentBody,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      context.logger.error('Test job execution failed', err);

      return {
        success: false,
        agentName: this.name,
        error: err.message,
      };
    }
  }

  /**
   * Extract test parameters from event context
   */
  private extractTestParameters(context: AgentContext): {
    branch: string;
    command: string;
    timeoutMs: number;
    env: Record<string, string>;
    githubContext: {
      owner: string;
      repo: string;
      prNumber?: number;
      issueNumber?: number;
    };
  } {
    const payload = context.payload as {
      pull_request?: { head: { ref: string }; number: number };
      issue?: { number: number; pull_request?: unknown };
      comment?: { body: string };
      repository: { name: string; owner: { login: string } };
    };

    let branch = 'main';
    let command = 'npm test';
    let prNumber: number | undefined;
    let issueNumber: number | undefined;

    // Extract from PR event
    if (context.eventType === 'pull_request' && payload.pull_request) {
      branch = payload.pull_request.head.ref;
      prNumber = payload.pull_request.number;
    }

    // Extract from issue comment
    if (context.eventType === 'issue_comment') {
      const comment = payload.comment?.body || '';
      issueNumber = payload.issue?.number;

      // Check if issue is a PR
      if (payload.issue?.pull_request) {
        prNumber = payload.issue.number;
        // Branch would need to be fetched from PR API
        // For now, use default
      }

      // Parse command from comment
      const testMatch = comment.match(/\/test(?:\s+(.+))?/);
      if (testMatch && testMatch[1]) {
        command = testMatch[1].trim();
      }
    }

    return {
      branch,
      command,
      timeoutMs: 300000, // 5 minutes default
      env: {
        NODE_ENV: 'test',
        CI: 'true',
      },
      githubContext: {
        owner: payload.repository?.owner?.login || '',
        repo: payload.repository?.name || '',
        prNumber,
        issueNumber,
      },
    };
  }

  /**
   * Persist test artifacts to R2 storage
   */
  private async persistTestArtifacts(
    result: TestResult,
    job: TestJob,
    githubContext: { owner: string; repo: string; prNumber?: number; issueNumber?: number }
  ): Promise<StoredArtifact[]> {
    if (!this.storageService) {
      return [];
    }

    const metadata: ArtifactMetadata = {
      jobId: job.jobId,
      branch: job.branch,
      testCommand: job.command,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      createdAt: new Date().toISOString(),
      owner: githubContext.owner,
      repo: githubContext.repo,
      prNumber: githubContext.prNumber,
      issueNumber: githubContext.issueNumber,
    };

    const artifacts: StoredArtifact[] = [];

    // Store test logs
    const logArtifacts = await this.storageService.storeTestLogs(
      metadata,
      result.stdout || '',
      result.stderr || ''
    );
    artifacts.push(...logArtifacts);

    // Store test summary
    const summaryArtifact = await this.storageService.storeTestSummary(metadata, {
      jobId: job.jobId,
      branch: job.branch,
      command: job.command,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      containerId: result.containerId,
      coverage: result.coverage,
      completedAt: new Date().toISOString(),
    });
    artifacts.push(summaryArtifact);

    // Store coverage report if available
    if (result.coverage) {
      const coverageArtifact = await this.storageService.storeCoverageReport(
        metadata,
        result.coverage,
        'json'
      );
      artifacts.push(coverageArtifact);
    }

    return artifacts;
  }

  /**
   * Format test result as GitHub comment
   */
  private formatTestResult(result: TestResult, job: TestJob, artifacts: StoredArtifact[] = []): string {
    const statusEmoji = result.status === 'success' ? '✅' : '❌';
    const statusText = result.status === 'success' ? 'Passed' : 'Failed';

    let comment = `## ${statusEmoji} Test Results - ${statusText}\n\n`;
    comment += `**Branch:** \`${job.branch}\`\n`;
    comment += `**Command:** \`${job.command}\`\n`;
    comment += `**Duration:** ${(result.durationMs / 1000).toFixed(2)}s\n`;
    comment += `**Container ID:** \`${result.containerId}\`\n\n`;

    if (result.exitCode !== undefined) {
      comment += `**Exit Code:** ${result.exitCode}\n\n`;
    }

    // Add output
    if (result.stdout) {
      comment += `### Output\n\n\`\`\`\n${this.truncateOutput(result.stdout, 2000)}\n\`\`\`\n\n`;
    }

    if (result.stderr) {
      comment += `### Errors\n\n\`\`\`\n${this.truncateOutput(result.stderr, 1000)}\n\`\`\`\n\n`;
    }

    // Add coverage if available
    if (result.coverage) {
      comment += `### Coverage\n\n`;
      comment += `- Lines: ${result.coverage.lines}%\n`;
      comment += `- Functions: ${result.coverage.functions}%\n`;
      comment += `- Branches: ${result.coverage.branches}%\n`;
      comment += `- Statements: ${result.coverage.statements}%\n\n`;
    }

    // Add artifact links if available
    if (artifacts.length > 0) {
      comment += `### Artifacts\n\n`;
      for (const artifact of artifacts) {
        const filename = artifact.key.split('/').pop() || artifact.key;
        comment += `- [${filename}](${artifact.url}) (${this.formatBytes(artifact.size)})\n`;
      }
      comment += '\n';
    }

    comment += `---\n*Powered by ContainerTestAgent v${this.version}*`;

    return comment;
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Truncate output to prevent massive comments
   */
  private truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) {
      return output;
    }

    return output.substring(0, maxLength) + '\n\n... (output truncated)';
  }

  /**
   * Check if parallel mode is requested (Phase 2.5)
   */
  private isParallelModeRequested(context: AgentContext): boolean {
    const payload = context.payload as { comment?: { body?: string } };
    
    if (context.eventType === 'issue_comment') {
      const comment = payload.comment?.body || '';
      return comment.includes('/test-parallel') || 
             comment.includes('--parallel') ||
             comment.includes('/parallel-test');
    }
    
    return false;
  }

  /**
   * Parse parallel execution options (candidate count)
   */
  private parseParallelOptions(context: AgentContext): { candidateCount: number } {
    const payload = context.payload as { comment?: { body?: string } };
    let candidateCount = 3;

    if (context.eventType === 'issue_comment') {
      const comment = payload.comment?.body || '';

      // Allow formats: /test-parallel 4, /test --parallel=5, --solutions=4
      const directMatch = comment.match(/\/test-parallel\s+(\d+)/);
      const flagMatch = comment.match(/--parallel\s*=\s*(\d+)/);
      const solutionsMatch = comment.match(/--solutions\s*=\s*(\d+)/);

      const parsed = directMatch?.[1] || flagMatch?.[1] || solutionsMatch?.[1];
      if (parsed) {
        const count = Number(parsed);
        if (!Number.isNaN(count)) {
          candidateCount = count;
        }
      }
    }

    // Clamp between 3 and 5 to control cost/time
    candidateCount = Math.max(3, Math.min(5, candidateCount));

    return { candidateCount };
  }

  /**
   * Execute parallel multi-solution tests (Phase 2.5)
   */
  private async executeParallelTests(
    context: AgentContext,
    testParams: ReturnType<typeof this.extractTestParameters>,
    startTime: number
  ): Promise<AgentResult> {
    if (!this.parallelService || !this.resultAggregator || !this.containerService) {
      throw new AgentError('Parallel services not initialized', 'SERVICES_NOT_INITIALIZED', 500);
    }

    const jobId = this.containerService.generateJobId();
    const issueNumber = testParams.githubContext.prNumber || testParams.githubContext.issueNumber;
    const { candidateCount } = this.parseParallelOptions(context);

    context.logger.info('Starting parallel test execution', {
      jobId,
      branch: testParams.branch,
      candidateCount,
    });

    // Post initial progress comment
    if (this.streamUpdater && issueNumber) {
      await this.streamUpdater.updateProgressComment(
        testParams.githubContext.owner,
        testParams.githubContext.repo,
        issueNumber,
        jobId,
        {
          phase: 'cloning',
          percent: 5,
          message: `🚀 Starting parallel test execution for branch \`${testParams.branch}\` with ${candidateCount} candidate(s)...`,
        }
      );
    }

    // Generate solution variants
    const solutionGenerator = new SolutionGenerator(testParams.branch);
    const solutions = solutionGenerator.generateVariants(jobId, {
      title: 'Parallel Test Run',
      body: `Testing branch ${testParams.branch} with multiple strategies`,
    }, candidateCount);

    context.logger.info('Generated solution variants', {
      jobId,
      solutionCount: solutions.length,
      solutionIds: solutions.map(s => s.solutionId),
    });

    // Update progress
    if (this.streamUpdater && issueNumber) {
      await this.streamUpdater.updateProgressComment(
        testParams.githubContext.owner,
        testParams.githubContext.repo,
        issueNumber,
        jobId,
        {
          phase: 'testing',
          percent: 20,
          message: `Running ${solutions.length} solution variants in parallel...`,
        }
      );
    }

    // Create parallel test job
    const parallelJob: ParallelTestJob = {
      jobId,
      solutions,
      testCommand: testParams.command,
      timeoutMs: testParams.timeoutMs,
      context: testParams.githubContext,
      createdAt: new Date(),
      maxConcurrency: Math.min(candidateCount, 5),
    };

    // Execute parallel tests
    const parallelResult = await this.parallelService.executeParallelTests(parallelJob);

    // Generate comparison report
    const markdownReport = this.resultAggregator.generateMarkdownReport(parallelResult);

    // Persist artifacts for all solutions
    const allArtifacts: StoredArtifact[] = [];
    if (this.storageService) {
      for (const result of parallelResult.results) {
        try {
          const solutionArtifacts = await this.persistTestArtifacts(
            result,
            {
              jobId: result.jobId,
              branch: solutions.find(s => s.solutionId === result.solutionId)?.branch || testParams.branch,
              command: testParams.command,
              timeoutMs: testParams.timeoutMs,
              env: testParams.env,
              context: testParams.githubContext,
              createdAt: new Date(),
            },
            testParams.githubContext
          );
          allArtifacts.push(...solutionArtifacts);
        } catch (err) {
          context.logger.warn('Failed to persist artifacts for solution', {
            solutionId: result.solutionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Post final result comment
    if (this.streamUpdater && issueNumber) {
      await this.streamUpdater.postResultComment(
        testParams.githubContext.owner,
        testParams.githubContext.repo,
        issueNumber,
        jobId,
        {
          status: parallelResult.winner ? 'success' : 'error',
          exitCode: parallelResult.winner ? 0 : 1,
          durationMs: parallelResult.summary.totalDurationMs,
          stdout: markdownReport,
          stderr: '',
          artifactUrls: allArtifacts.map(a => a.url),
        }
      );
    }

    // Record metrics
    context.metrics.increment('parallel_test_jobs_executed', 1);
    context.metrics.increment('parallel_solutions_tested', parallelResult.summary.solutionsTested);
    context.metrics.timing('parallel_execution_time', parallelResult.summary.totalDurationMs);

    return {
      success: parallelResult.winner !== undefined,
      agentName: this.name,
      data: {
        parallelResult,
        markdownReport,
        artifacts: allArtifacts,
        winner: parallelResult.winner,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        mode: 'parallel',
        solutionsTested: parallelResult.summary.solutionsTested,
      },
    };
  }

  /**
   * Format parallel test result as GitHub comment
   */
  private formatParallelTestResult(
    result: ParallelTestResult,
    artifacts: StoredArtifact[] = []
  ): string {
    let comment = `## 🔄 Parallel Test Results\n\n`;
    comment += `Tested **${result.summary.solutionsTested}** solution variants\n\n`;

    // Summary
    comment += `### Summary\n`;
    comment += `- ✅ Passed: ${result.summary.solutionsPassed}\n`;
    comment += `- ❌ Failed: ${result.summary.solutionsFailed}\n`;
    comment += `- ⏱️ Total Duration: ${(result.summary.totalDurationMs / 1000).toFixed(2)}s\n\n`;

    // Ranking table
    comment += `### Solution Rankings\n\n`;
    comment += `| Rank | Solution | Pass Rate | Score |\n`;
    comment += `|:----:|----------|----------:|------:|\n`;
    
    for (const rank of result.ranking) {
      const solutionResult = result.results.find(r => r.solutionId === rank.solutionId);
      const passRate = solutionResult?.metrics.passRate ?? 0;
      comment += `| ${rank.rank} | ${rank.solutionId} | ${passRate.toFixed(1)}% | ${rank.score.toFixed(1)} |\n`;
    }
    comment += '\n';

    // Winner
    if (result.winner) {
      comment += `### 🏆 Recommended Solution\n\n`;
      comment += `**${result.winner.solutionId}** with score ${result.winner.score.toFixed(1)}\n`;
      comment += `> ${result.winner.reason}\n\n`;
    } else {
      comment += `### ⚠️ No Winner\n\n`;
      comment += `All solutions failed or produced errors. Manual review required.\n\n`;
    }

    // Artifact links
    if (artifacts.length > 0) {
      comment += `### Artifacts\n\n`;
      for (const artifact of artifacts) {
        const filename = artifact.key.split('/').pop() || artifact.key;
        comment += `- [${filename}](${artifact.url}) (${this.formatBytes(artifact.size)})\n`;
      }
      comment += '\n';
    }

    comment += `---\n*Powered by ContainerTestAgent v${this.version} (Parallel Mode)*`;

    return comment;
  }
}
