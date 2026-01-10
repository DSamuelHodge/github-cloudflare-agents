/**
 * Issue Responder Agent
 * Responds to GitHub issues with AI-generated troubleshooting advice
 */

import { BaseAgent } from '../base/BaseAgent';
import type { AgentContext, AgentResult, AgentConfig } from '../../types/agents';
import type { GitHubIssueWebhookPayload } from '../../types/github';
import { defaultConfig, type IssueResponderConfig } from './config';
import { IssueValidationService } from './services/ValidationService';
import { AIResponseService } from './services/AIResponseService';
import { GitHubCommentService } from './services/GitHubCommentService';
import { createGitHubClient } from '../../platform/github/client';
import { createAIClient } from '../../platform/ai/client';

export class IssueResponderAgent extends BaseAgent {
  readonly name = 'issue-responder';
  readonly version = '1.0.0';
  readonly triggers = ['issues'];
  
  private agentConfig: IssueResponderConfig;
  
  constructor(config: Partial<IssueResponderConfig> = {}) {
    const fullConfig: IssueResponderConfig & AgentConfig = {
      ...defaultConfig,
      ...config,
    };
    
    super(fullConfig);
    this.agentConfig = fullConfig;
  }
  
  /**
   * Check if agent should handle this issue
   */
  async shouldHandle(context: AgentContext): Promise<boolean> {
    // First check base conditions
    const baseCheck = await super.shouldHandle(context);
    if (!baseCheck) {
      return false;
    }
    
    // Parse and validate payload
    const payload = context.payload as GitHubIssueWebhookPayload;
    
    // Apply target repo filter from config
    if (this.agentConfig.targetRepo) {
      this.agentConfig.targetRepo = context.env.TARGET_REPO || this.agentConfig.targetRepo;
    }
    
    const validator = new IssueValidationService(this.agentConfig);
    const validation = validator.validate(payload);
    
    if (!validation.shouldProcess) {
      context.logger.debug(`Issue Responder skipping: ${validation.reason}`, {
        issueNumber: payload.issue?.number,
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * Execute the agent
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    const payload = context.payload as GitHubIssueWebhookPayload;
    const { issue, repository } = payload;
    
    context.logger.info(`Processing issue #${issue.number} from ${repository.full_name}`);
    
    try {
      // Step 1: Generate AI response
      context.logger.debug('Generating AI response');
      const aiClient = createAIClient(context.env);
      const aiService = new AIResponseService(aiClient, this.agentConfig);
      
      const aiResponse = await aiService.generateResponse({
        title: issue.title,
        body: issue.body,
      });
      
      context.logger.info('AI response generated', {
        tokensUsed: aiResponse.tokensUsed,
      });
      
      // Record metrics
      context.metrics.gauge('ai.tokens_used', aiResponse.tokensUsed, {
        agent: this.name,
      });
      
      // Step 2: Post comment to GitHub
      context.logger.debug('Posting comment to GitHub');
      const githubClient = createGitHubClient(context.env);
      const commentService = new GitHubCommentService(githubClient);
      
      const [owner, repo] = repository.full_name.split('/');
      const commentResult = await commentService.postComment(
        owner,
        repo,
        issue.number,
        aiResponse.content,
        issue.user.login
      );
      
      context.logger.info('Comment posted successfully', {
        commentId: commentResult.commentId,
        commentUrl: commentResult.commentUrl,
      });
      
      // Record success metric
      context.metrics.increment('agent.issue_responded', 1, {
        agent: this.name,
      });
      
      return this.createSuccessResult('responded', {
        issue: {
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
        },
        ai: {
          tokensUsed: aiResponse.tokensUsed,
        },
        comment: {
          id: commentResult.commentId,
          url: commentResult.commentUrl,
        },
      });
    } catch (error) {
      context.logger.error('Failed to process issue', error as Error, {
        issueNumber: issue.number,
      });
      
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error',
        {
          issueNumber: issue.number,
        }
      );
    }
  }
  
  /**
   * Lifecycle hook: log before execution
   */
  async beforeExecute(context: AgentContext): Promise<void> {
    context.logger.info(`${this.name} agent starting`, {
      agent: this.name,
      version: this.version,
    });
  }
  
  /**
   * Lifecycle hook: log after execution
   */
  async afterExecute(context: AgentContext, result: AgentResult): Promise<void> {
    context.logger.info(`${this.name} agent completed`, {
      agent: this.name,
      success: result.success,
      executionTimeMs: result.metadata?.executionTimeMs,
    });
  }
}
