/**
 * Phase 4.1 Stage 2: Gateway Client Tests
 * 
 * Tests for Cloudflare AI Gateway client adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayAIClient, createGatewayClient, type AIProvider } from '../src/platform/ai/gateway-client';
import type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse } from '../src/types/openai';

// Mock fetch
const mockFetch = vi.fn();

// Augment global with fetch mock for tests
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe('GatewayAIClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create client with valid config', () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'gemini',
      });

      expect(client).toBeInstanceOf(GatewayAIClient);
    });

    it('should throw error with invalid config', () => {
      expect(() => {
        new GatewayAIClient({
          accountId: '',
          gatewayId: 'test-gateway',
          apiToken: 'test-token',
          provider: 'gemini',
        });
      }).toThrow('Invalid gateway configuration');
    });

    it('should create client from env vars', () => {
      const env = {
        CLOUDFLARE_ACCOUNT_ID: 'test-account',
        CLOUDFLARE_GATEWAY_ID: 'test-gateway',
        CLOUDFLARE_API_TOKEN: 'test-token',
        AI_PROVIDER: 'gemini',
      };

      const client = createGatewayClient(env);
      expect(client).toBeInstanceOf(GatewayAIClient);
    });

    it('should default to gemini provider if not specified', () => {
      const env = {
        CLOUDFLARE_ACCOUNT_ID: 'test-account',
        CLOUDFLARE_GATEWAY_ID: 'test-gateway',
        CLOUDFLARE_API_TOKEN: 'test-token',
      };

      const client = createGatewayClient(env);
      expect(client).toBeInstanceOf(GatewayAIClient);
    });
  });

  describe('Gemini provider', () => {
    const mockRequest: OpenAIChatCompletionRequest = {
      model: 'gemini-2.0-flash-exp',
      messages: [
        { role: 'user', content: 'Hello, how are you?' },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    };

    it('should transform request to Gemini format', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'gemini',
      });

      const mockGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'I am doing well, thank you!' }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 15,
          totalTokenCount: 25,
        },
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockGeminiResponse,
      });

      const response = await client.createChatCompletion(mockRequest);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/google-ai-studio/v1beta/models/gemini-2.0-flash-exp:generateContent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(response.choices[0].message.content).toBe('I am doing well, thank you!');
      expect(response.usage?.total_tokens).toBe(25);
    });

    it('should handle Gemini error response', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'gemini',
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      });

      await expect(client.createChatCompletion(mockRequest)).rejects.toThrow('Gateway request failed');
    });
  });

  describe('HuggingFace provider', () => {
    const mockRequest: OpenAIChatCompletionRequest = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: 'Tell me a joke' },
      ],
    };

    it('should pass through OpenAI-compatible format', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'huggingface',
      });

      const mockOpenAIResponse: OpenAIChatCompletionResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Why did the chicken cross the road?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpenAIResponse,
      });

      const response = await client.createChatCompletion(mockRequest);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/openai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
        })
      );

      expect(response).toEqual(mockOpenAIResponse);
    });
  });

  describe('Anthropic provider', () => {
    const mockRequest: OpenAIChatCompletionRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Explain quantum computing' },
      ],
      max_tokens: 1024,
    };

    it('should transform request to Anthropic format', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'anthropic',
      });

      const mockAnthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Quantum computing uses quantum mechanics...',
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 15,
          output_tokens: 45,
        },
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnthropicResponse,
      });

      const response = await client.createChatCompletion(mockRequest);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/anthropic/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'anthropic-version': '2023-06-01',
          }),
        })
      );

      expect(response.choices[0].message.content).toBe('Quantum computing uses quantum mechanics...');
      expect(response.usage?.total_tokens).toBe(60);
    });

    it('should require max_tokens for Anthropic', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'anthropic',
      });

      const requestWithoutMaxTokens: OpenAIChatCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const mockAnthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 5 },
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnthropicResponse,
      });

      // Should default to 1024 tokens
      await client.createChatCompletion(requestWithoutMaxTokens);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.max_tokens).toBe(1024);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'gemini',
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      expect(
        client.createChatCompletion({
          model: 'gemini-2.0-flash-exp',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow('Gateway client error');
    });

    it('should handle invalid JSON responses', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'gemini',
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(
        client.createChatCompletion({
          model: 'gemini-2.0-flash-exp',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow();
    });

    it('should handle missing response data', async () => {
      const client = new GatewayAIClient({
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        provider: 'gemini',
      });

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [] }),
      });

      await expect(
        client.createChatCompletion({
          model: 'gemini-2.0-flash-exp',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow('Invalid Gemini response');
    });
  });

  describe('provider selection', () => {
    const testProviders: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];

    testProviders.forEach((provider) => {
      it(`should route requests to ${provider} provider`, async () => {
        const client = new GatewayAIClient({
          accountId: 'test-account',
          gatewayId: 'test-gateway',
          apiToken: 'test-token',
          provider,
        });

        const mockResponse = provider === 'gemini' 
          ? {
              candidates: [{
                content: { parts: [{ text: 'Test' }], role: 'model' },
                finishReason: 'STOP',
              }],
            }
          : provider === 'anthropic'
          ? {
              id: 'msg_123',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Test' }],
              model: 'claude-3-5-sonnet-20241022',
              stop_reason: 'end_turn',
              usage: { input_tokens: 5, output_tokens: 5 },
            }
          : {
              id: 'chatcmpl-123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-3.5-turbo',
              choices: [{
                index: 0,
                message: { role: 'assistant', content: 'Test' },
                finish_reason: 'stop',
              }],
            };

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await client.createChatCompletion({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
        });

        const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        
        if (provider === 'gemini') {
          expect(url).toContain('/google-ai-studio/');
        } else if (provider === 'huggingface') {
          expect(url).toContain('/openai/');
        } else if (provider === 'anthropic') {
          expect(url).toContain('/anthropic/');
        }
      });
    });
  });
});
