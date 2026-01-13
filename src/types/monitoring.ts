/**
 * Phase 4.1 Stage 4: Observability & Analytics - Type Definitions
 * 
 * Types for metrics collection, analytics aggregation, and monitoring endpoints.
 */

import type { AIProvider } from '../platform/ai/gateway-client';
import type { CircuitState } from './circuit-breaker';

export type { CircuitState };

/**
 * Single request metrics event
 */
export interface RequestMetric {
  timestamp: number;
  provider: AIProvider;
  success: boolean;
  latency: number;
  tokensUsed?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Circuit breaker state change event
 */
export interface CircuitBreakerEvent {
  timestamp: number;
  provider: AIProvider;
  previousState: CircuitState;
  newState: CircuitState;
  reason: 'failure_threshold' | 'success_threshold' | 'timeout' | 'manual_reset';
  failureCount?: number;
  successCount?: number;
}

/**
 * Aggregated metrics for a provider over a time period
 */
export interface AggregatedProviderMetrics {
  provider: AIProvider;
  timestamp: number;
  requestsTotal: number;
  requestsSuccess: number;
  requestsFailure: number;
  successRate: number;
  errorRate: number;
  latencyAvg: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMin: number;
  latencyMax: number;
  tokensTotal?: number;
  failoverCount: number;
  circuitState: CircuitState;
  circuitFailures: number;
  uptimePercentage: number;
}

/**
 * Summary metrics across all providers
 */
export interface MetricsSummary {
  timestamp: number;
  collectionIntervalMs: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  overallSuccessRate: number;
  averageLatency: number;
  failoversTriggered: number;
  circuitBreakerEvents: number;
  providers: Record<AIProvider, AggregatedProviderMetrics>;
}

/**
 * Analytics query result
 */
export interface AnalyticsResult {
  query: {
    hours: number;
    provider?: AIProvider;
    timestamp: number;
  };
  summary: {
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    failoversTriggered: number;
    circuitBreakerEvents: number;
    meanTimeBetweenFailures: number;
  };
  timeSeries: TimeSeriesPoint[];
  providerStats: Record<AIProvider, ProviderAnalytics>;
  anomalies: Anomaly[];
}

/**
 * Single point in time-series data
 */
export interface TimeSeriesPoint {
  timestamp: number;
  requests: number;
  successRate: number;
  latency: number;
  failovers: number;
  circuitEvents: number;
  providerBreakdown?: Record<AIProvider, { requests: number; successRate: number }>;
}

/**
 * Provider-specific analytics
 */
export interface ProviderAnalytics {
  successRate: number;
  averageLatency: number;
  requestShare: number;
  reliability: number;
  trend: 'stable' | 'improving' | 'degrading';
  recommendation?: string;
}

/**
 * Detected anomaly in metrics
 */
export interface Anomaly {
  timestamp: number;
  type: 'success_rate_drop' | 'latency_spike' | 'failover_increase' | 'circuit_open';
  severity: 'low' | 'medium' | 'high' | 'critical';
  provider?: AIProvider;
  description: string;
  expectedValue: number;
  actualValue: number;
}

/**
 * Health status response
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  providers: Record<AIProvider, ProviderHealthStatus>;
  system: SystemHealthStatus;
  message?: string;
}

/**
 * Individual provider health status
 */
export interface ProviderHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  circuitState: CircuitState;
  successRate: number;
  latency: number;
  lastRequestMsAgo: number;
  confidence: number; // 0-1
  message?: string;
}

/**
 * System-level health status
 */
export interface SystemHealthStatus {
  kvAvailable: boolean;
  r2Available: boolean;
  uptimeHours: number;
  errorRate: number;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
}

/**
 * Metrics endpoint response
 */
export interface MetricsResponse {
  timestamp: number;
  collectionIntervalMs: number;
  metrics: Record<AIProvider, AggregatedProviderMetrics>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Historical metric snapshot for archival
 */
export interface MetricSnapshot {
  timestamp: number;
  hour: string; // ISO format: 2026-01-12T14:00:00Z
  providers: Record<AIProvider, {
    requests: number;
    success: number;
    failures: number;
    totalLatency: number;
    circuitState: CircuitState;
    failureCount: number;
  }>;
  totalFailovers: number;
  circuitEvents: number;
}

/**
 * Daily summary for reporting
 */
export interface DailySummary {
  date: string; // ISO date: 2026-01-12
  totalRequests: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
  peakLatency: number;
  minLatency: number;
  failovers: number;
  circuitOpenEvents: number;
  circuitRecoveryTimeTotal: number;
  providers: Record<AIProvider, {
    requests: number;
    successRate: number;
    averageLatency: number;
    failovers: number;
  }>;
}

/**
 * Configuration for metrics collection
 */
export interface MetricsConfig {
  enableCollection: boolean;
  collectionIntervalMs: number;
  retentionDays: number;
  archiveThresholdDays: number;
  aggregationWindows: {
    minute: number;
    hour: number;
    day: number;
  };
  anomalyDetection: {
    enabled: boolean;
    successRateThreshold: number;
    latencySpikeThreshold: number;
    failoverIncreaseThreshold: number;
  };
}

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  recordRequest(provider: AIProvider): void;
  recordSuccess(provider: AIProvider, latency: number, tokensUsed?: number): void;
  recordFailure(provider: AIProvider, latency: number, errorCode: string, errorMessage: string): void;
  recordCircuitBreakerStateChange(event: CircuitBreakerEvent): void;
  getProviderMetrics(provider: AIProvider): Promise<AggregatedProviderMetrics | null>;
  getAggregatedMetrics(): Promise<MetricsSummary>;
  reset(): Promise<void>;
}

/**
 * Analytics service interface
 */
export interface IAnalyticsService {
  getSummary(): Promise<MetricsSummary>;
  getAnalytics(hours?: number, provider?: AIProvider): Promise<AnalyticsResult>;
  getTimeSeries(hours?: number, provider?: AIProvider): Promise<TimeSeriesPoint[]>;
  getProviderComparison(): Promise<Record<AIProvider, ProviderAnalytics>>;
  detectAnomalies(): Anomaly[];
  getHealthStatus(): Promise<HealthStatus>;
}

/**
 * Dashboard service interface
 */
export interface IDashboardService {
  getDashboardData(timeRange: 'hour' | 'day' | 'week' | 'month'): Promise<DashboardData>;
  getProviderTrends(provider: AIProvider, hours: number): Promise<TrendData>;
  getRecommendations(): Promise<Recommendation[]>;
}

/**
 * Dashboard display data
 */
export interface DashboardData {
  summary: MetricsSummary;
  charts: {
    successRateOverTime: ChartData;
    latencyOverTime: ChartData;
    providerComparison: ChartData;
    circuitBreakerStatus: ChartData;
  };
  alerts: Alert[];
}

/**
 * Trend data for provider
 */
export interface TrendData {
  provider: AIProvider;
  successRateTrend: number; // percentage change
  latencyTrend: number; // percentage change
  volumeTrend: number; // percentage change
  forecast?: {
    successRate: number;
    latency: number;
  };
}

/**
 * Recommendation for operations team
 */
export interface Recommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  action: string;
  estimatedImpact: string;
}

/**
 * Chart data for dashboard visualization
 */
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

/**
 * Alert for monitoring
 */
export interface Alert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  provider?: AIProvider;
  resolved: boolean;
  resolvedAt?: number;
}

/**
 * Default metrics configuration
 */
export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  enableCollection: true,
  collectionIntervalMs: 60000, // 1 minute
  retentionDays: 7,
  archiveThresholdDays: 1,
  aggregationWindows: {
    minute: 60000,
    hour: 3600000,
    day: 86400000,
  },
  anomalyDetection: {
    enabled: true,
    successRateThreshold: 0.95,
    latencySpikeThreshold: 1.5, // 150% of baseline
    failoverIncreaseThreshold: 2.0, // 200% of baseline
  },
};
