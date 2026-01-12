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
import { ContextService } from './services/ContextService';
import { createGitHubClient, createGitHubRepositoryService } from '../../platform/github';
import { createAIClient } from '../../platform/ai/client';
import { ConversationService } from '../../platform/conversation/ConversationService';
import { getGlobalCostTracker } from '../../platform/monitoring/CostTracker';

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
      const [owner, repo] = repository.full_name.split('/');
      
      // Step 1: Load conversation history (if KV available)
      let conversationHistory;
      if (context.env.DOC_EMBEDDINGS) {
        context.logger.debug('Loading conversation history');
        const conversationService = new ConversationService(
          context.env.DOC_EMBEDDINGS,
          'info'
        );
        
        try {
          const recentMessages = await conversationService.getRecentMessages(
            owner,
            repo,
            issue.number,
            5 // Last 5 messages
          );
          
          if (recentMessages.length > 0) {
            conversationHistory = recentMessages;
            context.logger.info('Conversation history loaded', {
              messageCount: recentMessages.length,
            });
          }
        } catch (error) {
          context.logger.warn('Failed to load conversation history', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      // Step 2: Gather external context (file references + documentation)
      let externalContext;
      if (this.agentConfig.enableFileContext || this.agentConfig.enableRAG) {
        context.logger.debug('Gathering external context from issue');
        const repositoryService = createGitHubRepositoryService(context.env);
        const contextService = new ContextService(
          repositoryService,
          this.agentConfig,
          context.env.GEMINI_API_KEY,
          context.env.TEST_ARTIFACTS,
          context.env.DOC_EMBEDDINGS,
          this.agentConfig.ragSearchConfig
        );
        
        try {
          externalContext = await contextService.gatherContext({
            issueTitle: issue.title,
            issueBody: issue.body,
            owner,
            repo,
          });
          
          if (externalContext?.files) {
            context.logger.info('External context gathered', {
              filesFound: externalContext.files.length,
              filePaths: externalContext.files.map(f => f.path),
              docsFound: externalContext.documentation?.length || 0,
            });
          } else if (externalContext?.documentation) {
            context.logger.info('Documentation context gathered', {
              docsFound: externalContext.documentation.length,
              sources: externalContext.documentation.map(d => d.source),
            });
          }
        } catch (error) {
          context.logger.warn('Failed to gather external context, continuing without', {
            error: error instanceof Error ? error.message : String(error),
          });
          externalContext = undefined;
        }
      }
      
      // Step 3: Generate AI response with all context
      context.logger.debug('Generating AI response');
      const aiClient = createAIClient(context.env);
      const aiService = new AIResponseService(aiClient, this.agentConfig);
      
      const aiResponse = await aiService.generateResponse({
        title: issue.title,
        body: issue.body,
        context: externalContext,
        conversationHistory,
      });
      
      context.logger.info('AI response generated', {
        tokensUsed: aiResponse.tokensUsed,
        withContext: !!externalContext,
      });
      
      // Record metrics
      context.metrics.gauge('ai.tokens_used', aiResponse.tokensUsed, {
        agent: this.name,
      });
      
      // Track cost
      const costTracker = getGlobalCostTracker();
      const model = context.env.GEMINI_MODEL || 'gemini-2.0-flash';
      costTracker.trackOperation('issue_response', model, {
        inputTokens: Math.floor(aiResponse.tokensUsed * 0.8),  // Rough estimate: 80% input
        outputTokens: Math.floor(aiResponse.tokensUsed * 0.2),  // 20% output
        totalTokens: aiResponse.tokensUsed,
      });
      
      // Step 3: Post comment to GitHub
      context.logger.debug('Posting comment to GitHub');
      const githubClient = createGitHubClient(context.env);
      const commentService = new GitHubCommentService(githubClient);
      
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
      
      // Step 4: Store assistant's response in conversation history
      if (context.env.DOC_EMBEDDINGS) {
        try {
          const conversationService = new ConversationService(
            context.env.DOC_EMBEDDINGS,
            'info'
          );
          
          await conversationService.addMessage(owner, repo, issue.number, issue.title, {
            id: commentResult.commentId.toString(),
            timestamp: new Date().toISOString(),
            author: context.env.GITHUB_BOT_USERNAME,
            role: 'assistant',
            content: aiResponse.content,
          });
          
          context.logger.debug('Response saved to conversation history');
        } catch (error) {
          context.logger.warn('Failed to save response to conversation history', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
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
