/**
 * GitHubStreamUpdater - Updates GitHub comments with real-time test progress
 * Phase 2.4: Real-Time Streaming
 */

import type { Env } from '../../types/env';
import type { ProgressIndicator } from '../../types/streaming';
import { Logger } from '../../utils/logger';

export class GitHubStreamUpdater {
  private logger: Logger;
  private githubToken: string;
  private commentCache: Map<string, { commentId: number; lastUpdate: Date }> = new Map();
  
  // Rate limiting
  private readonly MIN_UPDATE_INTERVAL_MS = 3000; // Min 3 seconds between updates
  private lastUpdateTimes: Map<string, number> = new Map();

  constructor(env: Env) {
    const logLevel = (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
    this.logger = new Logger(logLevel, { component: 'GitHubStreamUpdater' });
    this.githubToken = env.GITHUB_TOKEN;
  }

  /**
   * Create or update a streaming progress comment
   */
  async updateProgressComment(
    owner: string,
    repo: string,
    issueNumber: number,
    jobId: string,
    progress: {
      phase: 'cloning' | 'installing' | 'testing' | 'cleanup';
      percent: number;
      message: string;
      logs?: string[];
      testStats?: { run: number; passed: number; failed: number };
    }
  ): Promise<void> {
    const cacheKey = `${owner}/${repo}/${issueNumber}/${jobId}`;
    
    // Rate limit updates
    const lastUpdate = this.lastUpdateTimes.get(cacheKey) || 0;
    const now = Date.now();
    if (now - lastUpdate < this.MIN_UPDATE_INTERVAL_MS) {
      this.logger.debug('Skipping update due to rate limit', { cacheKey });
      return;
    }
    this.lastUpdateTimes.set(cacheKey, now);

    // Build comment body
    const body = this.formatProgressComment(jobId, progress);

    // Check if we have an existing comment
    const cached = this.commentCache.get(cacheKey);

    try {
      if (cached) {
        // Update existing comment
        await this.updateComment(owner, repo, cached.commentId, body);
        cached.lastUpdate = new Date();
      } else {
        // Create new comment
        const commentId = await this.createComment(owner, repo, issueNumber, body);
        this.commentCache.set(cacheKey, { commentId, lastUpdate: new Date() });
      }
    } catch (error) {
      this.logger.error('Failed to update GitHub comment', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Post final result comment (replaces progress comment)
   */
  async postResultComment(
    owner: string,
    repo: string,
    issueNumber: number,
    jobId: string,
    result: {
      status: 'success' | 'failure' | 'timeout' | 'error';
      exitCode?: number;
      durationMs: number;
      stdout?: string;
      stderr?: string;
      coverage?: { lines: number; functions: number; branches: number; statements: number };
      artifactUrls?: string[];
    }
  ): Promise<void> {
    const cacheKey = `${owner}/${repo}/${issueNumber}/${jobId}`;
    const body = this.formatResultComment(jobId, result);

    const cached = this.commentCache.get(cacheKey);

    try {
      if (cached) {
        // Update existing progress comment with final result
        await this.updateComment(owner, repo, cached.commentId, body);
        this.commentCache.delete(cacheKey);
      } else {
        // Create new result comment
        await this.createComment(owner, repo, issueNumber, body);
      }
    } catch (error) {
      this.logger.error('Failed to post result comment', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Format progress comment with live indicators
   */
  private formatProgressComment(
    jobId: string,
    progress: {
      phase: string;
      percent: number;
      message: string;
      logs?: string[];
      testStats?: { run: number; passed: number; failed: number };
    }
  ): string {
    const indicator = this.getProgressIndicator(progress.phase, progress.percent);
    
    let body = `## 🔄 Test Execution In Progress\n\n`;
    body += `**Job ID:** \`${jobId}\`\n\n`;
    body += `### ${indicator.emoji} ${indicator.label}\n\n`;
    body += `${this.renderProgressBar(indicator.percentage, indicator.barLength)}\n\n`;
    body += `**Status:** ${progress.message}\n\n`;

    // Add test stats if available
    if (progress.testStats) {
      const { run, passed, failed } = progress.testStats;
      body += `### Test Progress\n`;
      body += `- ✅ Passed: ${passed}\n`;
      body += `- ❌ Failed: ${failed}\n`;
      body += `- 📊 Total: ${run}\n\n`;
    }

    // Add recent logs (last 10 lines)
    if (progress.logs && progress.logs.length > 0) {
      const recentLogs = progress.logs.slice(-10);
      body += `<details>\n<summary>📋 Recent Output (last ${recentLogs.length} lines)</summary>\n\n`;
      body += `\`\`\`\n${recentLogs.join('\n')}\n\`\`\`\n</details>\n\n`;
    }

    body += `---\n*🔄 Auto-updating... Last update: ${new Date().toISOString()}*`;

    return body;
  }

  /**
   * Format final result comment
   */
  private formatResultComment(
    jobId: string,
    result: {
      status: string;
      exitCode?: number;
      durationMs: number;
      stdout?: string;
      stderr?: string;
      coverage?: { lines: number; functions: number; branches: number; statements: number };
      artifactUrls?: string[];
    }
  ): string {
    const statusEmoji = result.status === 'success' ? '✅' : '❌';
    const statusText = result.status === 'success' ? 'Passed' : 'Failed';

    let body = `## ${statusEmoji} Test Results - ${statusText}\n\n`;
    body += `**Job ID:** \`${jobId}\`\n`;
    body += `**Duration:** ${(result.durationMs / 1000).toFixed(2)}s\n`;
    
    if (result.exitCode !== undefined) {
      body += `**Exit Code:** ${result.exitCode}\n`;
    }
    body += '\n';

    // Add coverage if available
    if (result.coverage) {
      body += `### 📊 Coverage\n\n`;
      body += `| Metric | Coverage |\n`;
      body += `|--------|----------|\n`;
      body += `| Lines | ${result.coverage.lines}% |\n`;
      body += `| Functions | ${result.coverage.functions}% |\n`;
      body += `| Branches | ${result.coverage.branches}% |\n`;
      body += `| Statements | ${result.coverage.statements}% |\n\n`;
    }

    // Add output
    if (result.stdout) {
      const truncatedOutput = this.truncateOutput(result.stdout, 3000);
      body += `<details>\n<summary>📤 Output</summary>\n\n`;
      body += `\`\`\`\n${truncatedOutput}\n\`\`\`\n</details>\n\n`;
    }

    if (result.stderr) {
      const truncatedError = this.truncateOutput(result.stderr, 1500);
      body += `<details>\n<summary>⚠️ Errors</summary>\n\n`;
      body += `\`\`\`\n${truncatedError}\n\`\`\`\n</details>\n\n`;
    }

    // Add artifact links
    if (result.artifactUrls && result.artifactUrls.length > 0) {
      body += `### 📦 Artifacts\n\n`;
      for (const url of result.artifactUrls) {
        const filename = url.split('/').pop() || url;
        body += `- [${filename}](${url})\n`;
      }
      body += '\n';
    }

    body += `---\n*Completed at ${new Date().toISOString()}*`;

    return body;
  }

  /**
   * Get progress indicator based on phase
   */
  private getProgressIndicator(phase: string, percent: number): ProgressIndicator {
    const indicators: Record<string, { emoji: string; label: string }> = {
      cloning: { emoji: '📥', label: 'Cloning Repository' },
      installing: { emoji: '📦', label: 'Installing Dependencies' },
      testing: { emoji: '🧪', label: 'Running Tests' },
      cleanup: { emoji: '🧹', label: 'Cleaning Up' },
    };

    const indicator = indicators[phase] || { emoji: '⏳', label: 'Processing' };

    return {
      ...indicator,
      percentage: percent,
      barLength: 20,
    };
  }

  /**
   * Render ASCII progress bar
   */
  private renderProgressBar(percent: number, length: number): string {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `\`[${bar}]\` ${percent}%`;
  }

  /**
   * Truncate output for comment length limits
   */
  private truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) {
      return output;
    }
    return output.substring(0, maxLength) + '\n\n... (output truncated)';
  }

  /**
   * Create GitHub comment
   */
  private async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<number> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.githubToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'GitHub-AI-Agent',
        },
        body: JSON.stringify({ body }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create comment: ${response.status}`);
    }

    const data = await response.json() as { id: number };
    this.logger.info('Created GitHub comment', { owner, repo, issueNumber, commentId: data.id });
    return data.id;
  }

  /**
   * Update GitHub comment
   */
  private async updateComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string
  ): Promise<void> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.githubToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'GitHub-AI-Agent',
        },
        body: JSON.stringify({ body }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update comment: ${response.status}`);
    }

    this.logger.debug('Updated GitHub comment', { owner, repo, commentId });
  }

  /**
   * Clear comment cache for a job
   */
  clearCache(owner: string, repo: string, issueNumber: number, jobId: string): void {
    const cacheKey = `${owner}/${repo}/${issueNumber}/${jobId}`;
    this.commentCache.delete(cacheKey);
    this.lastUpdateTimes.delete(cacheKey);
  }
}
