/**
 * AI response generation service
 */

import type { AIClient } from '../../../platform/ai/client';
import { getSystemPrompt, buildIssuePrompt } from '../prompts/system-prompt';
import type { IssueResponderConfig } from '../config';

export interface AIResponse {
  content: string;
  tokensUsed: number;
}

export class AIResponseService {
  constructor(
    private aiClient: AIClient,
    private config: IssueResponderConfig
  ) {}
  
  /**
   * Generate AI response for an issue
   */
  async generateResponse(issue: { title: string; body: string | null }): Promise<AIResponse> {
    const systemPrompt = getSystemPrompt();
    const userPrompt = buildIssuePrompt(issue);
    
    const result = await this.aiClient.generateCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.config.temperature,
      maxTokens: this.config.maxResponseTokens,
    });
    
    return {
      content: result.content,
      tokensUsed: result.usage.totalTokens,
    };
  }
}
