/**
 * Phase 4.1 Stage 4: AnalyticsService
 * 
 * Aggregates metrics, detects anomalies, and generates analytics reports.
 * Provides time-series data, trend analysis, and health summaries.
 */

import { Logger } from '../../utils/logger';
import type { AIProvider } from '../ai/gateway-client';
import type {
  AggregatedProviderMetrics,
  MetricsSummary,
  AnalyticsResult,
  TimeSeriesPoint,
  ProviderAnalytics,
  Anomaly,
  HealthStatus,
  ProviderHealthStatus,
  SystemHealthStatus,
  IAnalyticsService,
} from '../../types/monitoring';
import type { IMetricsCollector } from './MetricsCollector';

export class AnalyticsService implements IAnalyticsService {
  private readonly logger: Logger;
  private readonly metricsCollector: IMetricsCollector;
  private readonly timeSeriesData: Map<number, MetricsSummary> = new Map();
  private readonly anomalyHistory: Anomaly[] = [];
  private readonly maxTimeSeriesPoints = 1440; // 24 hours at 1-minute intervals
  private readonly maxAnomalyHistory = 100;

  constructor(metricsCollector: IMetricsCollector, logger?: Logger) {
    this.metricsCollector = metricsCollector;
    this.logger = logger || new Logger();
  }

  /**
   * Get current summary
   */
  async getSummary(): Promise<MetricsSummary> {
    return this.metricsCollector.getAggregatedMetrics();
  }

  /**
   * Get analytics for specified time range
   */
  async getAnalytics(hours?: number, provider?: AIProvider): Promise<AnalyticsResult> {
    try {
      const hoursToUse = hours || 24;
      const timeSeries = await this.getTimeSeries(hoursToUse, provider);
      const providerStats = await this.getProviderComparison();
      const anomalies = this.detectAnomalies();

      // Calculate summary statistics
      const totalRequests = timeSeries.reduce((sum, point) => sum + point.requests, 0);
      const avgSuccessRate =
        timeSeries.length > 0
          ? timeSeries.reduce((sum, point) => sum + point.successRate, 0) / timeSeries.length
          : 1.0;
      const avgLatency =
        timeSeries.length > 0
          ? timeSeries.reduce((sum, point) => sum + point.latency, 0) / timeSeries.length
          : 0;
      const failoversTriggered = timeSeries.reduce((sum, point) => sum + point.failovers, 0);
      const circuitBreakerEvents = timeSeries.reduce((sum, point) => sum + point.circuitEvents, 0);

      // Calculate MTBF (Mean Time Between Failures)
      const failures = timeSeries.filter(point => point.successRate < 0.99);
      const mtbf = failures.length > 0 && timeSeries.length > 0
        ? (timeSeries.length * 60) / failures.length
        : Infinity;

      return {
        query: {
          hours: hoursToUse,
          provider,
          timestamp: Date.now(),
        },
        summary: {
          totalRequests,
          successRate: avgSuccessRate,
          averageLatency: avgLatency,
          failoversTriggered,
          circuitBreakerEvents,
          meanTimeBetweenFailures: mtbf,
        },
        timeSeries,
        providerStats,
        anomalies: anomalies.filter(
          a => !provider || a.provider === provider
        ),
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to generate analytics', error, { hours: hours || 24, provider });
      }

      const hoursToUse = hours || 24;
      return {
        query: { hours: hoursToUse, provider, timestamp: Date.now() },
        summary: {
          totalRequests: 0,
          successRate: 1.0,
          averageLatency: 0,
          failoversTriggered: 0,
          circuitBreakerEvents: 0,
          meanTimeBetweenFailures: Infinity,
        },
        timeSeries: [],
        providerStats: {} as Record<AIProvider, ProviderAnalytics>,
        anomalies: [],
      };
    }
  }

  /**
   * Get time-series data for specified hours
   */
  async getTimeSeries(hours?: number, provider?: AIProvider): Promise<TimeSeriesPoint[]> {
    const hoursToUse = hours || 24;
    try {
      const summary = await this.getSummary();
      const now = Date.now();
      const startTime = now - hoursToUse * 3600000;

      // Create array of time points (1-minute intervals)
      const points: TimeSeriesPoint[] = [];
      const interval = 60000; // 1 minute

      for (let timestamp = startTime; timestamp <= now; timestamp += interval) {
        // In a real implementation, this would query historical data from KV
        // For now, create points from current summary
      const providerBreakdown: Partial<Record<AIProvider, { requests: number; successRate: number }>> = {};

        for (const [p, metricsData] of Object.entries(summary.providers)) {
          if (!provider || p === provider) {
            const metrics = metricsData as unknown;
            if (typeof metrics === 'object' && metrics !== null && 'requestsTotal' in metrics) {
              const m = metrics as AggregatedProviderMetrics;
              providerBreakdown[p as AIProvider] = {
                requests: m.requestsTotal > 0 ? Math.ceil(m.requestsTotal / hoursToUse / 60) : 0,
                successRate: m.successRate,
              };
            }
          }
        }

        points.push({
          timestamp,
          requests: summary.totalRequests > 0 ? Math.ceil(summary.totalRequests / hoursToUse / 60) : 0,
          successRate: summary.overallSuccessRate,
          latency: summary.averageLatency,
          failovers: summary.failoversTriggered > 0 ? Math.ceil(summary.failoversTriggered / hoursToUse / 60) : 0,
          circuitEvents: summary.circuitBreakerEvents,
          providerBreakdown: Object.keys(providerBreakdown).length > 0 ? (providerBreakdown as Record<AIProvider, { requests: number; successRate: number }>) : undefined,
        });
      }

      // Store in memory (keep last 1440 points = 24 hours at 1-min intervals)
      this.timeSeriesData.set(now, summary);
      if (this.timeSeriesData.size > this.maxTimeSeriesPoints) {
        const keys = Array.from(this.timeSeriesData.keys());
        const firstKey = keys[0];
        this.timeSeriesData.delete(firstKey);
      }

      return points;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to get time series', error, { hours: hoursToUse, provider });
      }
      return [];
    }
  }

  /**
   * Get provider comparison statistics
   */
  async getProviderComparison(): Promise<Record<AIProvider, ProviderAnalytics>> {
    try {
      const summary = await this.getSummary();
      const stats: Partial<Record<AIProvider, ProviderAnalytics>> = {};

      for (const [provider, metricsData] of Object.entries(summary.providers)) {
        const p = provider as AIProvider;
        const metrics = metricsData as unknown;
        
        if (typeof metrics !== 'object' || metrics === null || !('requestsTotal' in metrics)) {
          continue;
        }
        
        const m = metrics as AggregatedProviderMetrics;
        const requestShare = summary.totalRequests > 0
          ? m.requestsTotal / summary.totalRequests
          : 0;

        // Calculate reliability score (0-100)
        // 80% weight on success rate, 20% weight on latency
        const successComponent = m.successRate * 80;
        const latencyComponent = Math.max(0, 1 - m.latencyAvg / 5000) * 20;
        const reliability = Math.min(100, successComponent + latencyComponent);

        // Determine trend (would compare with historical data in production)
        let trend: 'stable' | 'improving' | 'degrading' = 'stable';
        if (m.successRate > 0.99) {
          trend = 'improving';
        } else if (m.successRate < 0.95) {
          trend = 'degrading';
        }

        // Generate recommendation
        let recommendation: string | undefined;
        if (m.circuitState === 'OPEN') {
          recommendation = `Circuit breaker is OPEN. ${p} may be experiencing issues.`;
        } else if (m.successRate < 0.95) {
          recommendation = `Success rate for ${p} is below 95%. Consider failover.`;
        } else if (m.latencyAvg > 4000) {
          recommendation = `Average latency for ${p} is high (${Math.round(m.latencyAvg)}ms).`;
        }

        stats[p] = {
          successRate: m.successRate,
          averageLatency: m.latencyAvg,
          requestShare,
          reliability,
          trend,
          recommendation,
        };
      }

      return stats as Record<AIProvider, ProviderAnalytics>;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to get provider comparison', error);
      }
      return {} as Record<AIProvider, ProviderAnalytics>;
    }
  }

  /**
   * Detect anomalies in current metrics
   */
  detectAnomalies(): Anomaly[] {
    try {
      const anomalies: Anomaly[] = [];
      const now = Date.now();

      // In a real implementation, this would compare against baselines and historical data
      // For now, check for obvious issues
      if (this.timeSeriesData.size > 10) {
        const recent = Array.from(this.timeSeriesData.values()).slice(-10);
        const avgSuccessRate = recent.reduce((sum, s) => sum + s.overallSuccessRate, 0) / recent.length;
        const current = Array.from(this.timeSeriesData.values())[this.timeSeriesData.size - 1];

        if (current && current.overallSuccessRate < avgSuccessRate * 0.9) {
          anomalies.push({
            timestamp: now,
            type: 'success_rate_drop',
            severity: current.overallSuccessRate < 0.9 ? 'critical' : 'high',
            description: `Success rate dropped to ${(current.overallSuccessRate * 100).toFixed(1)}%`,
            expectedValue: avgSuccessRate,
            actualValue: current.overallSuccessRate,
          });
        }

        const avgLatency = recent.reduce((sum, s) => sum + s.averageLatency, 0) / recent.length;
        if (current && current.averageLatency > avgLatency * 1.5) {
          anomalies.push({
            timestamp: now,
            type: 'latency_spike',
            severity: current.averageLatency > avgLatency * 2.0 ? 'high' : 'medium',
            description: `Latency spike detected: ${Math.round(current.averageLatency)}ms`,
            expectedValue: avgLatency,
            actualValue: current.averageLatency,
          });
        }
      }

      // Store anomalies in history
      this.anomalyHistory.push(...anomalies);
      if (this.anomalyHistory.length > this.maxAnomalyHistory) {
        this.anomalyHistory.splice(0, this.anomalyHistory.length - this.maxAnomalyHistory);
      }

      return anomalies;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to detect anomalies', error);
      }
      return [];
    }
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      const summary = await this.getSummary();
      const providers: Partial<Record<AIProvider, ProviderHealthStatus>> = {};

      for (const [provider, metricsData] of Object.entries(summary.providers)) {
        const p = provider as AIProvider;
        const metrics = metricsData as unknown;
        
        if (typeof metrics !== 'object' || metrics === null || !('requestsTotal' in metrics)) {
          continue;
        }
        
        const m = metrics as AggregatedProviderMetrics;
        const confidence = Math.min(
          1.0,
          (m.requestsTotal / 100) * 0.5 + m.successRate * 0.5
        );

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        if (m.circuitState === 'OPEN') {
          status = 'unhealthy';
        } else if (m.successRate < 0.95 || m.latencyAvg > 5000) {
          status = 'degraded';
        }

        providers[p] = {
          status,
          circuitState: m.circuitState,
          successRate: m.successRate,
          latency: m.latencyAvg,
          lastRequestMsAgo: Date.now() - m.timestamp,
          confidence,
          message:
            status === 'healthy'
              ? 'Operating normally'
              : status === 'degraded'
                ? 'Performance degradation detected'
                : 'Provider is unavailable',
        };
      }

      // Determine overall system status
      const healthyCount = Object.values(providers).filter(p => p.status === 'healthy').length;
      const totalProviders = Object.keys(providers).length;
      let systemStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (totalProviders === 0) {
        systemStatus = 'unhealthy';
      } else if (healthyCount === 0) {
        systemStatus = 'unhealthy';
      } else if (healthyCount < totalProviders / 2) {
        systemStatus = 'degraded';
      }

      const system: SystemHealthStatus = {
        kvAvailable: true,
        r2Available: true,
        uptimeHours: Math.floor(summary.collectionIntervalMs / 3600000),
        errorRate: summary.overallSuccessRate > 0 ? 1 - summary.overallSuccessRate : 0,
      };

      return {
        status: systemStatus,
        timestamp: Date.now(),
        providers: providers as Record<AIProvider, ProviderHealthStatus>,
        system,
        message: this.getHealthMessage(systemStatus, healthyCount, totalProviders),
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to get health status', error);
      }

      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        providers: {} as Record<AIProvider, ProviderHealthStatus>,
        system: {
          kvAvailable: false,
          r2Available: false,
          uptimeHours: 0,
          errorRate: 1.0,
        },
        message: 'System health check failed',
      };
    }
  }

  /**
   * Private: Get appropriate health message
   */
  private getHealthMessage(status: string, healthyCount: number, totalProviders: number): string {
    if (status === 'healthy') {
      return `All ${totalProviders} providers operational`;
    } else if (status === 'degraded') {
      return `${healthyCount}/${totalProviders} providers healthy`;
    } else {
      return 'System unavailable - no providers operational';
    }
  }
}

export default AnalyticsService;
