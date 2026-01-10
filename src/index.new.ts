/**
 * Main entry point for GitHub AI Agent
 * Uses agent registry and middleware pipeline
 */

import type { Env } from './types/env';
import type { GitHubEvent } from './types/events';
import { globalRegistry } from './agents/registry';
import { AgentExecutionContext } from './agents/base/AgentContext';
import { IssueResponderAgent } from './agents/issue-responder/agent';
import { createPipeline } from './middleware/pipeline';
import { authMiddleware } from './middleware/auth';
import { errorHandler, corsMiddleware } from './middleware/error-handler';
import { defaultRateLimit } from './middleware/rate-limit';
import { createLogger } from './utils/logger';
import { createMetrics } from './utils/metrics';
import { extractWebhookPayload } from './platform/github/webhook';

/**
 * Initialize agents on worker startup
 */
function initializeAgents() {
  // Register Issue Responder Agent
  const issueResponder = new IssueResponderAgent({
    enabled: true,
    priority: 100,
  });
  
  globalRegistry.register(issueResponder);
  
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
  const { request, env, executionContext } = context;
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
  
  // Create GitHub event
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  const githubEvent: GitHubEvent = {
    type: eventType || 'unknown',
    action: (payload as any)?.action,
    payload,
    headers,
  };
  
  // Create agent execution context
  const agentContext = new AgentExecutionContext(
    requestId,
    githubEvent,
    env,
    logger,
    metrics
  );
  
  logger.info('Webhook received', {
    eventType,
    action: githubEvent.action,
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
