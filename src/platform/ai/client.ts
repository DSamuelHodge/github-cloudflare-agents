/**
 * AI platform client for Gemini (OpenAI-compatible endpoint)
 */

export interface AIClientConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface AICompletionResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export class AIClient {
  private config: AIClientConfig;
  private baseUrl: string;
  
  constructor(config: AIClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai';
  }
  
  /**
   * Generate a chat completion
   */
  async generateCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const requestBody = {
      model: this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      top_p: options.topP,
      stop: options.stopSequences,
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };
    
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model: data.model,
      finishReason: data.choices[0].finish_reason,
    };
  }
  
  /**
   * Generate a simple text completion
   */
  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: Partial<AICompletionOptions>
  ): Promise<AICompletionResponse> {
    return this.generateCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...options,
    });
  }
}

/**
 * Create an AI client from environment
 */
export function createAIClient(env: {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
}): AIClient {
  return new AIClient({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  });
}
