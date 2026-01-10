/**
 * GitHub comment service
 */

import type { GitHubClient } from '../../../platform/github/client';
import { formatGitHubComment } from '../prompts/system-prompt';

export interface CommentResult {
  commentId: number;
  commentUrl: string;
}

export class GitHubCommentService {
  constructor(private githubClient: GitHubClient) {}
  
  /**
   * Post a comment to a GitHub issue
   */
  async postComment(
    owner: string,
    repo: string,
    issueNumber: number,
    aiContent: string,
    username: string
  ): Promise<CommentResult> {
    const formattedComment = formatGitHubComment(aiContent, username);
    
    const result = await this.githubClient.createComment({
      owner,
      repo,
      issueNumber,
      body: formattedComment,
    });
    
    return {
      commentId: result.id,
      commentUrl: result.html_url,
    };
  }
}
