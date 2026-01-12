/**
 * AI response generation service
 */

import type { AIClient } from '../../../platform/ai/client';
import { getSystemPrompt, buildIssuePrompt } from '../prompts/system-prompt';
import type { IssueResponderConfig } from '../config';
import type { ExternalContext } from '../../../types/context';
import type { ConversationMessage } from '../../../types/conversation';

export interface AIResponse {
  content: string;
  tokensUsed: number;
}

export interface GenerateResponseOptions {
  title: string;
  body: string | null;
  context?: ExternalContext;
  conversationHistory?: ConversationMessage[];
}

export class AIResponseService {
  constructor(
    private aiClient: AIClient,
    private config: IssueResponderConfig
  ) {}
  
  /**
   * Generate AI response for an issue
   */
  async generateResponse(options: GenerateResponseOptions): Promise<AIResponse> {
    const { title, body, context, conversationHistory } = options;
    
    const systemPrompt = getSystemPrompt();
    const userPrompt = buildIssuePrompt({ title, body }, context, conversationHistory);
    
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
