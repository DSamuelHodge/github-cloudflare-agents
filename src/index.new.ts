/**
 * Main entry point for GitHub AI Agent
 * Uses agent registry and middleware pipeline
 */

import type { Env } from './types/env';
import type { GitHubEvent } from './types/events';
import { globalRegistry } from './agents/registry';
import { AgentExecutionContext } from './agents/base/AgentContext';
import { createPipeline } from './middleware/pipeline';
import { authMiddleware } from './middleware/auth';
import { errorHandler, corsMiddleware } from './middleware/error-handler';
import { defaultRateLimit } from './middleware/rate-limit';
import { createLogger } from './utils/logger';
import { createMetrics } from './utils/metrics';
import { extractWebhookPayload } from './platform/github/webhook';
import { R2StorageService } from './platform/storage';
import { StreamingService } from './platform/streaming';
import { DocumentationIndexer } from './platform/documentation/indexer';
import { createGitHubRepositoryService } from './platform/github';
import { getGlobalCostTracker } from './platform/monitoring/CostTracker';
import { getGlobalRAGMetricsTracker } from './platform/monitoring/RAGMetrics';
import { RepositoryConfigService } from './platform/repository-config';
import { extractRepositoryTarget, hasRepositoryConfigs, resolveRepositoryContext } from './utils/repository';
import { handlePhase3Analytics } from './platform/analytics/endpoints';

// Monitoring services (Metrics & Analytics)
import { MetricsCollector, AnalyticsService } from './platform/monitoring';
import { createAlertingServiceFromEnv } from './platform/alerting/AlertingService';
import type { Alert as PlatformAlert } from './platform/alerting/alerts';
import { routeMonitoringRequest } from './endpoints/monitoring';

// Export TestContainer for Cloudflare Containers (Phase 2)
export { TestContainer } from './containers/TestContainer';

// Global streaming service instance (per-isolate)
let streamingService: StreamingService | null = null;

function getStreamingService(env: Env): StreamingService {
  if (!streamingService) {
    streamingService = new StreamingService(env);
  }
  return streamingService;
}

/**
 * Initialize agents on worker startup
 */
function initializeAgents() {
  // Initialize the global registry with all built-in agents
  globalRegistry.initialize();
  
  console.log('[Init] Agents registered:', globalRegistry.getStats());
}

// Initialize agents once
initializeAgents();

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check endpoint (no auth required)
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        agents: globalRegistry.getStats(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // WebSocket streaming endpoint (Phase 2.4)
    if (url.pathname === '/ws/stream') {
      const streaming = getStreamingService(env);
      return streaming.handleWebSocketUpgrade(request);
    }

    // Streaming stats endpoint (Phase 2.4)
    if (request.method === 'GET' && url.pathname === '/ws/stats') {
      const streaming = getStreamingService(env);
      return Response.json(streaming.getStats());
    }

    // Artifact download endpoint (Phase 2.3)
    if (request.method === 'GET' && url.pathname.startsWith('/artifacts/')) {
      return handleArtifactRequest(url.pathname, env);
    }
    
    // Documentation indexing endpoint (Phase 1.5.4 - Secured)
    // POST /index-docs?owner={owner}&repo={repo}&ref={ref}
    // Requires: Authorization: Bearer <API_SECRET_TOKEN>
    if (request.method === 'POST' && url.pathname === '/index-docs') {
      // Apply bearer auth and rate limiting inline
      try {
        // Check authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({
            error: 'Missing or invalid Authorization header. Expected: Bearer <token>',
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        const token = authHeader.substring(7);
        if (!env.API_SECRET_TOKEN || token !== env.API_SECRET_TOKEN) {
          return new Response(JSON.stringify({
            error: 'Invalid API token',
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        // Note: Rate limiting is applied via global rate limiter in pipeline
        // Additional endpoint-specific rate limiting could be added here
        
        return handleDocumentationIndexing(request, env);
      } catch (error) {
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : 'Authentication failed',
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Cost metrics endpoint (Phase 1.5.2)
    // GET /metrics
    if (request.method === 'GET' && url.pathname === '/metrics') {
      const costTracker = getGlobalCostTracker();
      const ragMetrics = getGlobalRAGMetricsTracker();
      
      const costSummary = costTracker.getSummary();
      const ragSummary = ragMetrics.getSummary();
      
      return Response.json({
        timestamp: new Date().toISOString(),
        cost: {
          ...costSummary,
          recentOperations: costTracker.getRecentOperations(10),
        },
        rag: {
          ...ragSummary,
          recentQueries: ragMetrics.getRecentMetrics(10),
          failedQueries: ragMetrics.getFailedQueries().length,
          lowQualityQueries: ragMetrics.getLowQualityQueries(0.7).length,
        },
      });
    }

    // Monitoring endpoints (Phase 4.1): /analytics, /metrics (monitoring), /health
    if (request.method === 'GET' && (url.pathname === '/analytics' || url.pathname === '/health' || url.pathname === '/metrics')) {
      try {
        const kv = env.KV;
        if (!kv) {
          return new Response(
            JSON.stringify({ error: 'KV namespace not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const metricsCollector = new MetricsCollector(kv, createLogger(env));
        const alertingService = createAlertingServiceFromEnv(env);
        const analyticsService = new AnalyticsService(metricsCollector, createLogger(env), async (a: PlatformAlert) => alertingService.alert(a));

        return routeMonitoringRequest(request, metricsCollector, analyticsService);
      } catch (error: unknown) {
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Favicon: respond with 204 No Content to avoid 405 log spam
    if (request.method === 'GET' && url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // Phase 3 analytics endpoint (Phase 3.10)
    // GET /analytics/phase3
    if (request.method === 'GET' && url.pathname === '/analytics/phase3') {
      return handlePhase3Analytics(env);
    }
    
    // Create middleware pipeline
    const pipeline = createPipeline()
      .use(corsMiddleware())
      .use(errorHandler())
      .use(authMiddleware())
      .use(defaultRateLimit());
    
    // Execute pipeline
    return pipeline.execute(
      { request, env, executionContext: ctx },
      handleWebhook
    );
  },
};

/**
 * Handle GitHub webhook after middleware
 */
async function handleWebhook(context: { request: Request; env: Env; executionContext: ExecutionContext }): Promise<Response> {
  const { request, env, executionContext: _executionContext } = context;
  const eventType = request.headers.get('x-github-event');
  
  // Handle ping event
  if (eventType === 'ping') {
    return Response.json({ ok: true, ping: 'pong' });
  }
  
  // Parse webhook payload
  const bodyText = await request.text();
  const contentType = request.headers.get('content-type');
  const payloadText = extractWebhookPayload(bodyText, contentType);
  
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return new Response('Invalid JSON payload', { status: 400 });
  }
  
  // Generate request ID
  const requestId = crypto.randomUUID();
  
  // Create logger and metrics
  const logger = createLogger(env, {
    requestId,
    eventType: eventType || 'unknown',
  });
  
  const metrics = createMetrics({
    event_type: eventType || 'unknown',
  });

  // Repository configuration
  const repositoryConfigService = RepositoryConfigService.fromEnvironment(env, logger);
  const repositoryTarget = extractRepositoryTarget(payload);
  const repositoryContext = repositoryTarget
    ? resolveRepositoryContext(repositoryTarget, repositoryConfigService)
    : undefined;

  if (!repositoryContext && hasRepositoryConfigs(repositoryConfigService)) {
    logger.warn('Repository missing from payload; skipping because registry is defined');
    metrics.increment('webhook.skipped', 1, { reason: 'missing_repository' });

    return new Response(JSON.stringify({
      requestId,
      eventType,
      skipped: true,
      reason: 'missing_repository',
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (repositoryContext && !repositoryContext.config && hasRepositoryConfigs(repositoryConfigService)) {
    logger.warn('Repository not configured; skipping webhook', { repository: repositoryContext.fullName });
    metrics.increment('webhook.skipped', 1, { reason: 'repo_not_configured', repository: repositoryContext.fullName });

    return new Response(JSON.stringify({
      requestId,
      eventType,
      repository: repositoryContext.fullName,
      skipped: true,
      reason: 'repo_not_configured',
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Create GitHub event
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  const githubEvent: GitHubEvent = {
    type: eventType || 'unknown',
    action: (payload as { action?: string })?.action,
    payload,
    headers,
  };
  
  // Create agent execution context
  const agentContext = new AgentExecutionContext(
    requestId,
    githubEvent,
    env,
    logger,
    metrics,
    repositoryContext
  );
  
  logger.info('Webhook received', {
    eventType,
    action: githubEvent.action,
    repository: repositoryContext?.fullName,
  });
  
  // Execute agents
  const results = await globalRegistry.executeAll(agentContext);
  
  logger.info('Agent execution completed', {
    totalAgents: results.length,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length,
  });
  
  // Return results
  return new Response(JSON.stringify({
    requestId,
    timestamp: new Date().toISOString(),
    eventType,
    results,
    metrics: metrics.getMetrics(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Export types for external use
export type { Env } from './types/env';
export { IssueResponderAgent } from './agents/issue-responder/agent';
export { globalRegistry } from './agents/registry';

/**
 * Handle artifact download requests (Phase 2.3)
 */
async function handleArtifactRequest(pathname: string, env: Env): Promise<Response> {
  // Extract key from /artifacts/test-artifacts/{owner}/{repo}/{jobId}/{type}/{filename}
  const key = pathname.replace('/artifacts/', '');

  if (!key) {
    return new Response('Missing artifact key', { status: 400 });
  }

  try {
    const storage = new R2StorageService(env);
    const { content, metadata } = await storage.getArtifact(key);

    if (!content || !metadata) {
      return new Response('Artifact not found', { status: 404 });
    }

    const headers: Record<string, string> = {
      'Content-Type': metadata.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(metadata.size),
      'ETag': metadata.etag,
      'Cache-Control': 'public, max-age=86400', // Cache for 1 day
    };

    return new Response(content, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve artifact';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle documentation indexing requests (Phase 1.5 - Stage 4)
 */
async function handleDocumentationIndexing(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const ref = url.searchParams.get('ref') || undefined;
  
  if (!owner || !repo) {
    return new Response(JSON.stringify({
      error: 'Missing required parameters: owner, repo',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  if (!env.TEST_ARTIFACTS) {
    return new Response(JSON.stringify({
      error: 'R2 storage not configured (TEST_ARTIFACTS binding missing)',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const repositoryService = createGitHubRepositoryService(env);
    const indexer = new DocumentationIndexer(
      repositoryService,
      env.TEST_ARTIFACTS,
      env.GEMINI_API_KEY,
      env.DOC_EMBEDDINGS,
      (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error'
    );
    
    const job = await indexer.indexDocumentation({
      owner,
      repo,
      ref,
    });
    
    return new Response(JSON.stringify({
      success: job.status === 'completed',
      job,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to index documentation';
    return new Response(JSON.stringify({
      error: message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
