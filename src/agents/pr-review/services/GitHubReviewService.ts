/**
 * GitHub Review Service for PR Review Agent
 * Phase 3.6: Submit code review comments to GitHub
 */

import type { GitHubClient } from '../../../platform/github';
import type { AgentLogger } from '../../../types/agents';
import type { ReviewComment } from './CodeAnalysisService';
import type { SubmitReviewOptions } from '../../../types/github';

export interface ReviewSubmissionOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  comments: ReviewComment[];
  minSeverity?: 'info' | 'warning' | 'error';
}

export interface ReviewSubmissionResult {
  submitted: boolean;
  commentCount: number;
  reviewUrl?: string;
}

export class GitHubReviewService {
  private github: GitHubClient;
  private logger: AgentLogger;

  constructor(github: GitHubClient, logger: AgentLogger) {
    this.github = github;
    this.logger = logger;
  }

  /**
   * Submit code review to GitHub
   */
  async submitReview(options: ReviewSubmissionOptions): Promise<ReviewSubmissionResult> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { owner, repo, pullNumber, commitId, comments, minSeverity = 'warning' } = options;

    // Filter comments by severity threshold
    const filteredComments = this.filterCommentsBySeverity(comments, minSeverity);

    if (filteredComments.length === 0) {
      this.logger.info('No comments meet severity threshold', {
        totalComments: comments.length,
        minSeverity,
      });
      return {
        submitted: false,
        commentCount: 0,
      };
    }

    try {
      // Format comments for GitHub API
      const githubComments = filteredComments.map(comment => ({
        path: comment.path,
        line: comment.line,
        body: this.formatCommentBody(comment),
        side: 'RIGHT' as const,
      }));

      // Submit review with comments
      const reviewOptions: SubmitReviewOptions = {
        owner,
        repo,
        pullNumber,
        event: 'COMMENT', // Don't approve or request changes, just comment
        body: this.formatReviewBody(comments, filteredComments.length),
        comments: githubComments,
      };

      const review = await this.github.submitReview(reviewOptions);

      this.logger.info('Review submitted successfully', {
        reviewId: review.id,
        commentCount: filteredComments.length,
      });

      return {
        submitted: true,
        commentCount: filteredComments.length,
        reviewUrl: review.html_url,
      };
    } catch (error) {
      this.logger.error('Failed to submit review', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      throw error;
    }
  }

  /**
   * Filter comments by minimum severity
   */
  private filterCommentsBySeverity(
    comments: ReviewComment[],
    minSeverity: 'info' | 'warning' | 'error'
  ): ReviewComment[] {
    const severityOrder = { info: 0, warning: 1, error: 2 };
    const threshold = severityOrder[minSeverity];

    return comments.filter(comment => {
      const commentSeverity = severityOrder[comment.severity] || 0;
      return commentSeverity >= threshold;
    });
  }

  /**
   * Format individual comment body
   */
  private formatCommentBody(comment: ReviewComment): string {
    const severityEmoji = {
      error: '🚨',
      warning: '⚠️',
      info: 'ℹ️',
    };

    const categoryLabel = {
      security: 'Security',
      performance: 'Performance',
      bugs: 'Bug',
      'best-practices': 'Best Practice',
      style: 'Style',
    };

    let body = `${severityEmoji[comment.severity]} **${categoryLabel[comment.category]}**: ${comment.message}`;

    if (comment.suggestion) {
      body += `\n\n**Suggestion**: ${comment.suggestion}`;
    }

    return body;
  }

  /**
   * Format review body (summary)
   */
  private formatReviewBody(allComments: ReviewComment[], postedCount: number): string {
    const errorCount = allComments.filter(c => c.severity === 'error').length;
    const warningCount = allComments.filter(c => c.severity === 'warning').length;
    const infoCount = allComments.filter(c => c.severity === 'info').length;

    let body = '🤖 **Automated Code Review**\n\n';

    body += `Found **${allComments.length}** potential issue${allComments.length !== 1 ? 's' : ''}:\n`;
    if (errorCount > 0) body += `- 🚨 ${errorCount} error${errorCount !== 1 ? 's' : ''}\n`;
    if (warningCount > 0) body += `- ⚠️ ${warningCount} warning${warningCount !== 1 ? 's' : ''}\n`;
    if (infoCount > 0) body += `- ℹ️ ${infoCount} info\n`;

    if (postedCount < allComments.length) {
      body += `\n_Showing ${postedCount} comments above severity threshold._`;
    }

    body += '\n\n---\n*This is an automated review. Please use your best judgment when addressing these comments.*';

    return body;
  }
}
