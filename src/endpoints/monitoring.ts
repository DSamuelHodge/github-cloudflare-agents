/**
 * Monitoring Endpoints
 * 
 * Provides HTTP endpoints for metrics, analytics, and health monitoring:
 * - GET /metrics - Real-time provider metrics
 * - GET /analytics - Time-series analytics with anomaly detection
 * - GET /health - System and provider health status
 */

import type { MetricsCollector, AnalyticsService } from '../platform/monitoring';
import type { AIProvider } from '../platform/ai/gateway-client';
import { createLogger } from '../utils/logger';

const logger = createLogger({});

/**
 * Metrics endpoint - Real-time provider metrics
 * GET /metrics?provider=gemini (optional provider filter)
 */
export async function handleMetricsRequest(
  request: Request,
  metricsCollector: MetricsCollector
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') as AIProvider | null;

    if (provider) {
      // Get metrics for specific provider
      const metrics = await metricsCollector.getProviderMetrics(provider);
      if (!metrics) {
        return new Response(
          JSON.stringify({ error: 'Provider not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(metrics), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // Get aggregated metrics for all providers
      const aggregated = await metricsCollector.getAggregatedMetrics();
      return new Response(JSON.stringify(aggregated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: unknown) {
    logger.error('Failed to handle metrics request', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Analytics endpoint - Time-series analytics with anomaly detection
 * GET /analytics?hours=24&provider=gemini (both optional)
 */
export async function handleAnalyticsRequest(
  request: Request,
  analyticsService: AnalyticsService
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const hoursParam = url.searchParams.get('hours');
    const hours = hoursParam ? parseInt(hoursParam, 10) : undefined;
    const provider = url.searchParams.get('provider') as AIProvider | null;

    // Validate hours parameter
    if (hoursParam && (isNaN(hours!) || hours! <= 0 || hours! > 168)) {
      return new Response(
        JSON.stringify({ error: 'Invalid hours parameter (must be 1-168)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const analytics = await analyticsService.getAnalytics(
      hours,
      provider || undefined
    );

    return new Response(JSON.stringify(analytics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    logger.error('Failed to handle analytics request', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Health endpoint - System and provider health status
 * GET /health
 */
export async function handleHealthRequest(
  request: Request,
  analyticsService: AnalyticsService
): Promise<Response> {
  try {
    const health = await analyticsService.getHealthStatus();

    // Determine HTTP status based on overall health
    let status = 200;
    if (health.status === 'degraded') {
      status = 200; // Still operational
    } else if (health.status === 'unhealthy') {
      status = 503; // Service unavailable
    }

    return new Response(JSON.stringify(health), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    logger.error('Failed to handle health request', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ 
        status: 'unhealthy',
        timestamp: Date.now(),
        message: 'Health check failed',
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Route monitoring requests to appropriate handlers
 */
export async function routeMonitoringRequest(
  request: Request,
  metricsCollector: MetricsCollector,
  analyticsService: AnalyticsService
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/metrics') {
    return handleMetricsRequest(request, metricsCollector);
  } else if (path === '/analytics') {
    return handleAnalyticsRequest(request, analyticsService);
  } else if (path === '/health') {
    return handleHealthRequest(request, analyticsService);
  } else {
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
