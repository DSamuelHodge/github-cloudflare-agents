/**
 * Dashboard Service
 * 
 * Formats monitoring data for UI visualization and charting.
 * Provides chart-ready datasets, provider trends, and actionable recommendations.
 */

import type { AnalyticsService } from './AnalyticsService';
import type { MetricsCollector } from './MetricsCollector';
import type { AIProvider } from '../ai/gateway-client';
import { createLogger } from '../../utils/logger';

const logger = createLogger({});

/**
 * Chart data point for time-series visualization
 */
export interface ChartDataPoint {
  timestamp: number;
  label: string; // Human-readable time label (e.g., "14:30")
  value: number;
  metadata?: Record<string, unknown>;
}

/**
 * Multi-series chart dataset
 */
export interface ChartDataset {
  title: string;
  description: string;
  xAxisLabel: string;
  yAxisLabel: string;
  series: Array<{
    name: string;
    data: ChartDataPoint[];
    color?: string;
  }>;
}

/**
 * Provider trend analysis
 */
export interface ProviderTrend {
  provider: AIProvider;
  currentSuccessRate: number;
  previousSuccessRate: number;
  changePercent: number;
  trend: 'improving' | 'stable' | 'degrading';
  currentLatency: number;
  previousLatency: number;
  latencyChange: number;
  reliability: number;
  recommendation: string;
}

/**
 * Dashboard summary data
 */
export interface DashboardData {
  timestamp: number;
  timeRange: {
    hours: number;
    startTime: number;
    endTime: number;
  };
  overview: {
    totalRequests: number;
    overallSuccessRate: number;
    averageLatency: number;
    healthyProviders: number;
    degradedProviders: number;
    unhealthyProviders: number;
  };
  charts: {
    successRateOverTime: ChartDataset;
    latencyOverTime: ChartDataset;
    requestVolumeOverTime: ChartDataset;
    providerComparison: ChartDataset;
  };
  providerTrends: ProviderTrend[];
  recommendations: string[];
  alerts: Array<{
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
    provider?: AIProvider;
  }>;
}

/**
 * Dashboard service for UI data preparation
 */
export class DashboardService {
  private readonly metricsCollector: MetricsCollector;
  private readonly analyticsService: AnalyticsService;

  constructor(metricsCollector: MetricsCollector, analyticsService: AnalyticsService) {
    this.metricsCollector = metricsCollector;
    this.analyticsService = analyticsService;
  }

  /**
   * Get complete dashboard data
   */
  async getDashboardData(hours = 24): Promise<DashboardData> {
    try {
      const now = Date.now();
      const startTime = now - hours * 60 * 60 * 1000;

      // Fetch analytics and health data
      const [analytics, health, summary] = await Promise.all([
        this.analyticsService.getAnalytics(hours),
        this.analyticsService.getHealthStatus(),
        this.metricsCollector.getAggregatedMetrics(),
      ]);

      // Build dashboard data
      const dashboardData: DashboardData = {
        timestamp: now,
        timeRange: {
          hours,
          startTime,
          endTime: now,
        },
        overview: {
          totalRequests: summary.totalRequests,
          overallSuccessRate: summary.overallSuccessRate,
          averageLatency: summary.averageLatency,
          healthyProviders: Object.values(health.providers).filter(p => p.status === 'healthy').length,
          degradedProviders: Object.values(health.providers).filter(p => p.status === 'degraded').length,
          unhealthyProviders: Object.values(health.providers).filter(p => p.status === 'unhealthy').length,
        },
        charts: {
          successRateOverTime: this.buildSuccessRateChart(analytics.timeSeries),
          latencyOverTime: this.buildLatencyChart(analytics.timeSeries),
          requestVolumeOverTime: this.buildRequestVolumeChart(analytics.timeSeries),
          providerComparison: await this.buildProviderComparisonChart(),
        },
        providerTrends: await this.getProviderTrends(hours),
        recommendations: this.generateRecommendations(health, analytics, summary),
        alerts: this.generateAlerts(analytics.anomalies, health),
      };

      return dashboardData;
    } catch (error) {
      logger.error('Failed to generate dashboard data', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get provider-specific trends
   */
  async getProviderTrends(hours = 24, provider?: AIProvider): Promise<ProviderTrend[]> {
    try {
      const comparison = await this.analyticsService.getProviderComparison();
      const providers = provider ? [provider] : (['gemini', 'huggingface', 'anthropic'] as AIProvider[]);

      const trends: ProviderTrend[] = [];

      for (const p of providers) {
        const stats = comparison[p];
        if (!stats) continue;

        // Calculate change (comparing current to 1 hour ago)
        const recentAnalytics = await this.analyticsService.getAnalytics(1, p);
        const historicalAnalytics = await this.analyticsService.getAnalytics(hours, p);

        const currentSuccessRate = recentAnalytics.summary.successRate;
        const previousSuccessRate = historicalAnalytics.summary.successRate;
        const changePercent = ((currentSuccessRate - previousSuccessRate) / previousSuccessRate) * 100;

        const currentLatency = recentAnalytics.summary.averageLatency;
        const previousLatency = historicalAnalytics.summary.averageLatency;
        const latencyChange = currentLatency - previousLatency;

        trends.push({
          provider: p,
          currentSuccessRate,
          previousSuccessRate,
          changePercent,
          trend: stats.trend,
          currentLatency,
          previousLatency,
          latencyChange,
          reliability: stats.reliability,
          recommendation: this.getProviderRecommendation(stats, changePercent, latencyChange),
        });
      }

      return trends;
    } catch (error) {
      logger.error('Failed to get provider trends', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Build success rate over time chart
   */
  private buildSuccessRateChart(timeSeries: Array<{ timestamp: number; successRate: number; providerBreakdown?: Record<AIProvider, { successRate: number }> }>): ChartDataset {
    const overallData: ChartDataPoint[] = timeSeries.map(point => ({
      timestamp: point.timestamp,
      label: this.formatTimeLabel(point.timestamp),
      value: point.successRate * 100, // Convert to percentage
    }));

    const series = [
      {
        name: 'Overall Success Rate',
        data: overallData,
        color: '#10B981', // Green
      },
    ];

    // Add per-provider series if available
    if (timeSeries[0]?.providerBreakdown) {
      const providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];
      const colors = ['#3B82F6', '#8B5CF6', '#F59E0B']; // Blue, Purple, Orange

      providers.forEach((provider, index) => {
        const providerData: ChartDataPoint[] = timeSeries
          .filter(point => point.providerBreakdown?.[provider])
          .map(point => {
            const pb = point.providerBreakdown;
            const successRate = pb && pb[provider] && typeof pb[provider].successRate === 'number' ? pb[provider].successRate : 0;
            return {
              timestamp: point.timestamp,
              label: this.formatTimeLabel(point.timestamp),
              value: (successRate || 0) * 100,
            };
          });

        if (providerData.length > 0) {
          series.push({
            name: this.capitalizeProvider(provider),
            data: providerData,
            color: colors[index],
          });
        }
      });
    }

    return {
      title: 'Success Rate Over Time',
      description: 'AI provider success rates (percentage)',
      xAxisLabel: 'Time',
      yAxisLabel: 'Success Rate (%)',
      series,
    };
  }

  /**
   * Build latency over time chart
   */
  private buildLatencyChart(timeSeries: Array<{ timestamp: number; latency: number }>): ChartDataset {
    const data: ChartDataPoint[] = timeSeries.map(point => ({
      timestamp: point.timestamp,
      label: this.formatTimeLabel(point.timestamp),
      value: point.latency,
    }));

    return {
      title: 'Latency Over Time',
      description: 'Average response latency (milliseconds)',
      xAxisLabel: 'Time',
      yAxisLabel: 'Latency (ms)',
      series: [
        {
          name: 'Average Latency',
          data,
          color: '#6366F1', // Indigo
        },
      ],
    };
  }

  /**
   * Build request volume over time chart
   */
  private buildRequestVolumeChart(timeSeries: Array<{ timestamp: number; requests: number }>): ChartDataset {
    const data: ChartDataPoint[] = timeSeries.map(point => ({
      timestamp: point.timestamp,
      label: this.formatTimeLabel(point.timestamp),
      value: point.requests,
    }));

    return {
      title: 'Request Volume Over Time',
      description: 'Number of AI requests per minute',
      xAxisLabel: 'Time',
      yAxisLabel: 'Requests',
      series: [
        {
          name: 'Request Volume',
          data,
          color: '#14B8A6', // Teal
        },
      ],
    };
  }

  /**
   * Build provider comparison chart
   */
  private async buildProviderComparisonChart(): Promise<ChartDataset> {
    const comparison = await this.analyticsService.getProviderComparison();
    const providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];

    const successRateData: ChartDataPoint[] = [];
    const latencyData: ChartDataPoint[] = [];
    const reliabilityData: ChartDataPoint[] = [];

    providers.forEach((provider) => {
      const stats = comparison[provider];
      if (stats) {
        successRateData.push({
          timestamp: Date.now(),
          label: this.capitalizeProvider(provider),
          value: stats.successRate * 100,
        });

        latencyData.push({
          timestamp: Date.now(),
          label: this.capitalizeProvider(provider),
          value: stats.averageLatency,
        });

        reliabilityData.push({
          timestamp: Date.now(),
          label: this.capitalizeProvider(provider),
          value: stats.reliability,
        });
      }
    });

    return {
      title: 'Provider Comparison',
      description: 'Comparative metrics across AI providers',
      xAxisLabel: 'Provider',
      yAxisLabel: 'Score',
      series: [
        {
          name: 'Success Rate (%)',
          data: successRateData,
          color: '#10B981',
        },
        {
          name: 'Reliability Score',
          data: reliabilityData,
          color: '#3B82F6',
        },
      ],
    };
  }

  /**
   * Generate recommendations based on health and analytics
   */
  private generateRecommendations(health: Awaited<ReturnType<typeof this.analyticsService.getHealthStatus>>, analytics: Awaited<ReturnType<typeof this.analyticsService.getAnalytics>>, summary: Awaited<ReturnType<typeof this.metricsCollector.getAggregatedMetrics>>): string[] {
    const recommendations: string[] = [];

    // Provider-specific recommendations
    for (const [provider, providerHealth] of Object.entries(health.providers)) {
      if (providerHealth.status === 'degraded') {
        recommendations.push(`Monitor ${this.capitalizeProvider(provider as AIProvider)} - success rate degraded to ${(providerHealth.successRate * 100).toFixed(1)}%`);
      }
      if (providerHealth.status === 'unhealthy') {
        recommendations.push(`Alert: ${this.capitalizeProvider(provider as AIProvider)} is unhealthy - consider removing from rotation`);
      }
      if (providerHealth.circuitState === 'OPEN') {
        recommendations.push(`${this.capitalizeProvider(provider as AIProvider)} circuit breaker is OPEN - automatic recovery in progress`);
      }
    }

    // Anomaly-based recommendations
    if (analytics.anomalies.length > 0) {
      const recentAnomalies = analytics.anomalies.slice(0, 3);
      for (const anomaly of recentAnomalies) {
        if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
          recommendations.push(`${anomaly.type.replace('_', ' ')}: ${anomaly.description}`);
        }
      }
    }

    // Overall system recommendations
    if (summary.overallSuccessRate < 0.95) {
      recommendations.push('Overall success rate below 95% - review provider configuration');
    }

    if (recommendations.length === 0) {
      recommendations.push('All systems operating normally');
    }

    return recommendations;
  }

  /**
   * Generate alerts from anomalies and health status
   */
  private generateAlerts(anomalies: Array<{ timestamp: number; type: string; severity: 'low' | 'medium' | 'high' | 'critical'; provider?: AIProvider; description: string }>, health: Awaited<ReturnType<typeof this.analyticsService.getHealthStatus>>): DashboardData['alerts'] {
    const alerts: DashboardData['alerts'] = [];

    // Convert anomalies to alerts
    for (const anomaly of anomalies.slice(0, 10)) {
      alerts.push({
        severity: anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'critical' : anomaly.severity === 'medium' ? 'warning' : 'info',
        message: anomaly.description,
        timestamp: anomaly.timestamp,
        provider: anomaly.provider,
      });
    }

    // Add health-based alerts
    for (const [provider, providerHealth] of Object.entries(health.providers)) {
      if (providerHealth.status === 'unhealthy') {
        alerts.push({
          severity: 'critical',
          message: `${this.capitalizeProvider(provider as AIProvider)} is unhealthy`,
          timestamp: Date.now(),
          provider: provider as AIProvider,
        });
      }
    }

    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get provider-specific recommendation
   */
  private getProviderRecommendation(stats: { successRate: number; averageLatency: number; reliability: number; trend: string }, changePercent: number, latencyChange: number): string {
    if (stats.successRate < 0.8) {
      return 'Critical: Consider removing from rotation';
    }
    if (stats.successRate < 0.9) {
      return 'Warning: Monitor closely for recovery';
    }
    if (changePercent < -5) {
      return 'Degrading: Success rate declining';
    }
    if (latencyChange > 500) {
      return 'Latency increasing: Check provider status';
    }
    if (stats.reliability > 90) {
      return 'Excellent: Primary provider candidate';
    }
    if (stats.reliability > 80) {
      return 'Good: Suitable for production use';
    }
    return 'Stable: Operating within normal parameters';
  }

  /**
   * Format timestamp as human-readable label
   */
  private formatTimeLabel(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Capitalize provider name
   */
  private capitalizeProvider(provider: AIProvider): string {
    const names: Record<AIProvider, string> = {
      gemini: 'Gemini',
      huggingface: 'HuggingFace',
      anthropic: 'Anthropic',
    };
    return names[provider] || provider;
  }
}
