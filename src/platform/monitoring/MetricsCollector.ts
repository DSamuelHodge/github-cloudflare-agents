/**
 * Phase 4.1 Stage 4: MetricsCollector
 * 
 * Collects real-time metrics for each AI provider.
 * Stores aggregated metrics in KV with 5-second in-memory cache.
 * Tracks: request count, success rate, latency (avg/p50/p95/p99), circuit state
 */

import { Logger } from '../../utils/logger';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { AIProvider } from '../ai/gateway-client';
import type {
  RequestMetric,
  CircuitBreakerEvent,
  AggregatedProviderMetrics,
  MetricsSummary,
  IMetricsCollector,
  CircuitState,
} from '../../types/monitoring';

export type { IMetricsCollector };

const METRICS_KV_PREFIX = 'metrics:';
const METRICS_CACHE_TTL = 5000; // 5 seconds

interface MetricsCache {
  timestamp: number;
  data: Map<AIProvider, AggregatedProviderMetrics>;
}

export class MetricsCollector implements IMetricsCollector {
  private readonly logger: Logger;
  private readonly kv: KVNamespace;
  private requestBuffer: RequestMetric[] = [];
  private circuitBreakerBuffer: CircuitBreakerEvent[] = [];
  private cache: MetricsCache | null = null;
  private providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];

  constructor(kv: KVNamespace, logger?: Logger) {
    this.kv = kv;
    this.logger = logger || new Logger();
    this.initializeMetrics();
  }

  /**
   * Initialize all provider metrics in KV
   */
  private async initializeMetrics(): Promise<void> {
    try {
      for (const provider of this.providers) {
        const key = this.getMetricsKey(provider);
        const existing = await this.kv.get(key);
        
        if (!existing) {
          const initial: AggregatedProviderMetrics = {
            provider,
            timestamp: Date.now(),
            requestsTotal: 0,
            requestsSuccess: 0,
            requestsFailure: 0,
            successRate: 1.0,
            errorRate: 0,
            latencyAvg: 0,
            latencyP50: 0,
            latencyP95: 0,
            latencyP99: 0,
            latencyMin: 0,
            latencyMax: 0,
            tokensTotal: 0,
            failoverCount: 0,
            circuitState: 'CLOSED' as CircuitState,
            circuitFailures: 0,
            uptimePercentage: 100,
          };
          
          await this.kv.put(key, JSON.stringify(initial), { expirationTtl: 604800 }); // 7 days
        }
      }
      
      this.logger.info('Metrics initialized for all providers');
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to initialize metrics', error, { component: 'MetricsCollector' });
      }
    }
  }

  /**
   * Record a new request
   */
  recordRequest(provider: AIProvider): void {
    const metric: RequestMetric = {
      timestamp: Date.now(),
      provider,
      success: false,
      latency: 0,
    };
    
    this.requestBuffer.push(metric);
    this.invalidateCache();
  }

  /**
   * Record successful request with latency
   */
  recordSuccess(provider: AIProvider, latency: number, tokensUsed?: number): void {
    const metric: RequestMetric = {
      timestamp: Date.now(),
      provider,
      success: true,
      latency,
      tokensUsed,
    };
    
    this.requestBuffer.push(metric);
    this.invalidateCache();
    
    this.logger.info('Request recorded', { provider, latency, success: true });
  }

  /**
   * Record failed request
   */
  recordFailure(provider: AIProvider, latency: number, errorCode: string, errorMessage: string): void {
    const metric: RequestMetric = {
      timestamp: Date.now(),
      provider,
      success: false,
      latency,
      errorCode,
      errorMessage,
    };
    
    this.requestBuffer.push(metric);
    this.invalidateCache();
    
    this.logger.info('Request failure recorded', { provider, latency, errorCode });
  }

  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerStateChange(event: CircuitBreakerEvent): void {
    this.circuitBreakerBuffer.push(event);
    this.invalidateCache();
    
    this.logger.info('Circuit breaker state change recorded', {
      provider: event.provider,
      from: event.previousState,
      to: event.newState,
    });
  }

  /**
   * Get current metrics for a provider
   */
  async getProviderMetrics(provider: AIProvider): Promise<AggregatedProviderMetrics | null> {
    try {
      // Check in-memory cache first
      if (this.cache && Date.now() - this.cache.timestamp < METRICS_CACHE_TTL) {
        return this.cache.data.get(provider) || null;
      }

      // Flush buffers and aggregate
      await this.flushMetrics();

      // Read from KV
      const key = this.getMetricsKey(provider);
      const stored = await this.kv.get(key);
      
      if (!stored) {
        return null;
      }

      return JSON.parse(stored) as AggregatedProviderMetrics;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to get provider metrics', error, { provider });
      }
      return null;
    }
  }

  /**
   * Get aggregated metrics across all providers
   */
  async getAggregatedMetrics(): Promise<MetricsSummary> {
    try {
      // Flush any pending metrics
      await this.flushMetrics();

      const providerMetrics: Partial<Record<AIProvider, AggregatedProviderMetrics>> = {};
      let totalRequests = 0;
      let totalSuccesses = 0;
      let totalFailures = 0;
      let totalLatency = 0;
      let failoversTriggered = 0;
      let circuitBreakerEvents = 0;

      for (const provider of this.providers) {
        const metrics = await this.getProviderMetrics(provider);
        if (metrics) {
          providerMetrics[provider] = metrics;
          totalRequests += metrics.requestsTotal;
          totalSuccesses += metrics.requestsSuccess;
          totalFailures += metrics.requestsFailure;
          totalLatency += metrics.latencyAvg * metrics.requestsTotal;
          failoversTriggered += metrics.failoverCount;
          circuitBreakerEvents += metrics.circuitState === 'OPEN' ? 1 : 0;
        }
      }

      const overallSuccessRate = totalRequests > 0 ? totalSuccesses / totalRequests : 1.0;
      const averageLatency = totalRequests > 0 ? totalLatency / totalRequests : 0;

      return {
        timestamp: Date.now(),
        collectionIntervalMs: METRICS_CACHE_TTL,
        totalRequests,
        totalSuccesses,
        totalFailures,
        overallSuccessRate,
        averageLatency,
        failoversTriggered,
        circuitBreakerEvents,
        providers: providerMetrics as Record<AIProvider, AggregatedProviderMetrics>,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to get aggregated metrics', error);
      }
      
      // Return empty summary on error
      return {
        timestamp: Date.now(),
        collectionIntervalMs: METRICS_CACHE_TTL,
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        overallSuccessRate: 1.0,
        averageLatency: 0,
        failoversTriggered: 0,
        circuitBreakerEvents: 0,
        providers: {} as Record<AIProvider, AggregatedProviderMetrics>,
      };
    }
  }

  /**
   * Reset all metrics
   */
  async reset(): Promise<void> {
    try {
      for (const provider of this.providers) {
        const key = this.getMetricsKey(provider);
        await this.kv.delete(key);
      }
      
      this.requestBuffer = [];
      this.circuitBreakerBuffer = [];
      this.cache = null;
      
      this.logger.info('Metrics reset for all providers');
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to reset metrics', error);
      }
    }
  }

  /**
   * Private: Flush buffered metrics to KV
   */
  private async flushMetrics(): Promise<void> {
    if (this.requestBuffer.length === 0 && this.circuitBreakerBuffer.length === 0) {
      return;
    }

    try {
      // Group requests by provider
      const requestsByProvider = new Map<AIProvider, RequestMetric[]>();
      for (const metric of this.requestBuffer) {
        const existing = requestsByProvider.get(metric.provider);
        if (!existing) {
          requestsByProvider.set(metric.provider, []);
        }
        const buffer = requestsByProvider.get(metric.provider);
        if (buffer) {
          buffer.push(metric);
        }
      }

      // Update each provider's metrics
      for (const provider of this.providers) {
        const requests = requestsByProvider.get(provider) || [];
        if (requests.length > 0) {
          await this.updateProviderMetrics(provider, requests);
        }
      }

      // Process circuit breaker events
      for (const event of this.circuitBreakerBuffer) {
        await this.updateCircuitBreakerState(event);
      }

      // Clear buffers
      this.requestBuffer = [];
      this.circuitBreakerBuffer = [];
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to flush metrics', error);
      }
    }
  }

  /**
   * Private: Update provider metrics based on requests
   */
  private async updateProviderMetrics(provider: AIProvider, requests: RequestMetric[]): Promise<void> {
    try {
      const key = this.getMetricsKey(provider);
      const stored = await this.kv.get(key);
      
      // If metrics don't exist yet, create initial state
      if (!stored) {
        const initial: AggregatedProviderMetrics = {
          provider,
          timestamp: Date.now(),
          requestsTotal: 0,
          requestsSuccess: 0,
          requestsFailure: 0,
          successRate: 1.0,
          errorRate: 0.0,
          latencyMin: 0,
          latencyMax: 0,
          latencyAvg: 0,
          latencyP50: 0,
          latencyP95: 0,
          latencyP99: 0,
          tokensTotal: 0,
          failoverCount: 0,
          circuitState: 'CLOSED' as CircuitState,
          circuitFailures: 0,
          uptimePercentage: 100,
        };
        await this.kv.put(key, JSON.stringify(initial), { expirationTtl: 604800 });
      }

      const storedAfterInit = await this.kv.get(key);
      if (!storedAfterInit) {
        this.logger.error('Failed to initialize metrics for provider', undefined, { provider });
        return;
      }

      const current = JSON.parse(storedAfterInit) as AggregatedProviderMetrics;
      const successCount = requests.filter(r => r.success).length;
      const failureCount = requests.filter(r => !r.success).length;
      const latencies = requests.map(r => r.latency).sort((a, b) => a - b);

      // Update counts
      current.requestsTotal += requests.length;
      current.requestsSuccess += successCount;
      current.requestsFailure += failureCount;

      // Update rates
      current.successRate = current.requestsTotal > 0 ? current.requestsSuccess / current.requestsTotal : 1.0;
      current.errorRate = 1.0 - current.successRate;

      // Update latency percentiles
      if (latencies.length > 0) {
        const totalLatency = latencies.reduce((a, b) => a + b, 0);
        const previousTotal = (current.latencyAvg || 0) * (current.requestsTotal - requests.length);
        current.latencyAvg = (previousTotal + totalLatency) / current.requestsTotal;
        
        // Update min/max across all time
        const currentMin = current.latencyMin && current.latencyMin > 0 ? current.latencyMin : Infinity;
        const currentMax = current.latencyMax || 0;
        current.latencyMin = Math.min(currentMin, ...latencies);
        current.latencyMax = Math.max(currentMax, ...latencies);
        
        // For percentiles, use current batch (approximation for real-time metrics)
        const p50Index = Math.min(Math.floor(latencies.length * 0.5), latencies.length - 1);
        const p95Index = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
        const p99Index = Math.min(Math.floor(latencies.length * 0.99), latencies.length - 1);
        
        current.latencyP50 = latencies[p50Index];
        current.latencyP95 = latencies[p95Index];
        current.latencyP99 = latencies[p99Index];
      }

      current.timestamp = Date.now();
      current.uptimePercentage = Math.min(100, (current.requestsSuccess / Math.max(1, current.requestsTotal)) * 100);

      await this.kv.put(key, JSON.stringify(current), { expirationTtl: 604800 }); // 7 days
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to update provider metrics', error, { provider });
      }
    }
  }

  /**
   * Private: Update circuit breaker state for a provider
   */
  private async updateCircuitBreakerState(event: CircuitBreakerEvent): Promise<void> {
    try {
      const key = this.getMetricsKey(event.provider);
      const stored = await this.kv.get(key);
      
      if (!stored) {
        return;
      }

      const current = JSON.parse(stored) as AggregatedProviderMetrics;
      current.circuitState = event.newState;
      current.circuitFailures = event.failureCount || current.circuitFailures;
      current.timestamp = Date.now();

      await this.kv.put(key, JSON.stringify(current), { expirationTtl: 604800 });
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to update circuit breaker state', error, { provider: event.provider });
      }
    }
  }

  /**
   * Private: Get KV key for provider metrics
   */
  private getMetricsKey(provider: AIProvider): string {
    return `${METRICS_KV_PREFIX}${provider}:current`;
  }

  /**
   * Private: Invalidate cache
   */
  private invalidateCache(): void {
    this.cache = null;
  }
}

export default MetricsCollector;
