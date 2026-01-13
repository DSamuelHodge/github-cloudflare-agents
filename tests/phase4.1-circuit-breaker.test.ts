/**
 * Phase 4.1 Stage 3: Circuit Breaker Tests
 * 
 * Tests for circuit breaker pattern with KV-backed state persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/platform/ai/circuit-breaker';
import type { CircuitBreakerConfig } from '../src/types/circuit-breaker';

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

describe('CircuitBreaker', () => {
  let mockKV: KVNamespace;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    mockKV = createMockKV();
    config = {
      failureThreshold: 3,
      successThreshold: 2,
      openTimeout: 1000, // 1 second for testing
      halfOpenMaxCalls: 1,
    };
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create circuit breaker with default CLOSED state', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);
      const state = await breaker.getState();

      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('should restore state from KV', async () => {
      // Pre-populate KV with existing state
      await mockKV.put(
        'circuit-breaker:gemini',
        JSON.stringify({
          state: 'OPEN',
          failureCount: 3,
          successCount: 0,
          lastTransitionTime: Date.now(),
        })
      );

      const breaker = new CircuitBreaker('gemini', mockKV, config);
      const state = await breaker.getState();

      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
    });
  });

  describe('state transitions', () => {
    it('should transition from CLOSED to OPEN after failure threshold', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Record failures up to threshold
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch {
          // Expected
        }
      }

      const state = await breaker.getState();
      expect(state.state).toBe('OPEN');
    });

    it('should transition from OPEN to HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Force circuit to OPEN state
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch {
          // Expected
        }
      }

      // Verify OPEN
      let state = await breaker.getState();
      expect(state.state).toBe('OPEN');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, config.openTimeout + 100));

      // Next execute should attempt HALF_OPEN
      try {
        await breaker.execute(async () => {
          return 'success';
        });
      } catch {
        // May fail if timeout check triggers differently
      }

      state = await breaker.getState();
      expect(['HALF_OPEN', 'CLOSED']).toContain(state.state);
    });

    it('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Force circuit to HALF_OPEN state
      await mockKV.put(
        'circuit-breaker:gemini',
        JSON.stringify({
          state: 'HALF_OPEN',
          failureCount: 0,
          successCount: 0,
          lastTransitionTime: Date.now(),
        })
      );

      // Clear cache to force KV read
      await breaker.reset();
      await mockKV.put(
        'circuit-breaker:gemini',
        JSON.stringify({
          state: 'HALF_OPEN',
          failureCount: 0,
          successCount: 0,
          lastTransitionTime: Date.now(),
        })
      );

      // Record successes up to threshold
      for (let i = 0; i < config.successThreshold; i++) {
        await breaker.execute(async () => {
          return 'success';
        });
      }

      const state = await breaker.getState();
      expect(state.state).toBe('CLOSED');
    });

    it('should transition from HALF_OPEN to OPEN on failure', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Force circuit to HALF_OPEN state directly in KV
      const halfOpenState = {
        state: 'HALF_OPEN' as const,
        failureCount: 0,
        successCount: 0,
        lastTransitionTime: Date.now(),
      };
      
      await mockKV.put(
        'circuit-breaker:gemini',
        JSON.stringify(halfOpenState)
      );

      // Wait for cache to expire (breaker.cacheTTL is 5000ms, but we can't wait that long)
      // Instead, force a state read by creating a new breaker instance
      const freshBreaker = new CircuitBreaker('gemini', mockKV, config);

      // Record one failure
      try {
        await freshBreaker.execute(async () => {
          throw new Error('Test failure');
        });
      } catch {
        // Expected
      }

      const state = await freshBreaker.getState();
      expect(state.state).toBe('OPEN');
    });
  });

  describe('OPEN state behavior', () => {
    it('should reject requests immediately when OPEN', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Force circuit to OPEN state
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch {
          // Expected
        }
      }

      // Verify OPEN
      const state = await breaker.getState();
      expect(state.state).toBe('OPEN');

      // Try to execute - should be rejected immediately
      await expect(
        breaker.execute(async () => {
          return 'should not execute';
        })
      ).rejects.toThrow('Circuit breaker is OPEN');
    });
  });

  describe('success handling', () => {
    it('should reset failure count on success in CLOSED state', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Record some failures
      for (let i = 0; i < config.failureThreshold - 1; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch {
          // Expected
        }
      }

      // Record success
      await breaker.execute(async () => {
        return 'success';
      });

      const state = await breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should track basic metrics', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Record some successes and failures
      await breaker.execute(async () => 'success');
      
      try {
        await breaker.execute(async () => {
          throw new Error('failure');
        });
      } catch {
        // Expected
      }

      const metrics = await breaker.getMetrics();

      expect(metrics.provider).toBe('gemini');
      expect(metrics.state).toBe('CLOSED');
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const breaker = new CircuitBreaker('gemini', mockKV, config);

      // Force circuit to OPEN state
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch {
          // Expected
        }
      }

      // Verify OPEN
      let state = await breaker.getState();
      expect(state.state).toBe('OPEN');

      // Reset
      await breaker.reset();

      // Verify CLOSED
      state = await breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });
  });
});
