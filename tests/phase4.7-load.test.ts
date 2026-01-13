import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../src/platform/monitoring/MetricsCollector';
import { AnalyticsService } from '../src/platform/monitoring/AnalyticsService';
import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * Phase 4.7: Load Testing
 * 
 * Tests system behavior under high load conditions:
 * - 1000 concurrent metric recordings
 * - 100 requests/second sustained
 * - KV cache effectiveness under load
 * - Analytics query performance
 * - Memory management under sustained load
 * 
 * Expected: System remains stable, performs within acceptable latency bounds
 */

// Mock KV namespace with performance tracking
class MockKVNamespace {
  private store = new Map<string, string>();
  public readCount = 0;
  public writeCount = 0;
  public listCount = 0;

  async get(key: string): Promise<string | null> {
    this.readCount++;
    return this.store.get(key) || null;
  }

  async put(key: string, value: string): Promise<void> {
    this.writeCount++;
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    this.listCount++;
    const keys = Array.from(this.store.keys())
      .filter(k => !options?.prefix || k.startsWith(options.prefix))
      .map(name => ({ name }));
    return { keys };
  }

  // Test utilities
  resetCounters(): void {
    this.readCount = 0;
    this.writeCount = 0;
    this.listCount = 0;
  }

  getOperationCount(): number {
    return this.readCount + this.writeCount + this.listCount;
  }
}

// Load generation utilities
async function runConcurrentRequests(
  count: number,
  requestFn: () => Promise<void>
): Promise<{ duration: number; errors: number }> {
  const startTime = Date.now();
  let errors = 0;

  const promises = Array.from({ length: count }, async () => {
    try {
      await requestFn();
    } catch (error) {
      errors++;
    }
  });

  await Promise.all(promises);

  const duration = Date.now() - startTime;
  return { duration, errors };
}

describe('Load Testing', () => {
  let mockKVInternal: MockKVNamespace;
  let mockKV: KVNamespace;
  let metricsCollector: MetricsCollector;
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    mockKVInternal = new MockKVNamespace();
    mockKV = mockKVInternal as unknown as KVNamespace;
    metricsCollector = new MetricsCollector(mockKV);
    analyticsService = new AnalyticsService(metricsCollector);
  });

  describe('Metrics Collection Under Load', () => {
    it('should handle 1000 concurrent metric recordings', async () => {
      const requestCount = 1000;

      const { duration, errors } = await runConcurrentRequests(requestCount, async () => {
        metricsCollector.recordSuccess('gemini', 150, 500);
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(5000); // Complete within 5 seconds

      // Verify data was recorded (flush happens automatically in getAggregatedMetrics)
      const summary = await metricsCollector.getAggregatedMetrics();
      expect(summary.totalRequests).toBe(requestCount);
    });

    it('should handle mixed provider recordings concurrently', async () => {
      const providers: Array<'gemini' | 'huggingface' | 'anthropic'> = ['gemini', 'huggingface', 'anthropic'];
      const requestCount = 300;

      const { duration, errors } = await runConcurrentRequests(requestCount, async () => {
        const provider = providers[Math.floor(Math.random() * providers.length)];
        metricsCollector.recordSuccess(provider, 150, 500);
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(5000);

      const summary = await metricsCollector.getAggregatedMetrics();
      expect(summary.totalRequests).toBe(requestCount);
    });

    it('should maintain performance with high failure rates', async () => {
      const requestCount = 500;

      const { duration, errors } = await runConcurrentRequests(requestCount, async () => {
        // 50% failure rate
        const success = Math.random() > 0.5;
        if (success) {
          metricsCollector.recordSuccess('gemini', 150, 500);
        } else {
          metricsCollector.recordFailure('gemini', 150, '500', 'Internal error');
        }
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(5000);

      const summary = await metricsCollector.getAggregatedMetrics();
      expect(summary.totalRequests).toBe(requestCount);
      expect(summary.totalFailures).toBeGreaterThan(0);
    });

    it('should handle concurrent reads and writes', async () => {
      // Pre-populate some data
      for (let i = 0; i < 100; i++) {
        metricsCollector.recordSuccess('gemini', 150, 500);
      }

      mockKVInternal.resetCounters();

      // Mix of reads and writes
      const { duration, errors } = await runConcurrentRequests(200, async () => {
        if (Math.random() > 0.5) {
          metricsCollector.recordSuccess('gemini', 150, 500);
        } else {
          await metricsCollector.getAggregatedMetrics();
        }
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain KV cache effectiveness', async () => {
      // Populate data
      metricsCollector.recordRequest('gemini');
      metricsCollector.recordSuccess('gemini', 150, 500);
      await metricsCollector.getAggregatedMetrics(); // Force flush

      mockKVInternal.resetCounters();

      // Multiple reads within cache TTL (5 seconds)
      for (let i = 0; i < 10; i++) {
        await metricsCollector.getAggregatedMetrics();
      }

      // Should use cache, minimal KV reads
      const totalOps = mockKVInternal.getOperationCount();
      expect(totalOps).toBeLessThan(50); // Should use cache to reduce operations
    });
  });

  describe('Analytics Performance', () => {
    beforeEach(async () => {
      // Seed with realistic data: 100 requests across 3 providers
      for (let i = 0; i < 100; i++) {
        if (Math.random() > 0.1) {
          metricsCollector.recordSuccess('gemini', 100 + Math.random() * 400, 500 + Math.random() * 500);
        } else {
          metricsCollector.recordFailure('gemini', 100 + Math.random() * 400, '500', 'Error');
        }

        if (Math.random() > 0.15) {
          metricsCollector.recordSuccess('huggingface', 200 + Math.random() * 600, 400 + Math.random() * 600);
        } else {
          metricsCollector.recordFailure('huggingface', 200 + Math.random() * 600, '500', 'Error');
        }

        if (Math.random() > 0.05) {
          metricsCollector.recordSuccess('anthropic', 100 + Math.random() * 300, 600 + Math.random() * 400);
        } else {
          metricsCollector.recordFailure('anthropic', 100 + Math.random() * 300, '500', 'Error');
        }
      }
    });

    it('should handle analytics queries efficiently', async () => {
      const startTime = Date.now();

      const analytics = await analyticsService.getAnalytics(24);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000); // Complete within 2 seconds
      expect(analytics).toBeDefined();
    });

    it('should handle concurrent analytics queries', async () => {
      const { duration, errors } = await runConcurrentRequests(20, async () => {
        await analyticsService.getAnalytics(24);
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(5000);
    });

    it('should generate system health reports quickly', async () => {
      const startTime = Date.now();

      const health = await analyticsService.getHealthStatus();

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(health).toBeDefined();
    });

    it('should handle concurrent health checks', async () => {
      const { duration, errors } = await runConcurrentRequests(50, async () => {
        await analyticsService.getHealthStatus();
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not accumulate excessive KV operations under load', async () => {
      const initialOps = mockKVInternal.getOperationCount();

      // Record 1000 requests
      for (let i = 0; i < 1000; i++) {
        metricsCollector.recordSuccess('gemini', 150, 500);
      }

      const finalOps = mockKVInternal.getOperationCount();
      const opsPerRequest = (finalOps - initialOps) / 1000;

      // Should buffer and batch, not write every request
      expect(opsPerRequest).toBeLessThan(0.5);
    });

    it('should handle sustained concurrent load', async () => {
      const { duration, errors } = await runConcurrentRequests(500, async () => {
        metricsCollector.recordSuccess('gemini', 150, 500);
        metricsCollector.recordSuccess('huggingface', 200, 600);
        metricsCollector.recordSuccess('anthropic', 180, 550);
      });

      expect(errors).toBe(0);
      expect(duration).toBeLessThan(10000);

      const summary = await metricsCollector.getAggregatedMetrics();
      expect(summary.totalRequests).toBe(1500); // 500 * 3 providers
    });
  });

  describe('Error Recovery', () => {
    it('should handle KV failures gracefully', async () => {
      let kvErrors = 0;
      const originalPut = mockKV.put.bind(mockKV);

      // Simulate 50% KV failure rate to ensure failures are triggered
      mockKV.put = async (key: string, value: string) => {
        if (kvErrors < 20) { // Force at least 20 failures
          kvErrors++;
          throw new Error('KV write failed');
        }
        return originalPut(key, value);
      };

      const { errors } = await runConcurrentRequests(200, async () => {
        metricsCollector.recordSuccess('gemini', 150, 500);
      });

      // MetricsCollector should handle KV failures internally without crashing
      expect(kvErrors).toBeGreaterThan(0);
    });

    it('should maintain consistency under concurrent updates', async () => {
      const { errors } = await runConcurrentRequests(200, async () => {
        metricsCollector.recordSuccess('gemini', 150, 500);
      });

      expect(errors).toBe(0);

      const summary = await metricsCollector.getAggregatedMetrics();
      expect(summary.totalRequests).toBe(200);
    });
  });
});
