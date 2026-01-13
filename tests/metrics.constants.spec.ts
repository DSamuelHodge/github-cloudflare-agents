import { describe, it, expect } from 'vitest';
import { METRIC_AGENT_SANDBOX_INVOCATIONS, METRIC_AGENT_SANDBOX_FAILURES, METRIC_AGENT_SANDBOX_LATENCY_MS } from '../src/platform/metrics/constants';

describe('metrics constants', () => {
  it('exports expected metric names', () => {
    expect(METRIC_AGENT_SANDBOX_INVOCATIONS).toBe('agent_sandbox.invocations');
    expect(METRIC_AGENT_SANDBOX_FAILURES).toBe('agent_sandbox.failures');
    expect(METRIC_AGENT_SANDBOX_LATENCY_MS).toBe('agent_sandbox.latency_ms');
  });
});
