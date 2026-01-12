/**
 * GitHub webhook event payload types
 * Based on GitHub API v3 documentation
 */

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: GitHubLabel[];
  user: GitHubUser;
  assignees: GitHubUser[];
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  html_url: string;
  description?: string;
  private: boolean;
}

export interface GitHubIssueWebhookPayload {
  action: 'opened' | 'edited' | 'closed' | 'reopened' | 'labeled' | 'unlabeled';
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
  label?: GitHubLabel;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubCommentResponse {
  html_url: string;
  id: number;
}

/**
 * GitHub repository file content types
 */
export interface GitHubFileContent {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  encoding?: 'base64';
  size: number;
  name: string;
  path: string;
  content?: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string | null;
}

export interface GitHubDirectoryContent {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string | null;
}

export type GitHubContent = GitHubFileContent | GitHubDirectoryContent[];