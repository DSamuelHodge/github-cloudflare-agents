/**
 * GitHub API client for agent platform services
 */

import type { GitHubIssue, GitHubRepository } from '../../types/github';

export interface GitHubClientConfig {
  token: string;
  userAgent: string;
  baseUrl?: string;
}

export interface GitHubComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
}

export interface CreateCommentOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export interface UpdateIssueOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
}

export class GitHubClient {
  private config: GitHubClientConfig;
  private baseUrl: string;
  
  constructor(config: GitHubClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.github.com';
  }
  
  /**
   * Make a GitHub API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': this.config.userAgent,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }
    
    return response.json() as Promise<T>;
  }
  
  /**
   * Create a comment on an issue or PR
   */
  async createComment(options: CreateCommentOptions): Promise<GitHubComment> {
    const { owner, repo, issueNumber, body } = options;
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    
    return this.request<GitHubComment>('POST', path, { body });
  }
  
  /**
   * Get an issue by number
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}`;
    return this.request<GitHubIssue>('GET', path);
  }
  
  /**
   * Update an issue
   */
  async updateIssue(options: UpdateIssueOptions): Promise<GitHubIssue> {
    const { owner, repo, issueNumber, ...updates } = options;
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}`;
    
    return this.request<GitHubIssue>('PATCH', path, updates);
  }
  
  /**
   * Add labels to an issue
   */
  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<void> {
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}/labels`;
    await this.request('POST', path, { labels });
  }
  
  /**
   * Remove a label from an issue
   */
  async removeLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: string
  ): Promise<void> {
    const path = `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${label}`;
    await this.request('DELETE', path);
  }
  
  /**
   * Create a pull request
   */
  async createPullRequest(options: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
  }): Promise<{ number: number; html_url: string }> {
    const { owner, repo, ...prData } = options;
    const path = `/repos/${owner}/${repo}/pulls`;
    
    return this.request('POST', path, prData);
  }
  
  /**
   * Get repository details
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const path = `/repos/${owner}/${repo}`;
    return this.request<GitHubRepository>('GET', path);
  }
}

/**
 * Create a GitHub client from environment
 */
export function createGitHubClient(env: {
  GITHUB_TOKEN: string;
  GITHUB_BOT_USERNAME: string;
}): GitHubClient {
  return new GitHubClient({
    token: env.GITHUB_TOKEN,
    userAgent: env.GITHUB_BOT_USERNAME || 'cloudflare-ai-agent',
  });
}
