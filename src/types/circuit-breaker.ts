/**
 * Phase 4.1 Stage 3: Circuit Breaker Type Definitions
 * 
 * Types for implementing circuit breaker pattern with KV-backed state persistence.
 */

import type { AIProvider } from '../platform/ai/gateway-client';

/**
 * Circuit breaker states following standard pattern
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker state stored in KV
 */
export interface CircuitBreakerState {
  /** Current state of the circuit breaker */
  state: CircuitState;
  
  /** Number of consecutive failures */
  failureCount: number;
  
  /** Number of consecutive successes (in HALF_OPEN state) */
  successCount: number;
  
  /** Timestamp of last failure (milliseconds since epoch) */
  lastFailureTime?: number;
  
  /** Timestamp of last state transition (milliseconds since epoch) */
  lastTransitionTime: number;
}

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 3) */
  failureThreshold: number;
  
  /** Number of consecutive successes to close circuit from HALF_OPEN (default: 2) */
  successThreshold: number;
  
  /** Time in milliseconds to stay in OPEN state before transitioning to HALF_OPEN (default: 60000) */
  openTimeout: number;
  
  /** Maximum number of concurrent calls allowed in HALF_OPEN state (default: 1) */
  halfOpenMaxCalls: number;
}

/**
 * Metrics collected for a circuit breaker
 */
export interface CircuitBreakerMetrics {
  /** Provider this circuit breaker protects */
  provider: AIProvider;
  
  /** Current circuit state */
  state: CircuitState;
  
  /** Total number of requests attempted */
  totalRequests: number;
  
  /** Number of successful requests */
  successfulRequests: number;
  
  /** Number of failed requests */
  failedRequests: number;
  
  /** Number of times circuit has opened */
  circuitOpenCount: number;
  
  /** Current failure streak */
  currentFailureStreak: number;
  
  /** Current success streak (in HALF_OPEN state) */
  currentSuccessStreak: number;
  
  /** Timestamp of last state change */
  lastStateChangeTime?: number;
}

/**
 * Result of attempting to execute through circuit breaker
 */
export interface CircuitBreakerResult<T> {
  /** Whether the execution was successful */
  success: boolean;
  
  /** Result data if successful */
  data?: T;
  
  /** Error if failed */
  error?: Error;
  
  /** Circuit state before execution */
  stateBefore: CircuitState;
  
  /** Circuit state after execution */
  stateAfter: CircuitState;
  
  /** Whether circuit breaker allowed the request */
  allowed: boolean;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  openTimeout: 60000, // 1 minute
  halfOpenMaxCalls: 1,
};
