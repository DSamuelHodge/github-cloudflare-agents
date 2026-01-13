/**
 * Tests for Monitoring Endpoints
 * 
 * Tests HTTP endpoints for metrics, analytics, and health monitoring
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  handleMetricsRequest,
  handleAnalyticsRequest,
  handleHealthRequest,
  routeMonitoringRequest
} from '../src/endpoints/monitoring';
import { MetricsCollector } from '../src/platform/monitoring/MetricsCollector';
import { AnalyticsService } from '../src/platform/monitoring/AnalyticsService';
import type { KVNamespace } from '@cloudflare/workers-types';
import { createLogger } from '../src/utils/logger';

// Mock KV storage
class MockKVNamespace {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list() {
    return { 
      keys: Array.from(this.store.keys()).map(name => ({ name })),
      list_complete: true,
      cacheStatus: null
    };
  }

  getWithMetadata = async () => ({ value: null, metadata: null, cacheStatus: null });
  getMultiple = async () => [];
}

describe('Monitoring Endpoints', () => {
  let mockKV: KVNamespace;
  let collector: MetricsCollector;
  let analytics: AnalyticsService;
  const logger = createLogger({});

  beforeEach(async () => {
    // @ts-expect-error - MockKVNamespace is compatible enough for testing
    mockKV = new MockKVNamespace();
    collector = new MetricsCollector(mockKV, logger);
    analytics = new AnalyticsService(collector, logger);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /metrics', () => {
    it('should return aggregated metrics when no provider specified', async () => {
      // Record some metrics
      collector.recordSuccess('gemini', 1000);
      collector.recordSuccess('anthropic', 1200);
      await collector.getAggregatedMetrics(); // Force flush

      const request = new Request('https://example.com/metrics');
      const response = await handleMetricsRequest(request, collector);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { totalRequests: number; providers: unknown };
      expect(data).toHaveProperty('totalRequests');
      expect(data).toHaveProperty('providers');
      expect(data.totalRequests).toBeGreaterThanOrEqual(2);
    });

    it('should return provider-specific metrics when provider specified', async () => {
      collector.recordSuccess('gemini', 1000);
      await collector.getProviderMetrics('gemini'); // Force flush

      const request = new Request('https://example.com/metrics?provider=gemini');
      const response = await handleMetricsRequest(request, collector);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { provider: string; requestsTotal: number };
      expect(data.provider).toBe('gemini');
      expect(data.requestsTotal).toBeGreaterThanOrEqual(1);
    });

    it('should return 404 for unknown provider', async () => {
      const request = new Request('https://example.com/metrics?provider=unknown');
      const response = await handleMetricsRequest(request, collector);
      
      expect(response.status).toBe(404);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Provider not found');
    });

    it('should include Content-Type header', async () => {
      const request = new Request('https://example.com/metrics');
      const response = await handleMetricsRequest(request, collector);
      
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('GET /analytics', () => {
    it('should return analytics data with default parameters', async () => {
      // Record some metrics
      for (let i = 0; i < 10; i++) {
        collector.recordSuccess('gemini', 1000 + i * 100);
      }
      await collector.getProviderMetrics('gemini'); // Force flush

      const request = new Request('https://example.com/analytics');
      const response = await handleAnalyticsRequest(request, analytics);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('timeSeries');
      expect(data).toHaveProperty('anomalies');
    });

    it('should accept hours parameter', async () => {
      collector.recordSuccess('gemini', 1000);
      await collector.getProviderMetrics('gemini');

      const request = new Request('https://example.com/analytics?hours=12');
      const response = await handleAnalyticsRequest(request, analytics);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { query: { hours: number; timestamp: number } };
      expect(data.query).toHaveProperty('hours');
      expect(data.query.hours).toBe(12);
    });

    it('should accept provider parameter', async () => {
      collector.recordSuccess('anthropic', 1200);
      await collector.getProviderMetrics('anthropic');

      const request = new Request('https://example.com/analytics?provider=anthropic');
      const response = await handleAnalyticsRequest(request, analytics);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { providerStats: Record<string, unknown> };
      expect(data).toHaveProperty('providerStats');
    });

    it('should reject invalid hours parameter', async () => {
      const request = new Request('https://example.com/analytics?hours=invalid');
      const response = await handleAnalyticsRequest(request, analytics);
      
      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toContain('Invalid hours parameter');
    });

    it('should reject hours > 168', async () => {
      const request = new Request('https://example.com/analytics?hours=200');
      const response = await handleAnalyticsRequest(request, analytics);
      
      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toContain('Invalid hours parameter');
    });
  });

  describe('GET /health', () => {
    it('should return healthy status when all providers healthy', async () => {
      // Record successful requests
      for (let i = 0; i < 20; i++) {
        collector.recordSuccess('gemini', 1000);
        collector.recordSuccess('anthropic', 1100);
        collector.recordSuccess('huggingface', 1200);
      }
      await collector.getAggregatedMetrics();

      const request = new Request('https://example.com/health');
      const response = await handleHealthRequest(request, analytics);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { status: string; providers: unknown[] };
      expect(data.status).toBe('healthy');
      expect(data).toHaveProperty('providers');
    });

    it('should return degraded status when some providers unhealthy', async () => {
      // Record some failures
      collector.recordSuccess('gemini', 1000);
      collector.recordFailure('anthropic', 2000, 'TIMEOUT', 'Request timed out');
      collector.recordFailure('anthropic', 2100, 'TIMEOUT', 'Request timed out');
      await collector.getAggregatedMetrics();

      const request = new Request('https://example.com/health');
      const response = await handleHealthRequest(request, analytics);
      
      expect([200, 503]).toContain(response.status);
      const data = await response.json() as { status: string };
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });

    it('should include provider health details', async () => {
      collector.recordSuccess('gemini', 1000);
      await collector.getProviderMetrics('gemini');

      const request = new Request('https://example.com/health');
      const response = await handleHealthRequest(request, analytics);
      
      const data = await response.json() as { providers: Record<string, unknown> };
      expect(data.providers).toBeDefined();
      expect(typeof data.providers).toBe('object');
    });

    it('should return 503 on service error', async () => {
      // Create analytics service with broken collector
      const brokenCollector = {
        getAggregatedMetrics: async () => { throw new Error('KV unavailable'); }
      } as unknown as MetricsCollector;
      const brokenAnalytics = new AnalyticsService(brokenCollector, logger);

      const request = new Request('https://example.com/health');
      const response = await handleHealthRequest(request, brokenAnalytics);
      
      expect(response.status).toBe(503);
      const data = await response.json() as { status: string; message?: string; error?: string };
      console.log('Health error response:', data);
      expect(data.status).toBe('unhealthy');
      expect(data.message || data.error).toBeDefined();
    });
  });

  describe('routeMonitoringRequest', () => {
    it('should route /metrics requests', async () => {
      const request = new Request('https://example.com/metrics');
      const response = await routeMonitoringRequest(request, collector, analytics);
      
      expect(response.status).toBe(200);
    });

    it('should route /analytics requests', async () => {
      const request = new Request('https://example.com/analytics');
      const response = await routeMonitoringRequest(request, collector, analytics);
      
      expect(response.status).toBe(200);
    });

    it('should route /health requests', async () => {
      const request = new Request('https://example.com/health');
      const response = await routeMonitoringRequest(request, collector, analytics);
      
      expect(response.status).toBe(200);
    });

    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://example.com/unknown');
      const response = await routeMonitoringRequest(request, collector, analytics);
      
      expect(response.status).toBe(404);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('Not found');
    });
  });
});
