/**
 * PRService - Handles Pull Request creation and management
 * Phase 2.6: Automated PR Workflow
 */

import type { Env } from '../../types/env';
import type {
  PRCreationOptions,
  CreatedPR,
  BranchCleanupOptions,
  BranchCleanupResult,
  PRSummary,
} from '../../types/pr-workflow';
import type { ParallelTestResult, SolutionVariant } from '../../types/parallel';
import { createGitHubClient, GitHubClient } from '../github/client';
import { Logger } from '../../utils/logger';

export class PRService {
  private github: GitHubClient;
  private logger: Logger;
  private token: string;

  constructor(env: Env) {
    this.token = env.GITHUB_TOKEN;
    this.github = createGitHubClient({
      GITHUB_TOKEN: env.GITHUB_TOKEN,
      GITHUB_BOT_USERNAME: env.GITHUB_BOT_USERNAME || 'ai-agent',
    });
    
    const logLevel = (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
    this.logger = new Logger(logLevel, { component: 'PRService' });
  }

  /**
   * Create a pull request for a solution
   */
  async createPullRequest(options: PRCreationOptions): Promise<CreatedPR> {
    this.logger.info('Creating pull request', {
      owner: options.owner,
      repo: options.repo,
      head: options.headBranch,
      base: options.baseBranch,
    });

    try {
      const result = await this.github.createPullRequest({
        owner: options.owner,
        repo: options.repo,
        title: options.title,
        head: options.headBranch,
        base: options.baseBranch,
        body: options.body,
        draft: options.draft ?? true,
      });

      this.logger.info('Pull request created', {
        prNumber: result.number,
        url: result.html_url,
      });

      // Add labels if specified
      if (options.labels && options.labels.length > 0) {
        await this.addLabels(options.owner, options.repo, result.number, options.labels);
      }

      // Request reviewers if specified
      if (options.reviewers && options.reviewers.length > 0) {
        await this.requestReviewers(options.owner, options.repo, result.number, options.reviewers);
      }

      return {
        number: result.number,
        url: result.html_url,
        state: 'open',
        headBranch: options.headBranch,
        baseBranch: options.baseBranch,
        createdAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to create pull request', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Add labels to a PR
   */
  async addLabels(owner: string, repo: string, prNumber: number, labels: string[]): Promise<void> {
    try {
      await this.github.addLabels(owner, repo, prNumber, labels);
      this.logger.debug('Labels added to PR', { prNumber, labels });
    } catch (error) {
      this.logger.warn('Failed to add labels', {
        prNumber,
        labels,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Request reviewers for a PR
   */
  async requestReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<void> {
    try {
      // GitHub API for requesting reviewers
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({ reviewers }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to request reviewers: ${response.status}`);
      }

      this.logger.debug('Reviewers requested for PR', { prNumber, reviewers });
    } catch (error) {
      this.logger.warn('Failed to request reviewers', {
        prNumber,
        reviewers,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Post test summary comment on PR
   */
  async postTestSummaryComment(
    owner: string,
    repo: string,
    prNumber: number,
    summary: PRSummary
  ): Promise<void> {
    const body = this.formatTestSummaryComment(summary);
    
    await this.github.createComment({
      owner,
      repo,
      issueNumber: prNumber,
      body,
    });

    this.logger.info('Posted test summary comment', { prNumber });
  }

  /**
   * Format test summary as markdown comment
   */
  private formatTestSummaryComment(summary: PRSummary): string {
    const passEmoji = summary.passRate === 100 ? '✅' : summary.passRate >= 80 ? '🟡' : '❌';
    
    let comment = `## ${passEmoji} AI-Generated Solution Test Results\n\n`;
    comment += `**Solution:** ${summary.solutionName} (${summary.strategy})\n`;
    comment += `**Confidence:** ${summary.confidence}%\n\n`;
    
    // Test results
    comment += `### Test Results\n\n`;
    comment += `| Metric | Value |\n`;
    comment += `|--------|-------|\n`;
    comment += `| Pass Rate | ${summary.passRate.toFixed(1)}% |\n`;
    comment += `| Tests Passed | ${summary.testStats.passed}/${summary.testStats.total} |\n`;
    comment += `| Tests Failed | ${summary.testStats.failed} |\n`;
    comment += `| Duration | ${(summary.durationMs / 1000).toFixed(2)}s |\n\n`;

    // Coverage if available
    if (summary.coverage) {
      comment += `### Code Coverage\n\n`;
      comment += `| Type | Coverage |\n`;
      comment += `|------|----------|\n`;
      comment += `| Lines | ${summary.coverage.lines}% |\n`;
      comment += `| Functions | ${summary.coverage.functions}% |\n`;
      comment += `| Branches | ${summary.coverage.branches}% |\n`;
      comment += `| Statements | ${summary.coverage.statements}% |\n\n`;
    }

    // AI reasoning
    comment += `### AI Reasoning\n\n`;
    comment += `> ${summary.reasoning}\n\n`;

    // Artifacts
    if (summary.artifactUrls && summary.artifactUrls.length > 0) {
      comment += `### Artifacts\n\n`;
      for (const url of summary.artifactUrls) {
        const filename = url.split('/').pop() || 'artifact';
        comment += `- [${filename}](${url})\n`;
      }
      comment += '\n';
    }

    comment += `---\n`;
    comment += `*This PR was automatically generated by the AI Agent based on test results.*\n`;
    comment += `*Please review the changes carefully before merging.*`;

    return comment;
  }

  /**
   * Generate PR body from solution and test results
   */
  generatePRBody(
    solution: SolutionVariant,
    testResult: ParallelTestResult,
    issueNumber?: number
  ): string {
    const winnerResult = testResult.results.find(r => r.solutionId === solution.solutionId);
    
    let body = `## Summary\n\n`;
    body += `This PR implements a fix using the **${solution.name}** strategy.\n\n`;
    
    if (issueNumber) {
      body += `Fixes #${issueNumber}\n\n`;
    }

    body += `## Approach\n\n`;
    body += `${solution.reasoning}\n\n`;

    body += `## Test Results\n\n`;
    if (winnerResult) {
      const passRate = winnerResult.metrics.passRate;
      const emoji = passRate === 100 ? '✅' : passRate >= 80 ? '🟡' : '❌';
      body += `${emoji} **Pass Rate:** ${passRate.toFixed(1)}%\n`;
      body += `- Tests Passed: ${winnerResult.metrics.testsPassed}\n`;
      body += `- Tests Failed: ${winnerResult.metrics.testsFailed}\n`;
      body += `- Duration: ${(winnerResult.durationMs / 1000).toFixed(2)}s\n\n`;
    }

    body += `## Confidence\n\n`;
    body += `AI Confidence Score: **${solution.confidence}%**\n\n`;

    body += `## Checklist\n\n`;
    body += `- [ ] Code review completed\n`;
    body += `- [ ] Manual testing verified\n`;
    body += `- [ ] Documentation updated (if needed)\n\n`;

    body += `---\n`;
    body += `*This PR was automatically generated by the AI Agent.*`;

    return body;
  }

  /**
   * Clean up branches after PR creation
   */
  async cleanupBranches(options: BranchCleanupOptions): Promise<BranchCleanupResult> {
    const result: BranchCleanupResult = {
      deleted: [],
      failed: [],
      skipped: [],
    };

    for (const branch of options.branches) {
      // Check skip patterns
      if (options.skipPatterns?.some(pattern => branch.includes(pattern))) {
        result.skipped.push({ branch, reason: 'Matches skip pattern' });
        continue;
      }

      // Check protected branches
      if (['main', 'master', 'develop', 'production'].includes(branch)) {
        result.skipped.push({ branch, reason: 'Protected branch' });
        continue;
      }

      try {
        await this.deleteBranch(options.owner, options.repo, branch);
        result.deleted.push(branch);
      } catch (error) {
        result.failed.push({
          branch,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Branch cleanup completed', {
      deleted: result.deleted.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    });

    return result;
  }

  /**
   * Delete a branch
   */
  private async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok && response.status !== 422) {
      throw new Error(`Failed to delete branch: ${response.status}`);
    }

    this.logger.debug('Branch deleted', { owner, repo, branch });
  }

  /**
   * Link PR to an issue
   */
  async linkPRToIssue(
    owner: string,
    repo: string,
    prNumber: number,
    issueNumber: number
  ): Promise<void> {
    // Add comment on issue linking to PR
    await this.github.createComment({
      owner,
      repo,
      issueNumber,
      body: `🔗 PR #${prNumber} has been created to address this issue.`,
    });

    this.logger.debug('Linked PR to issue', { prNumber, issueNumber });
  }
}
