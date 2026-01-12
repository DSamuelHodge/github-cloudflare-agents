/**
 * PR Review Agent
 * Phase 3.5: Automated PR code review - Analysis Engine
 */

import { BaseAgent } from '../base/BaseAgent';
import type { AgentContext, AgentResult } from '../../types/agents';
import { createGitHubClient } from '../../platform/github';
import { createAIClient } from '../../platform/ai/client';
import { PermissionService } from '../../platform/github/permissions';
import { getGlobalPhase3Analytics } from '../../platform/analytics';
import { CodeAnalysisService } from './services/CodeAnalysisService';
import { GitHubReviewService } from './services/GitHubReviewService';
import { PR_REVIEW_AGENT_CONFIG } from './config';

interface PullRequestWebhookPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    user: { login: string };
    draft: boolean;
  };
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
  };
}

export class PRReviewAgent extends BaseAgent {
  readonly name = 'PRReviewAgent';
  readonly version = '1.0.0';
  readonly triggers = ['pull_request'];

  constructor() {
    super(PR_REVIEW_AGENT_CONFIG);
  }

  async shouldHandle(context: AgentContext): Promise<boolean> {
    const parentCheck = await super.shouldHandle(context);
    if (!parentCheck) return false;

    const reviewConfig = context.repository?.config?.review;
    if (reviewConfig && reviewConfig.enabled === false) {
      context.logger.info('PR review disabled for repository', {
        repository: context.repository?.fullName,
      });
      return false;
    }

    // Only handle PR opened and synchronize events
    const payload = context.payload as PullRequestWebhookPayload;
    if (!['opened', 'synchronize'].includes(payload.action)) {
      context.logger.debug('PR Review agent only handles opened/synchronize events', {
        action: payload.action,
      });
      return false;
    }

    // Skip draft PRs
    if (payload.pull_request.draft) {
      context.logger.debug('Skipping draft PR', {
        prNumber: payload.pull_request.number,
      });
      return false;
    }

    return true;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const payload = context.payload as PullRequestWebhookPayload;
    const { pull_request: pr, repository } = payload;
    const reviewConfig = context.repository?.config?.review;

    context.logger.info('Analyzing pull request', {
      prNumber: pr.number,
      title: pr.title,
      repo: repository.full_name,
    });

    try {
      // Initialize services
      const github = createGitHubClient(context.env);
      const ai = createAIClient(context.env);
        const permissions = new PermissionService(
          github,
          context.env.GITHUB_BOT_USERNAME,
          context.logger
        );
      const analysisService = new CodeAnalysisService(ai, context.logger);
        const reviewService = new GitHubReviewService(github, context.logger);

        // Check permissions
        const canReview = await permissions.checkPermission(
          'pr:review',
          repository.owner.login,
          repository.name
        );

        if (!canReview) {
          context.logger.warn('Insufficient permissions for PR review', {
            repo: repository.full_name,
          });
          return {
            success: false,
            agentName: this.name,
            error: 'Insufficient permissions',
          };
        }

      // Fetch PR files
      context.logger.info('Fetching PR files', { prNumber: pr.number });
      const files = await github.getPullRequestFiles(
        repository.owner.login,
        repository.name,
        pr.number
      );

      // Analyze the PR
      const analysis = await analysisService.analyzePR(files, {
        focusAreas: reviewConfig?.focus,
        minSeverity: reviewConfig?.minSeverity,
        ignorePatterns: reviewConfig?.ignorePatterns,
      });

      context.logger.info('PR analysis complete', {
        issuesFound: analysis.summary.issuesFound,
        bySeverity: analysis.summary.bySeverity,
      });

        // Submit review to GitHub if issues found
        let reviewResult = null;
        if (analysis.comments.length > 0) {
          // Get PR details for commit SHA
          const prDetails = await github.getPullRequest(
            repository.owner.login,
            repository.name,
            pr.number
          );

          reviewResult = await reviewService.submitReview({
            owner: repository.owner.login,
            repo: repository.name,
            pullNumber: pr.number,
            commitId: prDetails.head.sha,
            comments: analysis.comments,
            minSeverity: reviewConfig?.minSeverity || 'warning',
          });

          if (reviewResult.submitted) {
            context.logger.info('Review posted to GitHub', {
              commentCount: reviewResult.commentCount,
              reviewUrl: reviewResult.reviewUrl,
            });
          }
        }

      const executionTime = Date.now() - startTime;
      context.metrics.increment('pr_review.success');
      context.metrics.increment('pr_review.issues_found', analysis.summary.issuesFound);
        if (reviewResult?.submitted) {
          context.metrics.increment('pr_review.posted');
        }

      // Record analytics
      if (context.repository) {
        try {
          const analytics = getGlobalPhase3Analytics(context.logger);
          analytics.recordPRReviewEvent(
            analysis.summary.issuesFound,
            reviewResult?.submitted || false,
            true,
            context.repository
          );
        } catch (error) {
          context.logger.debug('Failed to record PR review analytics', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        success: true,
        agentName: this.name,
          action: reviewResult?.submitted ? 'reviewed' : 'analyzed',
        data: {
          analysis,
            review: reviewResult,
        },
        metadata: {
          executionTimeMs: executionTime,
          filesAnalyzed: analysis.summary.analyzedFiles,
          issuesFound: analysis.summary.issuesFound,
        },
      };
    } catch (error) {
      context.logger.error('PR analysis failed', error as Error, {
        prNumber: pr.number,
      });
      context.metrics.increment('pr_review.error');

      // Record failure analytics
      if (context.repository) {
        try {
          const analytics = getGlobalPhase3Analytics(context.logger);
          analytics.recordPRReviewEvent(0, false, false, context.repository);
        } catch (analyticsError) {
          context.logger.debug('Failed to record PR review failure analytics', {
            error: analyticsError instanceof Error ? analyticsError.message : 'Unknown error',
          });
        }
      }

      return {
        success: false,
        agentName: this.name,
        error: (error as Error).message,
      };
    }
  }
}
