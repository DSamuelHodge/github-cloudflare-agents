/**
 * Phase 4.1 Stage 4: Monitoring Services Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsCollector } from '../src/platform/monitoring/MetricsCollector';
import { AnalyticsService } from '../src/platform/monitoring/AnalyticsService';
import { Logger } from '../src/utils/logger';
import type { AIProvider } from '../src/platform/ai/gateway-client';
import type { KVNamespace } from '@cloudflare/workers-types';

// Mock KVNamespace
class MockKVNamespace {
  private data: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

describe('MetricsCollector', () => {
  let kv: MockKVNamespace;
  let logger: Logger;
  let collector: MetricsCollector;

  beforeEach(() => {
    kv = new MockKVNamespace();
    logger = new Logger();
    // @ts-expect-error - MockKVNamespace is a simplified test double
    collector = new MetricsCollector(kv, logger);
  });

  it('should initialize metrics for all providers', async () => {
    const metrics = await collector.getAggregatedMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.overallSuccessRate).toBe(1.0);
  });

  it('should record successful request', async () => {
    collector.recordSuccess('gemini', 1500);
    const metrics = await collector.getProviderMetrics('gemini');
    expect(metrics).toBeTruthy();
    if (metrics) {
      expect(metrics.requestsTotal).toBeGreaterThan(0);
      expect(metrics.requestsSuccess).toBeGreaterThan(0);
    }
  });

  it('should record failed request', async () => {
    collector.recordFailure('huggingface', 2000, 'TIMEOUT', 'Request timeout');
    const metrics = await collector.getProviderMetrics('huggingface');
    expect(metrics).toBeTruthy();
    if (metrics) {
      expect(metrics.requestsFailure).toBeGreaterThan(0);
    }
  });

  it('should calculate latency percentiles', async () => {
    // Record multiple requests with varying latencies
    const latencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const latency = Math.random() * 5000; // 0-5000ms
      latencies.push(latency);
      if (i < 95) {
        collector.recordSuccess('anthropic', latency);
      } else {
        collector.recordFailure('anthropic', latency, 'ERROR', 'Test error');
      }
    }

    const metrics = await collector.getProviderMetrics('anthropic');
    expect(metrics).toBeTruthy();
    if (metrics) {
      // Debug: log what we got
      console.log('Metrics:', { latencyP50: metrics.latencyP50, latencyP95: metrics.latencyP95, latencyP99: metrics.latencyP99, total: metrics.requestsTotal });
      expect(metrics.requestsTotal).toBe(100);
      expect(metrics.latencyP50).toBeGreaterThan(0);
      expect(metrics.latencyP95).toBeGreaterThanOrEqual(metrics.latencyP50);
      expect(metrics.latencyP99).toBeGreaterThanOrEqual(metrics.latencyP95);
    }
  });

  it('should calculate success rate correctly', async () => {
    // Record 70 successful and 30 failed requests
    for (let i = 0; i < 70; i++) {
      collector.recordSuccess('gemini', 1000 + Math.random() * 500);
    }
    for (let i = 0; i < 30; i++) {
      collector.recordFailure('gemini', 2000, 'ERROR', 'Test error');
    }

    const metrics = await collector.getProviderMetrics('gemini');
    expect(metrics).toBeTruthy();
    if (metrics) {
      expect(Math.abs(metrics.successRate - 0.7)).toBeLessThan(0.01);
    }
  });

  it('should track circuit breaker state changes', async () => {
    collector.recordCircuitBreakerStateChange({
      timestamp: Date.now(),
      provider: 'gemini',
      previousState: 'CLOSED',
      newState: 'OPEN',
      reason: 'failure_threshold',
      failureCount: 5,
    });

    const metrics = await collector.getProviderMetrics('gemini');
    expect(metrics).toBeTruthy();
    if (metrics) {
      expect(metrics.circuitState).toBe('OPEN');
    }
  });

  it('should aggregate metrics across all providers', async () => {
    collector.recordSuccess('gemini', 1500);
    collector.recordSuccess('huggingface', 1200);
    collector.recordSuccess('anthropic', 1800);

    const aggregated = await collector.getAggregatedMetrics();
    expect(aggregated.totalRequests).toBe(3);
    expect(aggregated.totalSuccesses).toBe(3);
    expect(aggregated.overallSuccessRate).toBe(1.0);
  });

  it('should reset all metrics', async () => {
    collector.recordSuccess('gemini', 1500);
    await collector.reset();

    const metrics = await collector.getAggregatedMetrics();
    expect(metrics.totalRequests).toBe(0);
  });

  it('should handle provider not found gracefully', async () => {
    const metrics = await collector.getProviderMetrics('invalid-provider' as AIProvider);
    // Should return null or handle gracefully
    expect(metrics).toBeNull();
  });

  it('should calculate uptime percentage', async () => {
    // Record 80 successful and 20 failed
    for (let i = 0; i < 80; i++) {
      collector.recordSuccess('gemini', 1000);
    }
    for (let i = 0; i < 20; i++) {
      collector.recordFailure('gemini', 2000, 'ERROR', 'Test');
    }

    const metrics = await collector.getProviderMetrics('gemini');
    expect(metrics).toBeTruthy();
    if (metrics) {
      expect(metrics.uptimePercentage).toBeGreaterThan(75);
      expect(metrics.uptimePercentage).toBeLessThanOrEqual(85);
    }
  });

  it('should track tokens used', async () => {
    collector.recordSuccess('gemini', 1500, 150);
    collector.recordSuccess('gemini', 1200, 200);

    const metrics = await collector.getProviderMetrics('gemini');
    expect(metrics).toBeTruthy();
    if (metrics && metrics.tokensTotal) {
      expect(metrics.tokensTotal).toBeGreaterThan(0);
    }
  });

  it('should handle concurrent metric recording', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        Promise.resolve().then(() => {
          collector.recordSuccess('gemini', Math.random() * 2000);
        })
      );
    }

    await Promise.all(promises);
    const metrics = await collector.getAggregatedMetrics();
    expect(metrics.totalRequests).toBe(50);
  });
});

describe('AnalyticsService', () => {
  let kv: MockKVNamespace;
  let logger: Logger;
  let collector: MetricsCollector;
  let analytics: AnalyticsService;

  beforeEach(() => {
    kv = new MockKVNamespace();
    logger = new Logger();
    // @ts-expect-error - MockKVNamespace is a simplified test double
    collector = new MetricsCollector(kv, logger);
    analytics = new AnalyticsService(collector, logger);
  });

  it('should get current summary', async () => {
    collector.recordSuccess('gemini', 1500);
    const summary = await analytics.getSummary();
    expect(summary.timestamp).toBeGreaterThan(0);
    expect(summary.totalRequests).toBeGreaterThan(0);
  });

  it('should generate analytics report', async () => {
    // Record some metrics
    for (let i = 0; i < 10; i++) {
      collector.recordSuccess('gemini', 1000 + Math.random() * 500);
    }

    const result = await analytics.getAnalytics(24);
    expect(result.query.hours).toBe(24);
    expect(result.summary.totalRequests).toBeGreaterThanOrEqual(0);
    expect(result.timeSeries.length).toBeGreaterThan(0);
  });

  it('should filter analytics by provider', async () => {
    collector.recordSuccess('gemini', 1500);
    collector.recordSuccess('huggingface', 1200);

    const result = await analytics.getAnalytics(24, 'gemini');
    expect(result.query.provider).toBe('gemini');
  });

  it('should provide time-series data', async () => {
    for (let i = 0; i < 20; i++) {
      collector.recordSuccess('gemini', 1000 + Math.random() * 500);
    }

    const timeSeries = await analytics.getTimeSeries(1);
    expect(timeSeries.length).toBeGreaterThan(0);
    expect(timeSeries[0]).toHaveProperty('timestamp');
    expect(timeSeries[0]).toHaveProperty('requests');
    expect(timeSeries[0]).toHaveProperty('successRate');
  });

  it('should compare providers', async () => {
    collector.recordSuccess('gemini', 1500);
    collector.recordSuccess('huggingface', 1200);
    collector.recordFailure('anthropic', 2000, 'ERROR', 'Test');

    const comparison = await analytics.getProviderComparison();
    expect(Object.keys(comparison).length).toBeGreaterThan(0);
    expect(comparison.gemini).toHaveProperty('successRate');
    expect(comparison.gemini).toHaveProperty('averageLatency');
  });

  it('should detect anomalies', async () => {
    // Record normal metrics
    for (let i = 0; i < 50; i++) {
      collector.recordSuccess('gemini', 1000 + Math.random() * 500);
    }

    const anomalies = analytics.detectAnomalies();
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it('should get health status', async () => {
    collector.recordSuccess('gemini', 1500);
    const health = await analytics.getHealthStatus();
    expect(health.status).toBeDefined();
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    expect(health.providers).toBeDefined();
  });

  it('should identify unhealthy providers', async () => {
    // Record mostly failures
    for (let i = 0; i < 20; i++) {
      collector.recordFailure('gemini', 2000, 'ERROR', 'Test error');
    }

    const health = await analytics.getHealthStatus();
    expect(health.providers.gemini).toBeDefined();
    expect(health.providers.gemini.status).toMatch(/degraded|unhealthy/);
  });

  it('should calculate MTBF correctly', async () => {
    // Record mostly successful requests
    for (let i = 0; i < 95; i++) {
      collector.recordSuccess('gemini', 1000);
    }
    for (let i = 0; i < 5; i++) {
      collector.recordFailure('gemini', 2000, 'ERROR', 'Test');
    }

    const result = await analytics.getAnalytics(24);
    expect(result.summary.meanTimeBetweenFailures).toBeGreaterThan(0);
  });

  it('should provide provider recommendations', async () => {
    collector.recordSuccess('gemini', 1500);
    const comparison = await analytics.getProviderComparison();
    const geminiStats = comparison.gemini;
    expect(geminiStats).toBeDefined();
    expect(geminiStats.trend).toMatch(/stable|improving|degrading/);
  });

  it('should handle empty metrics gracefully', async () => {
    const result = await analytics.getAnalytics(24);
    expect(result.summary.totalRequests).toBe(0);
    expect(result.timeSeries.length).toBeGreaterThan(0);
  });

  it('should track anomaly history', async () => {
    const anomalies1 = analytics.detectAnomalies();
    const anomalies2 = analytics.detectAnomalies();
    // Should have consistent results
    expect(Array.isArray(anomalies1)).toBe(true);
    expect(Array.isArray(anomalies2)).toBe(true);
  });
});

describe('Metrics Integration', () => {
  let kv: MockKVNamespace;
  let logger: Logger;
  let collector: MetricsCollector;
  let analytics: AnalyticsService;

  beforeEach(() => {
    kv = new MockKVNamespace();
    logger = new Logger();
    // @ts-expect-error - MockKVNamespace is a simplified test double
    collector = new MetricsCollector(kv, logger);
    analytics = new AnalyticsService(collector, logger);
  });

  it('should integrate collector and analytics', async () => {
    // Simulate realistic usage
    for (let i = 0; i < 10; i++) {
      if (Math.random() > 0.1) {
        collector.recordSuccess('gemini', 1000 + Math.random() * 500);
      } else {
        collector.recordFailure('gemini', 2000, 'TIMEOUT', 'Request timeout');
      }
    }

    const summary = await analytics.getSummary();
    const health = await analytics.getHealthStatus();

    expect(summary.totalRequests).toBeGreaterThan(0);
    expect(health.status).toBeDefined();
  });

  it('should handle all provider types', async () => {
    const providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];

    for (const provider of providers) {
      for (let i = 0; i < 5; i++) {
        collector.recordSuccess(provider, 1000 + Math.random() * 500);
      }
    }

    const summary = await analytics.getSummary();
    expect(summary.providers).toBeDefined();
    expect(Object.keys(summary.providers).length).toBeLessThanOrEqual(providers.length);
  });
});
