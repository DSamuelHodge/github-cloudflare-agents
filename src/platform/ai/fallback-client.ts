/**
 * Phase 4.1 Stage 3: Fallback AI Client Implementation
 * 
 * Implements automatic failover between AI providers using circuit breaker pattern.
 * Provider chain: Gemini (primary) → HuggingFace (fallback 1) → Anthropic (fallback 2)
 */

import { Logger } from '../../utils/logger';
import { AgentError } from '../../utils/errors';
import { GatewayAIClient } from './gateway-client';
import { CircuitBreaker, createCircuitBreaker } from './circuit-breaker';
import type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse } from '../../types/openai';
import type { AIProvider, Env } from '../../types/env';
import type { CircuitBreakerConfig } from '../../types/circuit-breaker';

/**
 * Configuration for fallback AI client
 */
export interface FallbackAIClientConfig {
  /** Ordered list of providers to try (first = primary, rest = fallbacks) */
  providers: AIProvider[];
  
  /** Cloudflare account ID */
  accountId: string;
  
  /** Cloudflare AI Gateway ID */
  gatewayId: string;
  
  /** Cloudflare API token */
  apiToken: string;
  
  /** KV namespace for circuit breaker state */
  kv: KVNamespace;
  
  /** Circuit breaker configuration (optional, uses defaults if not provided) */
  circuitBreakerConfig?: CircuitBreakerConfig;
  
  /** Model to use for each provider (optional, uses environment default if not provided) */
  models?: Partial<Record<AIProvider, string>>;
}

/**
 * Fallback AI client with automatic provider failover
 * 
 * Wraps GatewayAIClient and adds:
 * - Circuit breaker for each provider
 * - Automatic failover to next provider on errors
 * - Provider chain configuration
 * - Metrics collection
 */
export class FallbackAIClient {
  private readonly logger: Logger;
  private readonly circuitBreakers: Map<AIProvider, CircuitBreaker>;
  private readonly gatewayClients: Map<AIProvider, GatewayAIClient>;
  private readonly providers: AIProvider[];
  private readonly models: Partial<Record<AIProvider, string>>;

  constructor(private readonly config: FallbackAIClientConfig) {
    this.logger = new Logger('info', { component: 'FallbackAIClient' });
    this.providers = config.providers;
    this.models = config.models || {};
    this.circuitBreakers = new Map();
    this.gatewayClients = new Map();

    // Initialize circuit breakers and gateway clients for each provider
    for (const provider of this.providers) {
      // Create circuit breaker
      const circuitBreaker = new CircuitBreaker(
        provider,
        config.kv,
        config.circuitBreakerConfig || {
          failureThreshold: 3,
          successThreshold: 2,
          openTimeout: 60000,
          halfOpenMaxCalls: 1,
        }
      );
      this.circuitBreakers.set(provider, circuitBreaker);

      // Create gateway client
      const gatewayClient = new GatewayAIClient({
        accountId: config.accountId,
        gatewayId: config.gatewayId,
        apiToken: config.apiToken,
        provider,
        model: this.models[provider] || this.getDefaultModel(provider),
      });
      this.gatewayClients.set(provider, gatewayClient);
    }

    this.logger.info('FallbackAIClient initialized', undefined, {
      providers: this.providers,
      providerCount: this.providers.length,
    });
  }

  /**
   * Execute chat completion with automatic fallback
   * 
   * Tries providers in order, skipping any with OPEN circuit breakers.
   * Returns response from first successful provider.
   * 
   * @param request - OpenAI chat completion request
   * @returns OpenAI chat completion response
   * @throws AgentError if all providers fail or are unavailable
   */
  async createChatCompletion(
    request: OpenAIChatCompletionRequest
  ): Promise<OpenAIChatCompletionResponse> {
    const attemptedProviders: AIProvider[] = [];
    const errors: Array<{ provider: AIProvider; error: Error }> = [];

    for (const provider of this.providers) {
      try {
        attemptedProviders.push(provider);
        
        this.logger.info('Attempting provider', undefined, {
          provider,
          attemptNumber: attemptedProviders.length,
          totalProviders: this.providers.length,
        });

        const response = await this.tryProvider(provider, request);
        
        this.logger.info('Provider succeeded', undefined, {
          provider,
          attemptedProviders,
          totalAttempts: attemptedProviders.length,
        });

        return response;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        errors.push({ provider, error: err });

        this.logger.warn('Provider failed, trying next', err, {
          provider,
          attemptedProviders,
          remainingProviders: this.providers.length - attemptedProviders.length,
          errorMessage: err.message,
        });

        // Continue to next provider
      }
    }

    // All providers failed
    this.logger.error('All providers failed', undefined, {
      attemptedProviders,
      errorCount: errors.length,
      errors: errors.map(e => ({ provider: e.provider, message: e.error.message })),
    });

    throw new AgentError(
      `All AI providers failed or unavailable. Attempted: ${attemptedProviders.join(', ')}`,
      'ALL_PROVIDERS_FAILED'
    );
  }

  /**
   * Get metrics for all circuit breakers
   */
  async getMetrics(): Promise<Record<AIProvider, unknown>> {
    const metrics: Record<string, unknown> = {};

    for (const [provider, circuitBreaker] of this.circuitBreakers.entries()) {
      metrics[provider] = await circuitBreaker.getMetrics();
    }

    return metrics as Record<AIProvider, unknown>;
  }

  /**
   * Reset all circuit breakers (for testing or recovery)
   */
  async resetAllCircuitBreakers(): Promise<void> {
    for (const [provider, circuitBreaker] of this.circuitBreakers.entries()) {
      await circuitBreaker.reset();
      this.logger.info('Circuit breaker reset', undefined, { provider });
    }
  }

  /**
   * Try a specific provider through its circuit breaker
   */
  private async tryProvider(
    provider: AIProvider,
    request: OpenAIChatCompletionRequest
  ): Promise<OpenAIChatCompletionResponse> {
    const circuitBreaker = this.circuitBreakers.get(provider);
    const gatewayClient = this.gatewayClients.get(provider);

    if (!circuitBreaker || !gatewayClient) {
      throw new AgentError(
        `Provider ${provider} not configured`,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    // Use provider-specific model if configured, otherwise use request model
    const model = this.models[provider] || request.model;
    const providerRequest = { ...request, model };

    // Execute through circuit breaker
    return circuitBreaker.execute(async () => {
      return gatewayClient.createChatCompletion(providerRequest);
    });
  }

  /**
   * Get default model for a provider
   */
  private getDefaultModel(provider: AIProvider): string {
    const defaults: Record<AIProvider, string> = {
      gemini: 'gemini-2.0-flash-exp',
      huggingface: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      anthropic: 'claude-3-5-sonnet-20241022',
    };

    return defaults[provider];
  }
}

/**
 * Create fallback AI client from environment configuration
 * 
 * @param env - Cloudflare Workers environment
 * @param providerChain - Optional provider chain (defaults to gemini,huggingface,anthropic)
 * @returns Configured FallbackAIClient instance
 */
export function createFallbackClient(
  env: Env,
  providerChain?: AIProvider[]
): FallbackAIClient {
  // Parse provider chain from environment or use default
  let providers: AIProvider[];
  
  if (providerChain) {
    providers = providerChain;
  } else if (env.AI_FALLBACK_PROVIDERS) {
    providers = env.AI_FALLBACK_PROVIDERS.split(',').map(p => p.trim()) as AIProvider[];
  } else {
    providers = ['gemini', 'huggingface', 'anthropic'];
  }

  // Validate required environment variables
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new AgentError('CLOUDFLARE_ACCOUNT_ID is required', 'MISSING_CONFIG');
  }
  if (!env.CLOUDFLARE_GATEWAY_ID) {
    throw new AgentError('CLOUDFLARE_GATEWAY_ID is required', 'MISSING_CONFIG');
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new AgentError('CLOUDFLARE_API_TOKEN is required', 'MISSING_CONFIG');
  }
  if (!env.DOC_EMBEDDINGS) {
    throw new AgentError('DOC_EMBEDDINGS KV namespace is required', 'MISSING_CONFIG');
  }

  // Parse circuit breaker configuration from environment
  const circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD
      ? parseInt(env.CIRCUIT_BREAKER_FAILURE_THRESHOLD, 10)
      : 3,
    successThreshold: env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD
      ? parseInt(env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD, 10)
      : 2,
    openTimeout: env.CIRCUIT_BREAKER_OPEN_TIMEOUT
      ? parseInt(env.CIRCUIT_BREAKER_OPEN_TIMEOUT, 10)
      : 60000,
    halfOpenMaxCalls: 1,
  };

  return new FallbackAIClient({
    providers,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.CLOUDFLARE_GATEWAY_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    kv: env.DOC_EMBEDDINGS,
    circuitBreakerConfig,
  });
}
