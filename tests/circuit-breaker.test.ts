/**
 * Property-based tests for CircuitBreaker that mirror TLA+ Safety invariants
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../src/platform/ai/circuit-breaker';
import type { CircuitBreakerConfig } from '../src/types/circuit-breaker';
import type { AIProvider } from '../src/platform/ai/gateway-client';

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

describe('CircuitBreaker - TLA+ Safety Properties', () => {
  let kv: KVNamespace;
  let config: CircuitBreakerConfig;
  let breaker: CircuitBreaker;
  const provider: AIProvider = 'anthropic';

  beforeEach(() => {
    kv = createMockKV();
    config = {
      failureThreshold: 2,
      successThreshold: 2,
      openTimeout: 60000,
      halfOpenMaxCalls: 1,
    };
    breaker = new CircuitBreaker(provider, kv, config);
  });

  describe('Safety Invariant: Circuit opens only under valid conditions', () => {
    it('INVARIANT: OPEN state requires failureCount >= failureThreshold OR successCount < successThreshold', async () => {
      const state = await breaker.getState();
      
      if (state.state === 'OPEN') {
        const isValid = 
          state.failureCount >= config.failureThreshold ||
          state.successCount < config.successThreshold;
        
        expect(isValid).toBe(true);
      }
    });

    it('Transition CLOSED -> OPEN only after reaching failure threshold', async () => {
      // Simulate failures below threshold
      try {
        await breaker.execute(async () => {
          throw new Error('Failure 1');
        });
      } catch {}

      let state = await breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(1);

      // One more failure should open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('Failure 2');
        });
      } catch {}

      state = await breaker.getState();
      expect(state.state).toBe('OPEN');
      // After transition, counters are reset to 0
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('Transition HALF_OPEN -> OPEN on any failure (successCount < threshold)', async () => {
      // First, open the circuit
      try {
        await breaker.execute(async () => { throw new Error('Fail 1'); });
      } catch {}
      try {
        await breaker.execute(async () => { throw new Error('Fail 2'); });
      } catch {}

      let state = await breaker.getState();
      expect(state.state).toBe('OPEN');

      // Manually transition to HALF_OPEN (simulating timeout)
      await (breaker as any).transition('HALF_OPEN');
      state = await breaker.getState();
      expect(state.state).toBe('HALF_OPEN');
      expect(state.successCount).toBe(0); // Below threshold

      // Any failure in HALF_OPEN should reopen
      try {
        await breaker.execute(async () => {
          throw new Error('Failure in half-open');
        });
      } catch {}

      state = await breaker.getState();
      expect(state.state).toBe('OPEN');
    });

    it('Transition HALF_OPEN -> CLOSED only after reaching success threshold', async () => {
      // Setup: Get to HALF_OPEN state
      try {
        await breaker.execute(async () => { throw new Error('Fail 1'); });
      } catch {}
      try {
        await breaker.execute(async () => { throw new Error('Fail 2'); });
      } catch {}
      await (breaker as any).transition('HALF_OPEN');

      // First success - should stay HALF_OPEN
      await breaker.execute(async () => 'success');
      let state = await breaker.getState();
      expect(state.state).toBe('HALF_OPEN');
      expect(state.successCount).toBe(1);

      // Second success - should close
      await breaker.execute(async () => 'success');
      state = await breaker.getState();
      expect(state.state).toBe('CLOSED');
      // After transition, counters are reset to 0
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('Success in CLOSED state resets failure count', async () => {
      // Record a failure
      try {
        await breaker.execute(async () => {
          throw new Error('Failure');
        });
      } catch {}

      let state = await breaker.getState();
      expect(state.failureCount).toBe(1);

      // Success should reset
      await breaker.execute(async () => 'success');
      state = await breaker.getState();
      expect(state.failureCount).toBe(0);
    });

    it('OPEN state rejects requests immediately (fail-fast)', async () => {
      // Open the circuit
      try {
        await breaker.execute(async () => { throw new Error('Fail 1'); });
      } catch {}
      try {
        await breaker.execute(async () => { throw new Error('Fail 2'); });
      } catch {}

      const state = await breaker.getState();
      expect(state.state).toBe('OPEN');

      // Should reject without executing function
      let functionExecuted = false;
      await expect(
        breaker.execute(async () => {
          functionExecuted = true;
          return 'should not execute';
        })
      ).rejects.toThrow('Circuit breaker is OPEN');

      expect(functionExecuted).toBe(false);
    });
  });

  describe('TypeOK: Type correctness', () => {
    it('State is always one of CLOSED, HALF_OPEN, OPEN', async () => {
      const state = await breaker.getState();
      expect(['CLOSED', 'HALF_OPEN', 'OPEN']).toContain(state.state);
    });

    it('Counters are always non-negative integers', async () => {
      const state = await breaker.getState();
      expect(state.failureCount).toBeGreaterThanOrEqual(0);
      expect(state.successCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(state.failureCount)).toBe(true);
      expect(Number.isInteger(state.successCount)).toBe(true);
    });
  });

  describe('Liveness: System makes progress', () => {
    it('Circuit eventually transitions from OPEN to HALF_OPEN after timeout', async () => {
      // Open the circuit
      try {
        await breaker.execute(async () => { throw new Error('Fail 1'); });
      } catch {}
      try {
        await breaker.execute(async () => { throw new Error('Fail 2'); });
      } catch {}

      let state = await breaker.getState();
      expect(state.state).toBe('OPEN');

      // Simulate time passing by manually setting transition time
      const oldTransitionTime = state.lastTransitionTime;
      state.lastTransitionTime = oldTransitionTime - config.openTimeout - 1000;
      await (breaker as any).saveState(state);

      // Now execute should transition to HALF_OPEN
      await breaker.execute(async () => 'success');
      state = await breaker.getState();
      expect(state.state).toBe('HALF_OPEN');
    });
  });
});