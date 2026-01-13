/**
 * Phase 4.6 - Archival Service Tests
 * 
 * Tests for long-term metrics storage in R2.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ArchivalService } from '../src/platform/monitoring/ArchivalService';
import { MetricsCollector } from '../src/platform/monitoring/MetricsCollector';
import type { AIProvider } from '../src/platform/ai/gateway-client';
import type { AggregatedProviderMetrics, MetricsSummary } from '../src/types/monitoring';

// Mock KV namespace
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

// Mock R2 bucket
class MockR2Bucket {
  private data: Map<string, { content: string; metadata: Record<string, string>; size: number }> = new Map();

  async get(key: string): Promise<{ text: () => Promise<string> } | null> {
    const entry = this.data.get(key);
    if (!entry) return null;

    return {
      text: async () => entry.content,
    };
  }

  async put(
    key: string,
    value: string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<void> {
    this.data.set(key, {
      content: value,
      metadata: options?.customMetadata || {},
      size: value.length,
    });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{
    objects: Array<{ key: string; size: number }>;
  }> {
    const keys = Array.from(this.data.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix))
      .map(key => ({
        key,
        size: this.data.get(key)!.size,
      }));
    return { objects: keys };
  }

  clear(): void {
    this.data.clear();
  }
}

describe('ArchivalService', () => {
  let archivalService: ArchivalService;
  let metricsCollector: MetricsCollector;
  let mockKV: MockKVNamespace;
  let mockR2: MockR2Bucket;

  beforeEach(() => {
    mockKV = new MockKVNamespace();
    mockR2 = new MockR2Bucket();
    
    // @ts-expect-error - MockKVNamespace is a simplified test double
    metricsCollector = new MetricsCollector(mockKV);
    
    // @ts-expect-error - MockR2Bucket is a simplified test double
    archivalService = new ArchivalService(metricsCollector, mockR2, {
      retentionDays: 7,
      archivePrefix: 'test-archive/',
    });

    // Seed with sample data
    const providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];
    providers.forEach(provider => {
      for (let i = 0; i < 10; i++) {
        metricsCollector.recordRequest(provider);
        if (i < 9) {
          metricsCollector.recordSuccess(provider, 100 + i * 10, 1000);
        } else {
          metricsCollector.recordFailure(provider, 200, '500', 'Server error');
        }
      }
    });
  });

  describe('archiveMetrics', () => {
    it('should archive current metrics to R2', async () => {
      const cutoffDate = new Date('2026-01-01');
      const result = await archivalService.archiveMetrics(cutoffDate);

      expect(result.archived).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should generate correct R2 key format', async () => {
      const cutoffDate = new Date('2026-01-15');
      await archivalService.archiveMetrics(cutoffDate);

      const stats = await archivalService.getArchiveStats();
      expect(stats.totalArchives).toBe(1);
      expect(stats.newestDate).toBe('2026-01-15');
    });

    it('should include provider metrics in archive', async () => {
      const cutoffDate = new Date('2026-01-01');
      await archivalService.archiveMetrics(cutoffDate);

      const archived = await archivalService.getMetricsForDate(cutoffDate);
      expect(archived).toBeTruthy();
      expect(archived?.providerMetrics).toHaveProperty('gemini');
      expect(archived?.providerMetrics).toHaveProperty('huggingface');
      expect(archived?.providerMetrics).toHaveProperty('anthropic');
    });

    it('should include summary in archive', async () => {
      const cutoffDate = new Date('2026-01-01');
      await archivalService.archiveMetrics(cutoffDate);

      const archived = await archivalService.getMetricsForDate(cutoffDate);
      expect(archived?.summary).toBeDefined();
      expect(archived?.summary.totalRequests).toBeGreaterThan(0);
      expect(archived?.summary.overallSuccessRate).toBeGreaterThan(0);
    });

    it('should handle archival errors gracefully', async () => {
      // Mock R2 failure
      const failingR2 = new MockR2Bucket();
      failingR2.put = async () => {
        throw new Error('R2 write failed');
      };

      // @ts-expect-error - MockR2Bucket is a simplified test double
      const failingService = new ArchivalService(metricsCollector, failingR2);

      const result = await failingService.archiveMetrics(new Date('2026-01-01'));
      expect(result.archived).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getHistoricalData', () => {
    beforeEach(async () => {
      // Archive metrics for multiple days
      const dates = [
        new Date('2026-01-01'),
        new Date('2026-01-02'),
        new Date('2026-01-03'),
      ];

      for (const date of dates) {
        await archivalService.archiveMetrics(date);
      }
    });

    it('should fetch historical data for date range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-03');

      const result = await archivalService.getHistoricalData(startDate, endDate);

      expect(result.data.length).toBe(3);
      expect(result.totalDays).toBe(2);
      expect(result.startDate).toBe('2026-01-01');
      expect(result.endDate).toBe('2026-01-03');
    });

    it('should return empty array for date range with no data', async () => {
      const startDate = new Date('2025-12-01');
      const endDate = new Date('2025-12-03');

      const result = await archivalService.getHistoricalData(startDate, endDate);

      expect(result.data).toHaveLength(0);
      expect(result.totalDays).toBe(2);
    });

    it('should return partial data when some dates are missing', async () => {
      const startDate = new Date('2025-12-31');
      const endDate = new Date('2026-01-02');

      const result = await archivalService.getHistoricalData(startDate, endDate);

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.length).toBeLessThan(3);
    });
  });

  describe('getMetricsForDate', () => {
    it('should retrieve metrics for specific date', async () => {
      const date = new Date('2026-01-10');
      await archivalService.archiveMetrics(date);

      const metrics = await archivalService.getMetricsForDate(date);

      expect(metrics).toBeTruthy();
      expect(metrics?.date).toBe('2026-01-10');
      expect(metrics?.timestamp).toBeGreaterThan(0);
    });

    it('should return null for non-existent date', async () => {
      const date = new Date('2025-12-01');
      const metrics = await archivalService.getMetricsForDate(date);

      expect(metrics).toBeNull();
    });

    it('should include all provider data', async () => {
      const date = new Date('2026-01-10');
      await archivalService.archiveMetrics(date);

      const metrics = await archivalService.getMetricsForDate(date);

      expect(metrics?.providerMetrics.gemini).toBeDefined();
      expect(metrics?.providerMetrics.gemini.requestsTotal).toBeGreaterThan(0);
    });
  });

  describe('purgeExpired', () => {
    beforeEach(async () => {
      // Archive metrics for old dates
      const oldDates = [
        new Date('2025-11-01'),
        new Date('2025-11-15'),
        new Date('2025-12-01'),
      ];

      for (const date of oldDates) {
        await archivalService.archiveMetrics(date);
      }
    });

    it('should delete archives older than retention period', async () => {
      const result = await archivalService.purgeExpired(30); // 30 days retention

      expect(result.deleted).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
    });

    it('should not delete recent archives', async () => {
      // Archive a recent date
      await archivalService.archiveMetrics(new Date('2026-01-01'));

      const result = await archivalService.purgeExpired(30);

      const stats = await archivalService.getArchiveStats();
      expect(stats.totalArchives).toBeGreaterThan(0);
    });

    it('should handle deletion errors gracefully', async () => {
      // Archive some data first
      await archivalService.archiveMetrics(new Date('2026-01-01'));
      
      // Mock R2 deletion failure
      const failingR2 = mockR2;
      const originalDelete = failingR2.delete.bind(failingR2);
      failingR2.delete = async (key: string) => {
        if (key.includes('2026-01-01')) {
          throw new Error('Delete failed');
        }
        return originalDelete(key);
      };

      // Use 0 days retention to delete everything (including the archive we just created)
      const result = await archivalService.purgeExpired(0);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getArchiveStats', () => {
    it('should return correct statistics', async () => {
      const dates = [
        new Date('2026-01-01'),
        new Date('2026-01-05'),
        new Date('2026-01-10'),
      ];

      for (const date of dates) {
        await archivalService.archiveMetrics(date);
      }

      const stats = await archivalService.getArchiveStats();

      expect(stats.totalArchives).toBe(3);
      expect(stats.oldestDate).toBe('2026-01-01');
      expect(stats.newestDate).toBe('2026-01-10');
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should return empty stats when no archives exist', async () => {
      mockR2.clear();

      const stats = await archivalService.getArchiveStats();

      expect(stats.totalArchives).toBe(0);
      expect(stats.oldestDate).toBeNull();
      expect(stats.newestDate).toBeNull();
      expect(stats.totalSizeBytes).toBe(0);
    });

    it('should calculate total size correctly', async () => {
      await archivalService.archiveMetrics(new Date('2026-01-01'));
      await archivalService.archiveMetrics(new Date('2026-01-02'));

      const stats = await archivalService.getArchiveStats();

      expect(stats.totalSizeBytes).toBeGreaterThan(100); // At least some data
    });
  });

  describe('getAggregatedMetrics', () => {
    beforeEach(async () => {
      // Archive metrics for multiple days
      const dates = [
        new Date('2026-01-01'),
        new Date('2026-01-02'),
        new Date('2026-01-03'),
      ];

      for (const date of dates) {
        await archivalService.archiveMetrics(date);
      }
    });

    it('should aggregate metrics across date range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-03');

      const result = await archivalService.getAggregatedMetrics(startDate, endDate);

      expect(result.totalRequests).toBeGreaterThan(0);
      expect(result.overallSuccessRate).toBeGreaterThan(0);
      expect(result.overallSuccessRate).toBeLessThanOrEqual(1);
    });

    it('should calculate per-provider aggregates', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-03');

      const result = await archivalService.getAggregatedMetrics(startDate, endDate);

      expect(result.providerAggregates.gemini).toBeDefined();
      expect(result.providerAggregates.gemini.totalRequests).toBeGreaterThan(0);
      expect(result.providerAggregates.gemini.successRate).toBeGreaterThan(0);
    });

    it('should calculate average latency correctly', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-03');

      const result = await archivalService.getAggregatedMetrics(startDate, endDate);

      for (const provider of ['gemini', 'huggingface', 'anthropic'] as AIProvider[]) {
        const agg = result.providerAggregates[provider];
        if (agg.totalRequests > 0) {
          expect(agg.averageLatency).toBeGreaterThan(0);
        }
      }
    });

    it('should handle empty date ranges', async () => {
      const startDate = new Date('2025-12-01');
      const endDate = new Date('2025-12-03');

      const result = await archivalService.getAggregatedMetrics(startDate, endDate);

      expect(result.totalRequests).toBe(0);
      expect(result.overallSuccessRate).toBe(0);
    });
  });

  describe('Date Formatting', () => {
    it('should format dates consistently', async () => {
      const date = new Date('2026-01-05');
      await archivalService.archiveMetrics(date);

      const archived = await archivalService.getMetricsForDate(date);
      expect(archived?.date).toBe('2026-01-05');
    });

    it('should handle single-digit months and days', async () => {
      const date = new Date('2026-03-07');
      await archivalService.archiveMetrics(date);

      const archived = await archivalService.getMetricsForDate(date);
      expect(archived?.date).toBe('2026-03-07');
    });
  });
});
