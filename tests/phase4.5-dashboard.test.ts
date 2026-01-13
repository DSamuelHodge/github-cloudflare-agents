/**
 * Phase 4.5 - Dashboard Service Tests
 * 
 * Tests for dashboard data formatting and visualization preparation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardService } from '../src/platform/monitoring/DashboardService';
import { MetricsCollector } from '../src/platform/monitoring/MetricsCollector';
import { AnalyticsService } from '../src/platform/monitoring/AnalyticsService';
import type { AIProvider } from '../src/platform/ai/gateway-client';

// Mock KV namespace
class MockKVNamespace {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const keys = Array.from(this.store.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix))
      .map(name => ({ name }));
    return { keys };
  }

  // Additional methods for full KVNamespace compatibility
  getWithMetadata(): Promise<{ value: string | null; metadata: unknown }> {
    throw new Error('Not implemented');
  }

  async list_complete(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    return this.list(options);
  }

  // Cache status property
  cacheStatus: null = null;
}

describe('DashboardService', () => {
  let dashboardService: DashboardService;
  let metricsCollector: MetricsCollector;
  let analyticsService: AnalyticsService;
  let mockKV: MockKVNamespace;

  beforeEach(() => {
    mockKV = new MockKVNamespace();
    // @ts-expect-error - MockKVNamespace is a simplified test double
    metricsCollector = new MetricsCollector(mockKV);
    analyticsService = new AnalyticsService(metricsCollector);
    dashboardService = new DashboardService(metricsCollector, analyticsService);

    // Seed with sample data
    const providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];
    providers.forEach(provider => {
      for (let i = 0; i < 20; i++) {
        metricsCollector.recordRequest(provider);
        if (i < 18) {
          metricsCollector.recordSuccess(provider, 100 + i * 10, 1000);
        } else {
          metricsCollector.recordFailure(provider, 200, '500', 'Server error');
        }
      }
    });
  });

  describe('getDashboardData', () => {
    it('should return complete dashboard data structure', async () => {
      const data = await dashboardService.getDashboardData(24);

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('timeRange');
      expect(data).toHaveProperty('overview');
      expect(data).toHaveProperty('charts');
      expect(data).toHaveProperty('providerTrends');
      expect(data).toHaveProperty('recommendations');
      expect(data).toHaveProperty('alerts');
    });

    it('should include correct time range information', async () => {
      const hours = 12;
      const data = await dashboardService.getDashboardData(hours);

      expect(data.timeRange.hours).toBe(hours);
      expect(data.timeRange.endTime).toBeGreaterThan(data.timeRange.startTime);
      expect(data.timeRange.endTime - data.timeRange.startTime).toBeCloseTo(hours * 60 * 60 * 1000, -3);
    });

    it('should calculate overview metrics correctly', async () => {
      const data = await dashboardService.getDashboardData(24);

      expect(data.overview.totalRequests).toBeGreaterThan(0);
      expect(data.overview.overallSuccessRate).toBeGreaterThan(0);
      expect(data.overview.overallSuccessRate).toBeLessThanOrEqual(1);
      expect(data.overview.averageLatency).toBeGreaterThan(0);
      expect(data.overview.healthyProviders + data.overview.degradedProviders + data.overview.unhealthyProviders).toBe(3);
    });

    it('should include all required charts', async () => {
      const data = await dashboardService.getDashboardData(24);

      expect(data.charts).toHaveProperty('successRateOverTime');
      expect(data.charts).toHaveProperty('latencyOverTime');
      expect(data.charts).toHaveProperty('requestVolumeOverTime');
      expect(data.charts).toHaveProperty('providerComparison');
    });

    it('should generate provider trends', async () => {
      const data = await dashboardService.getDashboardData(24);

      expect(data.providerTrends).toBeInstanceOf(Array);
      expect(data.providerTrends.length).toBeGreaterThan(0);
      
      const trend = data.providerTrends[0];
      expect(trend).toHaveProperty('provider');
      expect(trend).toHaveProperty('currentSuccessRate');
      expect(trend).toHaveProperty('trend');
      expect(trend).toHaveProperty('recommendation');
    });

    it('should generate recommendations', async () => {
      const data = await dashboardService.getDashboardData(24);

      expect(data.recommendations).toBeInstanceOf(Array);
      expect(data.recommendations.length).toBeGreaterThan(0);
      expect(typeof data.recommendations[0]).toBe('string');
    });

    it('should generate alerts from anomalies', async () => {
      const data = await dashboardService.getDashboardData(24);

      expect(data.alerts).toBeInstanceOf(Array);
      
      if (data.alerts.length > 0) {
        const alert = data.alerts[0];
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('timestamp');
        expect(['info', 'warning', 'critical']).toContain(alert.severity);
      }
    });
  });

  describe('getProviderTrends', () => {
    it('should return trends for all providers', async () => {
      const trends = await dashboardService.getProviderTrends(24);

      expect(trends.length).toBeGreaterThan(0);
      expect(trends.length).toBeLessThanOrEqual(3); // Max 3 providers
    });

    it('should return trends for specific provider', async () => {
      const trends = await dashboardService.getProviderTrends(24, 'gemini');

      expect(trends.length).toBeLessThanOrEqual(1);
      if (trends.length > 0) {
        expect(trends[0].provider).toBe('gemini');
      }
    });

    it('should calculate trend direction correctly', async () => {
      const trends = await dashboardService.getProviderTrends(24);

      for (const trend of trends) {
        expect(['improving', 'stable', 'degrading']).toContain(trend.trend);
        expect(trend.currentSuccessRate).toBeGreaterThanOrEqual(0);
        expect(trend.currentSuccessRate).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate change percentages', async () => {
      const trends = await dashboardService.getProviderTrends(24);

      for (const trend of trends) {
        expect(typeof trend.changePercent).toBe('number');
        expect(typeof trend.latencyChange).toBe('number');
      }
    });

    it('should include reliability scores', async () => {
      const trends = await dashboardService.getProviderTrends(24);

      for (const trend of trends) {
        expect(trend.reliability).toBeGreaterThanOrEqual(0);
        expect(trend.reliability).toBeLessThanOrEqual(100);
      }
    });

    it('should provide actionable recommendations', async () => {
      const trends = await dashboardService.getProviderTrends(24);

      for (const trend of trends) {
        expect(typeof trend.recommendation).toBe('string');
        expect(trend.recommendation.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Chart Generation', () => {
    it('should generate success rate chart with correct structure', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.successRateOverTime;

      expect(chart.title).toBe('Success Rate Over Time');
      expect(chart.xAxisLabel).toBe('Time');
      expect(chart.yAxisLabel).toBe('Success Rate (%)');
      expect(chart.series).toBeInstanceOf(Array);
      expect(chart.series.length).toBeGreaterThan(0);
    });

    it('should generate latency chart with correct structure', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.latencyOverTime;

      expect(chart.title).toBe('Latency Over Time');
      expect(chart.xAxisLabel).toBe('Time');
      expect(chart.yAxisLabel).toBe('Latency (ms)');
      expect(chart.series).toBeInstanceOf(Array);
      expect(chart.series.length).toBeGreaterThan(0);
    });

    it('should generate request volume chart with correct structure', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.requestVolumeOverTime;

      expect(chart.title).toBe('Request Volume Over Time');
      expect(chart.xAxisLabel).toBe('Time');
      expect(chart.yAxisLabel).toBe('Requests');
      expect(chart.series).toBeInstanceOf(Array);
      expect(chart.series.length).toBeGreaterThan(0);
    });

    it('should generate provider comparison chart with correct structure', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.providerComparison;

      expect(chart.title).toBe('Provider Comparison');
      expect(chart.xAxisLabel).toBe('Provider');
      expect(chart.yAxisLabel).toBe('Score');
      expect(chart.series).toBeInstanceOf(Array);
      expect(chart.series.length).toBeGreaterThan(0);
    });

    it('should format chart data points correctly', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.successRateOverTime;

      if (chart.series[0].data.length > 0) {
        const point = chart.series[0].data[0];
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('label');
        expect(point).toHaveProperty('value');
        expect(typeof point.timestamp).toBe('number');
        expect(typeof point.label).toBe('string');
        expect(typeof point.value).toBe('number');
      }
    });

    it('should include color information for series', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.providerComparison;

      for (const series of chart.series) {
        expect(series).toHaveProperty('name');
        expect(series).toHaveProperty('data');
        expect(series.color).toBeDefined();
      }
    });
  });

  describe('Recommendations', () => {
    it('should generate degraded provider recommendations', async () => {
      // Create degraded scenario
      const degradedProvider: AIProvider = 'huggingface';
      for (let i = 0; i < 50; i++) {
        metricsCollector.recordRequest(degradedProvider);
        if (i < 40) {
          metricsCollector.recordFailure(degradedProvider, 200, '500', 'Error');
        } else {
          metricsCollector.recordSuccess(degradedProvider, 150, 1000);
        }
      }

      const data = await dashboardService.getDashboardData(24);

      // Should have at least one recommendation
      expect(data.recommendations).toBeInstanceOf(Array);
      expect(data.recommendations.length).toBeGreaterThan(0);
      
      // With degraded provider, should have actionable recommendations
      const hasActionableRecommendation = data.recommendations.some(r => 
        r.length > 10 && (
          r.toLowerCase().includes('huggingface') || 
          r.toLowerCase().includes('monitor') ||
          r.toLowerCase().includes('degraded') ||
          r.toLowerCase().includes('alert') ||
          r.toLowerCase().includes('success') ||
          r.toLowerCase().includes('review')
        )
      );

      expect(hasActionableRecommendation).toBe(true);
    });

    it('should generate circuit breaker recommendations', async () => {
      // Trigger circuit breaker
      const provider: AIProvider = 'anthropic';
      for (let i = 0; i < 20; i++) {
        metricsCollector.recordRequest(provider);
        metricsCollector.recordFailure(provider, 200, '500', 'Error');
      }

      metricsCollector.recordCircuitBreakerStateChange({
        provider,
        timestamp: Date.now(),
        previousState: 'CLOSED',
        newState: 'OPEN',
        reason: 'failure_threshold',
        failureCount: 10,
        successCount: 0,
      });

      const data = await dashboardService.getDashboardData(24);

      const hasCircuitRecommendation = data.recommendations.some(r => 
        r.toLowerCase().includes('circuit') || 
        r.toLowerCase().includes('anthropic')
      );

      expect(hasCircuitRecommendation).toBe(true);
    });

    it('should provide positive recommendations when all systems normal', async () => {
      // Create healthy scenario
      const provider: AIProvider = 'gemini';
      for (let i = 0; i < 100; i++) {
        metricsCollector.recordRequest(provider);
        metricsCollector.recordSuccess(provider, 100, 1000);
      }

      const data = await dashboardService.getDashboardData(24);

      // Should have recommendations
      expect(data.recommendations).toBeInstanceOf(Array);
      expect(data.recommendations.length).toBeGreaterThan(0);
      
      // Verify they're actionable strings
      for (const recommendation of data.recommendations) {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(5);
      }
    });
  });

  describe('Alerts', () => {
    it('should prioritize critical alerts', async () => {
      const data = await dashboardService.getDashboardData(24);

      const criticalAlerts = data.alerts.filter(a => a.severity === 'critical');
      const warningAlerts = data.alerts.filter(a => a.severity === 'warning');
      const infoAlerts = data.alerts.filter(a => a.severity === 'info');

      if (criticalAlerts.length > 0 && warningAlerts.length > 0) {
        expect(criticalAlerts[0].timestamp).toBeGreaterThanOrEqual(warningAlerts[0].timestamp);
      }
    });

    it('should include provider information in alerts', async () => {
      const data = await dashboardService.getDashboardData(24);

      const providerAlerts = data.alerts.filter(a => a.provider);
      
      for (const alert of providerAlerts) {
        expect(['gemini', 'huggingface', 'anthropic']).toContain(alert.provider);
      }
    });

    it('should limit alert count to most recent', async () => {
      const data = await dashboardService.getDashboardData(24);

      // Should not return excessive alerts (reasonable limit)
      expect(data.alerts.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing data gracefully', async () => {
      const emptyKV = new MockKVNamespace();
      // @ts-expect-error - MockKVNamespace is a simplified test double
      const emptyCollector = new MetricsCollector(emptyKV);
      const emptyAnalytics = new AnalyticsService(emptyCollector);
      const emptyDashboard = new DashboardService(emptyCollector, emptyAnalytics);

      const data = await emptyDashboard.getDashboardData(24);

      expect(data).toBeDefined();
      expect(data.overview.totalRequests).toBe(0);
      expect(data.recommendations).toBeInstanceOf(Array);
    });

    it('should handle invalid time ranges gracefully', async () => {
      const data = await dashboardService.getDashboardData(0);

      expect(data).toBeDefined();
      expect(data.timeRange.hours).toBe(0);
    });

    it('should handle provider-specific errors', async () => {
      const trends = await dashboardService.getProviderTrends(24, 'gemini');

      expect(trends).toBeInstanceOf(Array);
    });
  });

  describe('Time Formatting', () => {
    it('should format time labels consistently', async () => {
      const data = await dashboardService.getDashboardData(24);
      const chart = data.charts.successRateOverTime;

      if (chart.series[0].data.length > 0) {
        const label = chart.series[0].data[0].label;
        expect(label).toMatch(/^\d{2}:\d{2}$/); // HH:MM format
      }
    });
  });
});
