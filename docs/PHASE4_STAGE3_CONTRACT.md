# Phase 4.1 Stage 3: Fallback Strategy - Execution Contract

## Contract Metadata

**Stage**: Phase 4.1 Stage 3 - Fallback Strategy with Circuit Breaker  
**Contract Date**: January 12, 2026  
**Estimated Duration**: 2-3 days (8-12 hours)  
**Prerequisites**: ✅ Stage 2 complete (gateway client adapter)  
**Dependencies**: KV namespace (from Phase 1.5), Gateway client (Stage 2)

---

## Objective

Implement a **resilient fallback strategy** that automatically fails over between AI providers when one becomes unavailable, using a circuit breaker pattern to prevent cascading failures.

### Success Criteria
1. ✅ FallbackAIClient wraps GatewayAIClient
2. ✅ Circuit breaker prevents repeated failures
3. ✅ Provider chain: Gemini → HuggingFace → Anthropic
4. ✅ Automatic failover on errors
5. ✅ KV-backed circuit breaker state persistence
6. ✅ Failover metrics and logging
7. ✅ All tests passing (206 + new tests)
8. ✅ Zero `any` types (100% type safety)

---

## Architecture

### Fallback Flow

```
┌─────────────────────────┐
│   Application Code      │
│  (OpenAI Interface)     │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   FallbackAIClient      │
│  - Circuit breaker      │
│  - Provider chain       │
│  - Automatic failover   │
└──────────┬──────────────┘
           │
           ├─ Primary (Gemini) ───────┐
           │                          │
           ├─ Fallback 1 (HuggingFace)│
           │                          │
           └─ Fallback 2 (Anthropic) ─┘
                      │
                      ▼
           ┌─────────────────────┐
           │  GatewayAIClient    │
           │  (from Stage 2)     │
           └─────────────────────┘
```

### Circuit Breaker States

```
┌─────────┐
│ CLOSED  │ ◄──── Normal operation (requests flow through)
└────┬────┘
     │ Failure threshold exceeded
     ▼
┌─────────┐
│  OPEN   │ ◄──── Fail fast (skip provider)
└────┬────┘
     │ Timeout expires
     ▼
┌─────────────┐
│ HALF_OPEN  │ ◄──── Test recovery (try one request)
└─────┬───────┘
      │
      ├─ Success ────► CLOSED
      │
      └─ Failure ────► OPEN
```

---

## Implementation Plan

### 1. Circuit Breaker Core (2-3 hours)

**File**: `src/platform/ai/circuit-breaker.ts`

**Components**:
- `CircuitBreaker` class
- Circuit breaker states: `CLOSED`, `OPEN`, `HALF_OPEN`
- KV-backed state persistence
- Configurable thresholds and timeouts

**Interface**:
```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening (default: 3)
  successThreshold: number;    // Successes to close (default: 2)
  openTimeout: number;         // Time in OPEN state (default: 60000ms)
  halfOpenMaxCalls: number;    // Max calls in HALF_OPEN (default: 1)
}

class CircuitBreaker {
  constructor(
    private provider: AIProvider,
    private kv: KVNamespace,
    private config: CircuitBreakerConfig
  );

  async execute<T>(fn: () => Promise<T>): Promise<T>;
  async getState(): Promise<CircuitState>;
  private async recordSuccess(): Promise<void>;
  private async recordFailure(): Promise<void>;
  private async transition(newState: CircuitState): Promise<void>;
}
```

### 2. Fallback Client (3-4 hours)

**File**: `src/platform/ai/fallback-client.ts`

**Components**:
- `FallbackAIClient` class wrapping `GatewayAIClient`
- Provider chain configuration
- Automatic failover logic
- Metrics collection

**Interface**:
```typescript
interface FallbackAIClientConfig {
  providers: AIProvider[];           // Ordered provider chain
  accountId: string;
  gatewayId: string;
  apiToken: string;
  circuitBreakerConfig?: CircuitBreakerConfig;
  kv: KVNamespace;
}

class FallbackAIClient implements AIClient {
  private circuitBreakers: Map<AIProvider, CircuitBreaker>;
  private gatewayClients: Map<AIProvider, GatewayAIClient>;

  constructor(config: FallbackAIClientConfig);

  async chatCompletion(
    request: OpenAIChatCompletionRequest
  ): Promise<OpenAIChatCompletionResponse>;

  private async tryProvider(
    provider: AIProvider,
    request: OpenAIChatCompletionRequest
  ): Promise<OpenAIChatCompletionResponse>;

  private async getNextAvailableProvider(): Promise<AIProvider | null>;
}
```

### 3. Factory Function (30 minutes)

**File**: `src/platform/ai/fallback-client.ts`

```typescript
export function createFallbackClient(
  env: Env,
  providerChain?: AIProvider[]
): FallbackAIClient {
  const providers = providerChain || ['gemini', 'huggingface', 'anthropic'];
  
  return new FallbackAIClient({
    providers,
    accountId: env.CLOUDFLARE_ACCOUNT_ID!,
    gatewayId: env.CLOUDFLARE_GATEWAY_ID!,
    apiToken: env.CLOUDFLARE_API_TOKEN!,
    kv: env.DOC_EMBEDDINGS, // Reuse existing KV namespace
  });
}
```

### 4. Type Definitions (30 minutes)

**File**: `src/types/circuit-breaker.ts`

```typescript
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastTransitionTime: number;
}

export interface CircuitBreakerMetrics {
  provider: AIProvider;
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  circuitOpenCount: number;
}
```

**File**: `src/types/env.ts` (update)

```typescript
export interface Env {
  // ... existing fields ...
  
  // Phase 4.1 Stage 3: Fallback Strategy
  AI_FALLBACK_PROVIDERS?: string;  // Comma-separated provider chain
  CIRCUIT_BREAKER_FAILURE_THRESHOLD?: string;
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD?: string;
  CIRCUIT_BREAKER_OPEN_TIMEOUT?: string;
}
```

### 5. Comprehensive Testing (3-4 hours)

**File**: `tests/phase4.1-fallback.test.ts`

**Test Coverage**:

1. **Circuit Breaker Tests (8 tests)**
   - CLOSED → OPEN transition on failure threshold
   - OPEN → HALF_OPEN transition after timeout
   - HALF_OPEN → CLOSED on success
   - HALF_OPEN → OPEN on failure
   - State persistence to KV
   - State recovery from KV
   - Configurable thresholds
   - Reset circuit breaker

2. **Fallback Strategy Tests (7 tests)**
   - Primary provider success (Gemini)
   - Fallback to second provider (HuggingFace) on Gemini failure
   - Fallback to third provider (Anthropic) on HuggingFace failure
   - All providers unavailable (throw error)
   - Skip OPEN circuit breakers
   - Provider chain configuration
   - Concurrent requests with different provider states

3. **Integration Tests (5 tests)**
   - Factory function from environment variables
   - Multiple sequential requests with failover
   - Circuit breaker recovery after timeout
   - Metrics collection across requests
   - KV state consistency

**Total New Tests**: 20 tests (all must pass)

### 6. Documentation (1-2 hours)

**Files**:
- `docs/PHASE4_STAGE3_IMPLEMENTATION.md` - Complete implementation guide
- `docs/PHASE4_STAGE3_CERTIFICATE.md` - Completion certificate
- `docs/PHASE4_STAGE3_SUMMARY.md` - Executive summary
- `docs/PHASE4_STAGE3_QUICKREF.md` - Developer quick reference
- Update `README.md` with Stage 3 status

---

## Validation Criteria

### Functional Requirements
- [ ] Circuit breaker transitions correctly between states
- [ ] Automatic failover to next provider on errors
- [ ] Provider chain respects order (Gemini → HuggingFace → Anthropic)
- [ ] Circuit breaker state persists to KV
- [ ] Circuit breaker state recovers from KV
- [ ] Metrics track per-provider success/failure rates
- [ ] All providers exhausted throws appropriate error

### Non-Functional Requirements
- [ ] 0 TypeScript errors (`npm run type-check`)
- [ ] 0 ESLint errors (`npm run lint`)
- [ ] All 226+ tests passing (206 existing + 20 new)
- [ ] Zero `any` types (strict type safety)
- [ ] Backward compatible with Stage 2

### Performance Requirements
- [ ] Circuit breaker decision < 5ms (KV lookup)
- [ ] Failover overhead < 10ms per provider
- [ ] KV writes batched/async (don't block requests)

### Observability Requirements
- [ ] Structured logging for circuit breaker state changes
- [ ] Metrics for each provider (success rate, latency, circuit state)
- [ ] Error logging includes provider chain and fallback attempts

---

## Risk Assessment

### High Risk
1. **KV Latency**: Circuit breaker state lookups could add latency
   - **Mitigation**: In-memory cache with TTL, async KV writes

2. **Concurrent State Updates**: Multiple requests updating circuit breaker state
   - **Mitigation**: Atomic KV operations, optimistic locking

3. **All Providers Down**: No fallback available
   - **Mitigation**: Clear error message, retry logic at caller level

### Medium Risk
1. **Circuit Breaker Tuning**: Default thresholds may not fit all use cases
   - **Mitigation**: Configurable via environment variables

2. **Provider Cost**: Fallback may increase costs if primary fails frequently
   - **Mitigation**: Metrics tracking, alerting (Stage 6)

### Low Risk
1. **Breaking Changes**: Stage 3 wraps Stage 2, should be non-breaking
   - **Mitigation**: All existing tests must still pass

---

## Timeline

### Day 1 (4-5 hours)
- [x] Create Stage 3 execution contract
- [ ] Implement CircuitBreaker class (2-3 hours)
- [ ] Write circuit breaker tests (1-2 hours)

### Day 2 (4-5 hours)
- [ ] Implement FallbackAIClient class (3-4 hours)
- [ ] Write fallback strategy tests (1-2 hours)

### Day 3 (2-3 hours)
- [ ] Integration tests (1 hour)
- [ ] Documentation (1-2 hours)
- [ ] Final validation and commit

**Total Estimated Time**: 10-13 hours over 2-3 days

---

## Dependencies

### Stage 2 (Complete ✅)
- `src/platform/ai/gateway-client.ts` - Gateway client adapter
- `src/types/env.ts` - Environment variables
- `src/types/openai.ts` - OpenAI types

### Phase 1.5 (Complete ✅)
- `DOC_EMBEDDINGS` KV namespace - Circuit breaker state storage

### External Dependencies
- `@cloudflare/workers-types` - KVNamespace type
- `vitest` - Testing framework

---

## Constraints

### Must Have
- Circuit breaker pattern (industry standard)
- KV-backed state persistence (stateless Workers)
- Automatic failover (no manual intervention)
- Backward compatible (all 206 tests pass)
- Zero `any` types (strict type safety)

### Should Have
- Configurable thresholds via environment variables
- Metrics collection for observability
- In-memory cache for circuit breaker state (reduce KV reads)

### Could Have
- Circuit breaker dashboard (future Phase)
- Per-model circuit breakers (not just per-provider)
- Custom fallback strategies (beyond sequential)

### Won't Have (Out of Scope)
- Distributed circuit breaker (single-tenant Workers)
- Machine learning-based failover prediction
- Dynamic provider chain reordering

---

## Success Metrics

### Code Quality
- **Lines of Code**: 400-500 (circuit breaker + fallback client)
- **Test Coverage**: 20 new tests (100% pass rate)
- **Type Safety**: 0 `any` types
- **Documentation**: 4 new documents

### Functionality
- **Circuit Breaker States**: CLOSED, OPEN, HALF_OPEN (all working)
- **Failover Success Rate**: 100% when fallback provider available
- **State Persistence**: 100% (KV writes succeed)

### Performance
- **Circuit Breaker Overhead**: < 5ms per request
- **Failover Latency**: < 10ms per provider switch
- **KV Operations**: Batched/async (non-blocking)

---

## Approval

**Contract Approved By**: GitHub Copilot (Claude Sonnet 4.5)  
**Approval Date**: January 12, 2026  
**Status**: ✅ APPROVED - Ready to execute

---

## Next Steps

1. **Immediate**: Implement CircuitBreaker class
2. **Day 1**: Write circuit breaker tests
3. **Day 2**: Implement FallbackAIClient
4. **Day 3**: Complete testing and documentation

**Let's proceed with Stage 3 implementation!**
