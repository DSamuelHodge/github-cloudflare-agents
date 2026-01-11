/**
 * PRAgent - Automated Pull Request creation from AI solutions
 * Phase 2.6: Automated PR Workflow
 * 
 * Creates PRs for winning solutions from parallel testing,
 * posts test summaries, and handles branch cleanup.
 */

import { BaseAgent } from '../base/BaseAgent';
import type { AgentContext, AgentResult } from '../../types/agents';
import type { GitHubEvent } from '../../types/events';
import type { Env } from '../../types/env';
import type {
  PRWorkflowJob,
  PRWorkflowStatus,
  PRSummary,
  CreatedPR,
  BranchCleanupResult,
} from '../../types/pr-workflow';
import type { ParallelTestResult, SolutionVariant } from '../../types/parallel';
import { PRService } from '../../platform/pr';
import { GitHubStreamUpdater } from '../../platform/streaming';
import { defaultPRAgentConfig, type FullPRAgentConfig } from './config';

export class PRAgent extends BaseAgent {
  name = 'PRAgent';
  version = '1.0.0';
  description = 'Creates automated PRs from AI-generated solutions with test summaries';
  triggers: GitHubEvent['type'][] = ['issue_comment', 'workflow_run'];

  private prService: PRService | null = null;
  private streamUpdater: GitHubStreamUpdater | null = null;
  private prConfig: FullPRAgentConfig;

  constructor(config?: Partial<FullPRAgentConfig>) {
    const fullConfig = { ...defaultPRAgentConfig, ...config };
    super(fullConfig);
    this.prConfig = fullConfig;
  }

  /**
   * Determines if this agent should handle the event
   */
  async shouldHandle(context: AgentContext): Promise<boolean> {
    const parentShouldHandle = await super.shouldHandle(context);
    if (!parentShouldHandle) {
      return false;
    }

    const payload = context.payload as any;

    // Handle issue comments with PR creation trigger
    if (context.eventType === 'issue_comment') {
      const comment = payload.comment?.body || '';
      return comment.includes('/create-pr') || 
             comment.includes('/submit-pr') ||
             comment.includes('/auto-pr');
    }

    // Handle workflow_run events (triggered after parallel tests complete)
    if (context.eventType === 'workflow_run') {
      return payload.action === 'completed' && 
             payload.workflow_run?.conclusion === 'success';
    }

    return false;
  }

  /**
   * Execute PR creation workflow
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // Initialize services
      const fullEnv = context.env as Env;
      this.prService = new PRService(fullEnv);
      this.streamUpdater = new GitHubStreamUpdater(fullEnv);

      // Extract workflow parameters
      const workflowParams = this.extractWorkflowParameters(context);

      // Create workflow job tracker
      const workflowJob: PRWorkflowJob = {
        jobId: `pr-${Date.now()}`,
        issueNumber: workflowParams.issueNumber,
        solution: workflowParams.solution,
        testResults: workflowParams.testResults,
        status: 'pending',
        context: {
          owner: workflowParams.owner,
          repo: workflowParams.repo,
        },
        createdAt: new Date(),
      };

      context.logger.info('Starting PR workflow', {
        jobId: workflowJob.jobId,
        solutionId: workflowJob.solution.solutionId,
        issueNumber: workflowJob.issueNumber,
      });

      // Validate solution meets criteria
      const validation = this.validateSolution(workflowJob);
      if (!validation.valid) {
        context.logger.warn('Solution does not meet PR criteria', {
          reason: validation.reason,
        });

        return {
          success: false,
          agentName: this.name,
          error: validation.reason,
          data: { workflowJob },
        };
      }

      // Execute workflow steps
      let createdPR: CreatedPR | undefined;
      let cleanupResult: BranchCleanupResult | undefined;

      try {
        // Step 1: Create PR
        workflowJob.status = 'creating-pr';
        createdPR = await this.createPRForSolution(workflowJob, context);
        workflowJob.createdPR = createdPR;

        // Step 2: Add labels
        workflowJob.status = 'adding-labels';
        if (this.prConfig.autoLabels.length > 0) {
          await this.prService.addLabels(
            workflowParams.owner,
            workflowParams.repo,
            createdPR.number,
            this.prConfig.autoLabels
          );
        }

        // Step 3: Post test summary comment
        workflowJob.status = 'posting-summary';
        await this.postTestSummary(workflowJob, createdPR.number, context);

        // Step 4: Link to issue
        if (this.prConfig.linkToIssue && workflowJob.issueNumber) {
          await this.prService.linkPRToIssue(
            workflowParams.owner,
            workflowParams.repo,
            createdPR.number,
            workflowJob.issueNumber
          );
        }

        // Step 5: Cleanup branches (optional)
        if (this.prConfig.cleanupBranches && workflowJob.testResults) {
          const branchesToClean = this.getBranchesToCleanup(workflowJob);
          if (branchesToClean.length > 0) {
            cleanupResult = await this.prService.cleanupBranches({
              owner: workflowParams.owner,
              repo: workflowParams.repo,
              branches: branchesToClean,
              skipPatterns: ['main', 'master', 'develop'],
            });
          }
        }

        workflowJob.status = 'completed';
        workflowJob.completedAt = new Date();

        // Record metrics
        context.metrics.increment('prs_created', 1);
        context.metrics.timing('pr_workflow_duration', Date.now() - startTime);

        context.logger.info('PR workflow completed', {
          jobId: workflowJob.jobId,
          prNumber: createdPR.number,
          prUrl: createdPR.url,
        });

        return {
          success: true,
          agentName: this.name,
          data: {
            workflowJob,
            createdPR,
            cleanupResult,
          },
          metadata: {
            executionTimeMs: Date.now() - startTime,
            prNumber: createdPR.number,
            prUrl: createdPR.url,
          },
        };
      } catch (stepError) {
        workflowJob.status = 'failed';
        workflowJob.error = stepError instanceof Error ? stepError.message : String(stepError);
        throw stepError;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      context.logger.error('PR workflow failed', err);

      context.metrics.increment('pr_workflow_failures', 1);

      return {
        success: false,
        agentName: this.name,
        error: err.message,
      };
    }
  }

  /**
   * Extract workflow parameters from event context
   */
  private extractWorkflowParameters(context: AgentContext): {
    owner: string;
    repo: string;
    issueNumber?: number;
    solution: SolutionVariant;
    testResults?: ParallelTestResult;
  } {
    const payload = context.payload as any;

    // Default solution (would come from parallel test results in real scenario)
    const solution: SolutionVariant = payload.solution || {
      solutionId: 'solution-a',
      name: 'Minimal Fix',
      branch: `fix-${Date.now()}`,
      reasoning: 'AI-generated solution',
      confidence: 80,
      strategy: 'minimal',
    };

    return {
      owner: payload.repository?.owner?.login || '',
      repo: payload.repository?.name || '',
      issueNumber: payload.issue?.number,
      solution,
      testResults: payload.testResults,
    };
  }

  /**
   * Validate solution meets criteria for PR creation
   */
  private validateSolution(job: PRWorkflowJob): { valid: boolean; reason?: string } {
    const { solution, testResults } = job;

    // Check confidence threshold
    if (solution.confidence < this.prConfig.minConfidenceForPR) {
      return {
        valid: false,
        reason: `Confidence ${solution.confidence}% below threshold ${this.prConfig.minConfidenceForPR}%`,
      };
    }

    // Check test results if available
    if (testResults) {
      const solutionResult = testResults.results.find(r => r.solutionId === solution.solutionId);
      if (solutionResult) {
        if (solutionResult.metrics.passRate < this.prConfig.minPassRateForPR) {
          return {
            valid: false,
            reason: `Pass rate ${solutionResult.metrics.passRate}% below threshold ${this.prConfig.minPassRateForPR}%`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Create PR for the solution
   */
  private async createPRForSolution(
    job: PRWorkflowJob,
    context: AgentContext
  ): Promise<CreatedPR> {
    if (!this.prService) {
      throw new Error('PRService not initialized');
    }

    const { solution, testResults, context: ghContext, issueNumber } = job;

    // Generate PR title
    const title = issueNumber
      ? `[AI Fix] ${solution.name} for #${issueNumber}`
      : `[AI Fix] ${solution.name}`;

    // Generate PR body
    const body = this.prService.generatePRBody(
      solution,
      testResults || { 
        jobId: job.jobId, 
        results: [], 
        ranking: [], 
        summary: { 
          solutionsTested: 0, 
          solutionsPassed: 0, 
          solutionsFailed: 0, 
          totalDurationMs: 0, 
          avgDurationMs: 0 
        }, 
        completedAt: new Date() 
      },
      issueNumber
    );

    return this.prService.createPullRequest({
      owner: ghContext.owner,
      repo: ghContext.repo,
      baseBranch: 'main',
      headBranch: solution.branch,
      title,
      body,
      draft: this.prConfig.createAsDraft,
      labels: this.prConfig.autoLabels,
      reviewers: this.prConfig.autoReviewers,
      issueNumber,
    });
  }

  /**
   * Post test summary comment on PR
   */
  private async postTestSummary(
    job: PRWorkflowJob,
    prNumber: number,
    context: AgentContext
  ): Promise<void> {
    if (!this.prService) return;

    const { solution, testResults, context: ghContext } = job;
    const solutionResult = testResults?.results.find(r => r.solutionId === solution.solutionId);

    const summary: PRSummary = {
      solutionId: solution.solutionId,
      solutionName: solution.name,
      strategy: solution.strategy,
      passRate: solutionResult?.metrics.passRate ?? 0,
      testStats: {
        passed: solutionResult?.metrics.testsPassed ?? 0,
        failed: solutionResult?.metrics.testsFailed ?? 0,
        total: solutionResult?.metrics.totalTests ?? 0,
      },
      durationMs: solutionResult?.durationMs ?? 0,
      coverage: solutionResult?.coverage,
      reasoning: solution.reasoning,
      confidence: solution.confidence,
    };

    await this.prService.postTestSummaryComment(
      ghContext.owner,
      ghContext.repo,
      prNumber,
      summary
    );
  }

  /**
   * Get branches to cleanup (failed solution branches)
   */
  private getBranchesToCleanup(job: PRWorkflowJob): string[] {
    if (!job.testResults) return [];

    // Get all solution branches except the winner
    const winnerSolutionId = job.testResults.winner?.solutionId;
    
    return job.testResults.results
      .filter(r => r.solutionId !== winnerSolutionId)
      .map(r => {
        // Extract branch from solution ID pattern
        // Assumes branch format: main-fix-{jobId}-{strategyId}
        return `main-fix-${job.jobId.replace('pr-', '')}-${r.solutionId.replace('solution-', '')}`;
      });
  }
}
