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

/**
 * Pull Request types
 */
export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser;
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepository;
  };
  base: {
    ref: string;
    sha: string;
    repo: GitHubRepository;
  };
  html_url: string;
  diff_url: string;
  created_at: string;
  updated_at: string;
  mergeable?: boolean | null;
  draft: boolean;
}

export interface GitHubPullRequestFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url: string;
  raw_url: string;
}

export interface GitHubReviewComment {
  id: number;
  body: string;
  path: string;
  position?: number;
  line?: number;
  commit_id: string;
  user: GitHubUser;
  created_at: string;
  html_url: string;
}

export interface CreateReviewCommentOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  commit_id: string;
  path: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
}

export interface SubmitReviewOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
  comments?: Array<{
    path: string;
    line: number;
    body: string;
    side?: 'LEFT' | 'RIGHT';
  }>;
}

export interface GitHubReview {
  id: number;
  user: GitHubUser;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  html_url: string;
  submitted_at: string;
}

/**
 * Repository permissions
 */
export interface GitHubRepositoryPermissions {
  admin: boolean;
  maintain: boolean;
  push: boolean;
  triage: boolean;
  pull: boolean;
}

export interface GitHubCollaboratorPermission {
  permission: 'admin' | 'write' | 'read' | 'none';
  user: GitHubUser;
}