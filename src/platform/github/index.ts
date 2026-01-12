/**
 * GitHub platform services exports
 */

export { GitHubClient, createGitHubClient } from './client';
export type { GitHubClientConfig, CreateCommentOptions, UpdateIssueOptions } from './client';

export { GitHubRepositoryService, createGitHubRepositoryService } from './repository';
export type { RepositoryFileOptions, RepositoryFileResult } from './repository';

export { verifyWebhookSignature } from './webhook';
