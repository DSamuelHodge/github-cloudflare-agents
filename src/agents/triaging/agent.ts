/**
 * Triaging Agent
 * Phase 3.4: Automated issue triaging with AI classification
 */

import { BaseAgent } from '../base/BaseAgent';
import type { AgentContext, AgentResult } from '../../types/agents';
import type { GitHubIssueWebhookPayload } from '../../types/github';
import { createGitHubClient } from '../../platform/github';
import { PermissionService } from '../../platform/github/permissions';
import { createAIClient } from '../../platform/ai/client';
import type { AIClient } from '../../platform/ai/client';
import { TRIAGING_AGENT_CONFIG } from './config';
import { TRIAGING_SYSTEM_PROMPT, buildTriagingPrompt } from './prompts/system-prompt';

interface TriagingClassification {
  labels: string[];
  severity?: string;
  assignees?: string[];
  reasoning: string;
  confidence: number;
}

export class TriagingAgent extends BaseAgent {
  readonly name = 'TriagingAgent';
  readonly version = '1.0.0';
  readonly triggers = ['issues'];

  constructor() {
    super(TRIAGING_AGENT_CONFIG);
  }

  async shouldHandle(context: AgentContext): Promise<boolean> {
    const parentCheck = await super.shouldHandle(context);
    if (!parentCheck) return false;

    const triagingConfig = context.repository?.config?.triaging;
    if (triagingConfig && triagingConfig.enabled === false) {
      context.logger.info('Triaging disabled for repository', {
        repository: context.repository?.fullName,
      });
      return false;
    }

    // Only handle issue opened events
    const payload = context.payload as GitHubIssueWebhookPayload;
    if (payload.action !== 'opened') {
      context.logger.debug('Triaging agent only handles opened issues', {
        action: payload.action,
      });
      return false;
    }

    return true;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const payload = context.payload as GitHubIssueWebhookPayload;
    const { issue, repository } = payload;
    const triagingConfig = context.repository?.config?.triaging;
    const confidenceThreshold = triagingConfig?.confidenceThreshold ?? 0.7;

    context.logger.info('Triaging issue', {
      issueNumber: issue.number,
      title: issue.title,
      repo: repository.full_name,
    });

    try {
      // Initialize services
      const github = createGitHubClient(context.env);
      const ai = createAIClient(context.env);
      const permissions = new PermissionService(
        github,
        context.env.GITHUB_BOT_USERNAME,
          context.logger
      );

      // Check permissions
      const canLabel = await permissions.checkPermission(
        'issue:label',
        repository.owner.login,
        repository.name
      );

      const canAssign = await permissions.checkPermission(
        'issue:assign',
        repository.owner.login,
        repository.name
      );

      if (!canLabel && !canAssign) {
        context.logger.warn('Insufficient permissions for triaging', {
          repo: repository.full_name,
        });
        return {
          success: false,
          agentName: this.name,
          error: 'Insufficient permissions',
        };
      }

      // Get AI classification
      const classification = await this.classifyIssue(
        {
          title: issue.title,
          body: issue.body,
          author: issue.user.login,
        },
        ai,
        context
      );

      context.logger.info('Issue classified', {
        labels: classification.labels,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      });

      // Apply labels if confidence threshold met
      const appliedChanges: string[] = [];
      
      if (canLabel && classification.confidence >= confidenceThreshold && classification.labels.length > 0) {
        await github.addLabels(
          repository.owner.login,
          repository.name,
          issue.number,
          classification.labels
        );
        appliedChanges.push(`labels: ${classification.labels.join(', ')}`);
      }

      // Apply assignees if confidence high enough
      if (canAssign && classification.confidence >= 0.8 && classification.assignees && classification.assignees.length > 0) {
        await github.updateIssue({
          owner: repository.owner.login,
          repo: repository.name,
          issueNumber: issue.number,
          assignees: classification.assignees,
        });
        appliedChanges.push(`assignees: ${classification.assignees.join(', ')}`);
      }

      // Post comment explaining the triaging
      if (appliedChanges.length > 0) {
        const comment = this.formatTriagingComment(classification, appliedChanges);
        await github.createComment({
          owner: repository.owner.login,
          repo: repository.name,
          issueNumber: issue.number,
          body: comment,
        });
      }

      const executionTime = Date.now() - startTime;
      context.metrics.increment('triaging.success');
      context.metrics.increment('triaging.confidence', classification.confidence);

      return {
        success: true,
        agentName: this.name,
        action: 'triaged',
        data: {
          classification,
          appliedChanges,
        },
        metadata: {
          executionTimeMs: executionTime,
          confidence: classification.confidence,
        },
      };
    } catch (error) {
      context.logger.error('Triaging failed', error as Error, {
        issueNumber: issue.number,
      });
      context.metrics.increment('triaging.error');

      return {
        success: false,
        agentName: this.name,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Classify an issue using AI
   */
  private async classifyIssue(
    issue: { title: string; body: string | null; author: string },
    ai: AIClient,
    context: AgentContext
  ): Promise<TriagingClassification> {
    const userPrompt = buildTriagingPrompt(issue);

    const response = await ai.generateCompletion({
      messages: [
        { role: 'system', content: TRIAGING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // Low temperature for consistent classification
    });

    const content = response.content || '{}';
    
    try {
      const classification = JSON.parse(content) as TriagingClassification;
      
      // Validate classification
      if (!classification.labels || !Array.isArray(classification.labels)) {
        throw new Error('Invalid classification: missing labels array');
      }
      
      if (typeof classification.confidence !== 'number' || classification.confidence < 0 || classification.confidence > 1) {
        throw new Error('Invalid classification: confidence must be between 0 and 1');
      }

      return classification;
    } catch (error) {
      context.logger.error('Failed to parse AI classification', error as Error, { content });
      // Return low-confidence fallback
      return {
        labels: ['needs-more-info'],
        reasoning: 'Failed to classify issue automatically',
        confidence: 0.0,
      };
    }
  }

  /**
   * Format a GitHub comment explaining the triaging decision
   */
  private formatTriagingComment(classification: TriagingClassification, appliedChanges: string[]): string {
    return `🤖 **Automated Triaging**

This issue has been automatically triaged based on its content.

**Applied**: ${appliedChanges.join(', ')}

**Reasoning**: ${classification.reasoning}

**Confidence**: ${(classification.confidence * 100).toFixed(0)}%

---
*This is an automated classification. Please adjust labels or assignments if needed.*`;
  }
}
