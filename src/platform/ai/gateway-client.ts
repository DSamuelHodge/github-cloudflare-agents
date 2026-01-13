/**
 * Cloudflare AI Gateway Client
 * 
 * Phase 4.1 Stage 2: Multi-Provider AI Gateway Adapter
 * 
 * Routes AI requests through Cloudflare AI Gateway with support for:
 * - Gemini (Google AI Studio)
 * - HuggingFace (OpenAI-compatible)
 * - Anthropic (Claude)
 * 
 * Implements OpenAI-compatible interface for seamless integration.
 */

import { Logger } from '../../utils/logger';
import { AgentError } from '../../utils/errors';
import type { 
  OpenAIChatCompletionRequest, 
  OpenAIChatCompletionResponse,
  OpenAIMessage 
} from '../../types/openai';

/**
 * Supported AI providers via Cloudflare Gateway
 */
export type AIProvider = 'gemini' | 'huggingface' | 'anthropic';

/**
 * Gateway client configuration
 */
export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
  apiToken: string;
  provider: AIProvider;
  model?: string;
}

/**
 * Provider-specific endpoint configuration
 */
interface ProviderEndpoint {
  path: string;
  headers: Record<string, string>;
  transformRequest: (req: OpenAIChatCompletionRequest) => unknown;
  transformResponse: (res: unknown) => OpenAIChatCompletionResponse;
}

/**
 * Gemini API request format
 */
interface GeminiRequest {
  contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Gemini API response format
 */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Anthropic API request format
 */
interface AnthropicRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  max_tokens: number;
  temperature?: number;
}

/**
 * Anthropic API response format
 */
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Cloudflare AI Gateway Client
 * 
 * Provides unified OpenAI-compatible interface for multiple AI providers.
 */
export class GatewayAIClient {
  private readonly logger: Logger;
  private readonly config: GatewayConfig;
  private readonly baseUrl: string;

  constructor(config: GatewayConfig) {
    this.logger = new Logger('info', { component: 'GatewayAIClient' });
    this.config = config;
    this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}`;

    // Validate configuration
    if (!config.accountId || !config.gatewayId || !config.apiToken) {
      throw new AgentError(
        'Invalid gateway configuration: accountId, gatewayId, and apiToken are required',
        'INVALID_CONFIG'
      );
    }

    this.logger.info('Gateway client initialized', {
      provider: config.provider,
      gatewayId: config.gatewayId,
    });
  }

  /**
   * Send chat completion request through gateway
   */
  async createChatCompletion(request: OpenAIChatCompletionRequest): Promise<OpenAIChatCompletionResponse> {
    const endpoint = this.getProviderEndpoint();
    const url = `${this.baseUrl}${endpoint.path}`;

    try {
      this.logger.debug('Sending request to gateway', {
        provider: this.config.provider,
        model: request.model,
        messages: request.messages.length,
      });

      // Transform request to provider format
      const providerRequest = endpoint.transformRequest(request);

      // Make request to gateway
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...endpoint.headers,
        },
        body: JSON.stringify(providerRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Gateway request failed', undefined, {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
        });
        throw new AgentError(
          `Gateway request failed: ${response.status} ${response.statusText}`,
          'GATEWAY_ERROR'
        );
      }

      const data: unknown = await response.json();

      // Transform response to OpenAI format
      const completion = endpoint.transformResponse(data);

      this.logger.info('Gateway request successful', {
        provider: this.config.provider,
        model: completion.model,
        tokensUsed: completion.usage?.total_tokens,
      });

      return completion;
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }

      this.logger.error('Gateway client error', error instanceof Error ? error : undefined, {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        provider: this.config.provider,
      });

      throw new AgentError(
        `Gateway client error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GATEWAY_CLIENT_ERROR'
      );
    }
  }

  /**
   * Get provider-specific endpoint configuration
   */
  private getProviderEndpoint(): ProviderEndpoint {
    switch (this.config.provider) {
      case 'gemini':
        return this.getGeminiEndpoint();
      case 'huggingface':
        return this.getHuggingFaceEndpoint();
      case 'anthropic':
        return this.getAnthropicEndpoint();
      default:
        throw new AgentError(
          `Unsupported provider: ${this.config.provider}`,
          'UNSUPPORTED_PROVIDER'
        );
    }
  }

  /**
   * Gemini endpoint configuration
   */
  private getGeminiEndpoint(): ProviderEndpoint {
    const model = this.config.model || 'gemini-2.0-flash-exp';
    
    return {
      path: `/google-ai-studio/v1beta/models/${model}:generateContent`,
      headers: {},
      transformRequest: (req: OpenAIChatCompletionRequest): GeminiRequest => {
        return {
          contents: req.messages.map((msg: OpenAIMessage) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          })),
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.max_tokens,
          },
        };
      },
      transformResponse: (res: unknown): OpenAIChatCompletionResponse => {
        const geminiRes = res as GeminiResponse;
        const candidate = geminiRes.candidates?.[0];

        if (!candidate || !candidate.content) {
          throw new AgentError('Invalid Gemini response: no candidates', 'INVALID_RESPONSE');
        }

        return {
          id: `gemini-${Date.now()}`,
          object: 'chat.completion',
          created: Date.now(),
          model: this.config.model || 'gemini-2.0-flash-exp',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: candidate.content.parts[0]?.text || '',
              },
              finish_reason: (candidate.finishReason?.toLowerCase() || 'stop') as 'stop' | 'length' | 'content_filter' | 'tool_calls',
            },
          ],
          usage: geminiRes.usageMetadata ? {
            prompt_tokens: geminiRes.usageMetadata.promptTokenCount,
            completion_tokens: geminiRes.usageMetadata.candidatesTokenCount,
            total_tokens: geminiRes.usageMetadata.totalTokenCount,
          } : {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };
      },
    };
  }

  /**
   * HuggingFace endpoint configuration (OpenAI-compatible)
   */
  private getHuggingFaceEndpoint(): ProviderEndpoint {
    return {
      path: '/openai/v1/chat/completions',
      headers: {},
      transformRequest: (req: OpenAIChatCompletionRequest): OpenAIChatCompletionRequest => {
        // HuggingFace uses OpenAI format, pass through
        return req;
      },
      transformResponse: (res: unknown): OpenAIChatCompletionResponse => {
        // HuggingFace returns OpenAI format, pass through
        return res as OpenAIChatCompletionResponse;
      },
    };
  }

  /**
   * Anthropic endpoint configuration
   */
  private getAnthropicEndpoint(): ProviderEndpoint {
    return {
      path: '/anthropic/v1/messages',
      headers: {
        'anthropic-version': '2023-06-01',
      },
      transformRequest: (req: OpenAIChatCompletionRequest): AnthropicRequest => {
        return {
          model: req.model || 'claude-3-5-sonnet-20241022',
          messages: req.messages.map((msg: OpenAIMessage) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
          })),
          max_tokens: req.max_tokens || 1024,
          temperature: req.temperature,
        };
      },
      transformResponse: (res: unknown): OpenAIChatCompletionResponse => {
        const anthropicRes = res as AnthropicResponse;

        if (!anthropicRes.content || anthropicRes.content.length === 0) {
          throw new AgentError('Invalid Anthropic response: no content', 'INVALID_RESPONSE');
        }

        return {
          id: anthropicRes.id,
          object: 'chat.completion',
          created: Date.now(),
          model: anthropicRes.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: anthropicRes.content[0]?.text || '',
              },
              finish_reason: (anthropicRes.stop_reason || 'stop') as 'stop' | 'length' | 'content_filter' | 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: anthropicRes.usage.input_tokens,
            completion_tokens: anthropicRes.usage.output_tokens,
            total_tokens: anthropicRes.usage.input_tokens + anthropicRes.usage.output_tokens,
          },
        };
      },
    };
  }
}

/**
 * Create gateway client from environment variables
 */
export function createGatewayClient(env: {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_GATEWAY_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
}): GatewayAIClient {
  const provider = (env.AI_PROVIDER || 'gemini') as AIProvider;

  return new GatewayAIClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.CLOUDFLARE_GATEWAY_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    provider,
    model: env.AI_MODEL,
  });
}
