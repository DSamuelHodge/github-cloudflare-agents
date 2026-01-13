/**
 * Phase 4.1 Stage 3: Fallback AI Client Tests
 * 
 * Tests for automatic failover between AI providers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackAIClient, createFallbackClient } from '../src/platform/ai/fallback-client';
import type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse } from '../src/types/openai';
import type { Env } from '../src/types/env';

// Mock KV namespace
const createMockKV = (): KVNamespace => {
  const store = new Map<string, string>();
  
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (!value) return null;
      return type === 'json' ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
};

// Mock fetch
const mockFetch = vi.fn();

// Augment global with fetch mock for tests
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe('FallbackAIClient', () => {
  let mockKV: KVNamespace;
  let mockEnv: Env;

  beforeEach(() => {
    mockKV = createMockKV();
    mockEnv = {
      CLOUDFLARE_ACCOUNT_ID: 'test-account',
      CLOUDFLARE_GATEWAY_ID: 'test-gateway',
      CLOUDFLARE_API_TOKEN: 'test-token',
      DOC_EMBEDDINGS: mockKV,
    } as Env;
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create fallback client with default provider chain', () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface', 'anthropic'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      expect(client).toBeDefined();
    });

    it('should create fallback client with custom provider chain', () => {
      const client = new FallbackAIClient({
        providers: ['anthropic', 'gemini'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      expect(client).toBeDefined();
    });

    it('should create fallback client from environment', () => {
      const client = createFallbackClient(mockEnv);
      expect(client).toBeDefined();
    });

    it('should parse provider chain from environment variable', () => {
      const envWithProviders = {
        ...mockEnv,
        AI_FALLBACK_PROVIDERS: 'gemini,anthropic',
      };

      const client = createFallbackClient(envWithProviders);
      expect(client).toBeDefined();
    });
  });

  describe('primary provider success', () => {
    it('should use primary provider (Gemini) when available', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface', 'anthropic'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      const mockResponse: OpenAIChatCompletionResponse = {
        id: 'gemini-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gemini-2.0-flash-exp',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from Gemini!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const request: OpenAIChatCompletionRequest = {
        model: 'gemini-2.0-flash-exp',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await client.createChatCompletion(request);

      expect(response.id).toBe('gemini-123');
      expect(response.choices[0].message.content).toBe('Hello from Gemini!');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('failover scenarios', () => {
    it('should failover to second provider (HuggingFace) when Gemini fails', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface', 'anthropic'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      const hfResponse: OpenAIChatCompletionResponse = {
        id: 'hf-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'mixtral',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from HuggingFace!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      // Gemini fails (returns response without candidates)
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ id: 'gemini-fail', object: 'chat.completion', created: Date.now(), model: 'gemini', choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }),
        text: async () => JSON.stringify({ choices: [] }),
      } as Response);

      // HuggingFace succeeds
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => hfResponse,
        text: async () => JSON.stringify(hfResponse),
      } as Response);

      const request: OpenAIChatCompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await client.createChatCompletion(request);

      expect(response.id).toBe('hf-123');
      expect(response.choices[0].message.content).toBe('Hello from HuggingFace!');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should failover to third provider (Anthropic) when first two fail', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface', 'anthropic'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      const anthropicResponse: OpenAIChatCompletionResponse = {
        id: 'anthropic-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-3-5-sonnet',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from Anthropic!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      // Gemini fails (returns OpenAI format without choices)
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          id: 'gemini-fail',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gemini',
          choices: [], // Empty choices triggers error
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        }),
        text: async () => JSON.stringify({ choices: [] }),
      } as Response);

      // HuggingFace fails (returns OpenAI format without choices)
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          id: 'hf-fail',
          object: 'chat.completion',
          created: Date.now(),
          model: 'mixtral',
          choices: [], // Empty choices triggers error
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        }),
        text: async () => JSON.stringify({ choices: [] }),
      } as Response);

      // Anthropic succeeds
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => anthropicResponse,
        text: async () => JSON.stringify(anthropicResponse),
      } as Response);

      const request: OpenAIChatCompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await client.createChatCompletion(request);

      expect(response.id).toBe('anthropic-123');
      expect(response.choices[0].message.content).toBe('Hello from Anthropic!');
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error when all providers fail', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface', 'anthropic'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      // All providers fail (return OpenAI format with empty choices)
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            id: 'gemini-fail',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gemini',
            choices: [], // Empty choices triggers error
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          }),
          text: async () => JSON.stringify({ choices: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            id: 'hf-fail',
            object: 'chat.completion',
            created: Date.now(),
            model: 'mixtral',
            choices: [], // Empty choices triggers error
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          }),
          text: async () => JSON.stringify({ choices: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            id: 'anthropic-fail',
            object: 'chat.completion',
            created: Date.now(),
            model: 'claude',
            choices: [], // Empty choices triggers error
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          }),
          text: async () => JSON.stringify({ choices: [] }),
        } as Response);

      const request: OpenAIChatCompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      await expect(client.createChatCompletion(request)).rejects.toThrow('All AI providers failed or unavailable');
    });
  });

  describe('circuit breaker integration', () => {
    it('should skip provider with OPEN circuit breaker', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
        circuitBreakerConfig: {
          failureThreshold: 2,
          successThreshold: 2,
          openTimeout: 60000,
          halfOpenMaxCalls: 1,
        },
      });

      // Fail Gemini twice to open circuit (empty candidates)
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ id: 'gemini-fail', object: 'chat.completion', created: Date.now(), model: 'gemini', choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }),
        text: async () => JSON.stringify({ choices: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ id: 'gemini-fail', object: 'chat.completion', created: Date.now(), model: 'gemini', choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }),
        text: async () => JSON.stringify({ choices: [] }),
        } as Response);

      // HuggingFace also fails twice
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ choices: [] }),
          text: async () => JSON.stringify({ choices: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ choices: [] }),
          text: async () => JSON.stringify({ choices: [] }),
        } as Response);

      const request: OpenAIChatCompletionRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      // First two requests will fail Gemini
      try {
        await client.createChatCompletion(request);
      } catch {
        // Expected
      }

      try {
        await client.createChatCompletion(request);
      } catch {
        // Expected
      }

      // Third request should skip Gemini (circuit OPEN) and try HuggingFace directly
      const hfResponse: OpenAIChatCompletionResponse = {
        id: 'hf-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'mixtral',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => hfResponse,
        text: async () => JSON.stringify(hfResponse),
      } as Response);

      const response = await client.createChatCompletion(request);
      expect(response.id).toBe('hf-123');
    });
  });

  describe('metrics', () => {
    it('should provide metrics for all circuit breakers', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      const metrics = await client.getMetrics();

      expect(metrics).toHaveProperty('gemini');
      expect(metrics).toHaveProperty('huggingface');
    });
  });

  describe('reset functionality', () => {
    it('should reset all circuit breakers', async () => {
      const client = new FallbackAIClient({
        providers: ['gemini', 'huggingface'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
      });

      await client.resetAllCircuitBreakers();

      const metrics = await client.getMetrics();
      expect(metrics.gemini).toBeDefined();
      expect(metrics.huggingface).toBeDefined();
    });
  });

  describe('metrics integration', () => {
    it('should record metrics when provided', async () => {
      const mockCollector = {
        recordRequest: vi.fn(),
        recordSuccess: vi.fn(),
        recordFailure: vi.fn(),
      };

      const client = new FallbackAIClient({
        providers: ['gemini'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
        // @ts-expect-error - Partial mock for testing
        metricsCollector: mockCollector,
      });

      const request: OpenAIChatCompletionRequest = {
        model: 'gemini-2.0-flash-exp',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const mockResponse: OpenAIChatCompletionResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gemini-2.0-flash-exp',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.createChatCompletion(request);

      expect(mockCollector.recordRequest).toHaveBeenCalledWith('gemini');
      expect(mockCollector.recordSuccess).toHaveBeenCalledWith(
        'gemini',
        expect.any(Number),
        30
      );
      expect(mockCollector.recordFailure).not.toHaveBeenCalled();
    });

    it('should record failures in metrics', async () => {
      const mockCollector = {
        recordRequest: vi.fn(),
        recordSuccess: vi.fn(),
        recordFailure: vi.fn(),
      };

      const client = new FallbackAIClient({
        providers: ['gemini'],
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        apiToken: 'test-token',
        kv: mockKV,
        // @ts-expect-error - Partial mock for testing
        metricsCollector: mockCollector,
      });

      const request: OpenAIChatCompletionRequest = {
        model: 'gemini-2.0-flash-exp',
        messages: [{ role: 'user', content: 'Test' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Server error' } }),
      });

      await expect(client.createChatCompletion(request)).rejects.toThrow();

      expect(mockCollector.recordRequest).toHaveBeenCalledWith('gemini');
      expect(mockCollector.recordFailure).toHaveBeenCalledWith(
        'gemini',
        expect.any(Number),
        expect.any(String),
        expect.any(String)
      );
      expect(mockCollector.recordSuccess).not.toHaveBeenCalled();
    });
  });
});
