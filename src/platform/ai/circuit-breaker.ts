/**
 * Phase 4.1 Stage 3: Circuit Breaker Implementation
 * 
 * Implements circuit breaker pattern with KV-backed state persistence
 * to prevent cascading failures when AI providers become unavailable.
 */

import { Logger } from '../../utils/logger';
import { AgentError } from '../../utils/errors';
import type {
  CircuitState,
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '../../types/circuit-breaker';
import type { AIProvider } from '../../types/env';

/**
 * Circuit breaker for AI provider requests
 * 
 * Follows the standard circuit breaker pattern:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Fail fast, skip provider
 * - HALF_OPEN: Test recovery, allow limited requests
 */
export class CircuitBreaker {
  private readonly logger: Logger;
  private readonly kvKey: string;
  private inMemoryState?: CircuitBreakerState;
  private inMemoryCacheTime?: number;
  private readonly cacheTTL = 5000; // 5 seconds in-memory cache

  constructor(
    private readonly provider: AIProvider,
    private readonly kv: KVNamespace,
    private readonly config: CircuitBreakerConfig
  ) {
    this.logger = new Logger('info', { component: 'CircuitBreaker', provider });
    this.kvKey = `circuit-breaker:${provider}`;
  }

  /**
   * Execute a function through the circuit breaker
   * 
   * @param fn - Function to execute
   * @returns Promise with function result
   * @throws AgentError if circuit is OPEN or execution fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    // Check if circuit is open
    if (state.state === 'OPEN') {
      // Check if timeout has expired, transition to HALF_OPEN
      const now = Date.now();
      const timeSinceTransition = now - state.lastTransitionTime;

      if (timeSinceTransition >= this.config.openTimeout) {
        await this.transition('HALF_OPEN');
        this.logger.info('Circuit breaker transitioning from OPEN to HALF_OPEN', undefined, {
          provider: this.provider,
          timeSinceTransition,
        });
      } else {
        this.logger.warn('Circuit breaker is OPEN, rejecting request', undefined, {
          provider: this.provider,
          timeRemaining: this.config.openTimeout - timeSinceTransition,
        });
        throw new AgentError(
          `Circuit breaker is OPEN for provider ${this.provider}`,
          'CIRCUIT_OPEN'
        );
      }
    }

    // Execute the function
    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   * Uses in-memory cache with TTL to reduce KV reads
   */
  async getState(): Promise<CircuitBreakerState> {
    const now = Date.now();

    // Check in-memory cache
    if (
      this.inMemoryState &&
      this.inMemoryCacheTime &&
      now - this.inMemoryCacheTime < this.cacheTTL
    ) {
      return this.inMemoryState;
    }

    // Fetch from KV
    const stored = await this.kv.get<CircuitBreakerState>(this.kvKey, 'json');

    if (!stored) {
      // Initialize new circuit breaker
      const initialState: CircuitBreakerState = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastTransitionTime: now,
      };

      // Cache in memory
      this.inMemoryState = initialState;
      this.inMemoryCacheTime = now;

      // Store in KV (async, don't block)
      void this.kv.put(this.kvKey, JSON.stringify(initialState));

      return initialState;
    }

    // Cache in memory
    this.inMemoryState = stored;
    this.inMemoryCacheTime = now;

    return stored;
  }

  /**
   * Get circuit breaker metrics
   */
  async getMetrics(): Promise<CircuitBreakerMetrics> {
    const state = await this.getState();

    return {
      provider: this.provider,
      state: state.state,
      totalRequests: state.failureCount + state.successCount,
      successfulRequests: state.successCount,
      failedRequests: state.failureCount,
      circuitOpenCount: 0, // TODO: Track this in state
      currentFailureStreak: state.failureCount,
      currentSuccessStreak: state.successCount,
      lastStateChangeTime: state.lastTransitionTime,
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  async reset(): Promise<void> {
    const now = Date.now();
    const initialState: CircuitBreakerState = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastTransitionTime: now,
    };

    // Update cache
    this.inMemoryState = initialState;
    this.inMemoryCacheTime = now;

    // Store in KV
    await this.kv.put(this.kvKey, JSON.stringify(initialState));

    this.logger.info('Circuit breaker reset', undefined, {
      provider: this.provider,
    });
  }

  /**
   * Record successful execution
   */
  private async recordSuccess(): Promise<void> {
    const state = await this.getState();
    const now = Date.now();

    if (state.state === 'HALF_OPEN') {
      // In HALF_OPEN, count successes
      const newSuccessCount = state.successCount + 1;

      if (newSuccessCount >= this.config.successThreshold) {
        // Transition to CLOSED
        await this.transition('CLOSED');
        this.logger.info('Circuit breaker closed after successful recovery', undefined, {
          provider: this.provider,
          successCount: newSuccessCount,
        });
      } else {
        // Still in HALF_OPEN, increment success count
        const newState: CircuitBreakerState = {
          ...state,
          successCount: newSuccessCount,
          failureCount: 0, // Reset failure count
        };
        await this.saveState(newState);
      }
    } else if (state.state === 'CLOSED') {
      // In CLOSED, reset failure count on success
      if (state.failureCount > 0) {
        const newState: CircuitBreakerState = {
          ...state,
          failureCount: 0,
          successCount: state.successCount + 1,
        };
        await this.saveState(newState);
      }
    }
  }

  /**
   * Record failed execution
   */
  private async recordFailure(error: unknown): Promise<void> {
    const state = await this.getState();
    const now = Date.now();

    this.logger.error('Circuit breaker recorded failure', error instanceof Error ? error : undefined, {
      provider: this.provider,
      currentState: state.state,
      failureCount: state.failureCount + 1,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (state.state === 'HALF_OPEN') {
      // In HALF_OPEN, any failure reopens the circuit
      await this.transition('OPEN');
    } else if (state.state === 'CLOSED') {
      // In CLOSED, count failures
      const newFailureCount = state.failureCount + 1;

      if (newFailureCount >= this.config.failureThreshold) {
        // Transition to OPEN
        await this.transition('OPEN');
        this.logger.warn('Circuit breaker opened due to failures', undefined, {
          provider: this.provider,
          failureCount: newFailureCount,
          threshold: this.config.failureThreshold,
        });
      } else {
        // Still in CLOSED, increment failure count
        const newState: CircuitBreakerState = {
          ...state,
          failureCount: newFailureCount,
          lastFailureTime: now,
        };
        await this.saveState(newState);
      }
    }
  }

  /**
   * Transition circuit breaker to a new state
   */
  private async transition(newState: CircuitState): Promise<void> {
    const now = Date.now();
    const state: CircuitBreakerState = {
      state: newState,
      failureCount: 0,
      successCount: 0,
      lastTransitionTime: now,
    };

    await this.saveState(state);

    this.logger.info('Circuit breaker state transition', undefined, {
      provider: this.provider,
      newState,
    });
  }

  /**
   * Save state to KV and update cache
   */
  private async saveState(state: CircuitBreakerState): Promise<void> {
    // Update cache
    this.inMemoryState = state;
    this.inMemoryCacheTime = Date.now();

    // Store in KV (async, don't block)
    await this.kv.put(this.kvKey, JSON.stringify(state));
  }
}

/**
 * Create circuit breaker from environment configuration
 */
export function createCircuitBreaker(
  provider: AIProvider,
  kv: KVNamespace,
  env: { [key: string]: string | undefined }
): CircuitBreaker {
  const config: CircuitBreakerConfig = {
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

  return new CircuitBreaker(provider, kv, config);
}
