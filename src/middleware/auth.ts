/**
 * Authentication middleware for webhook verification
 */

import type { Middleware } from './pipeline';
import { verifyWebhookSignature } from '../platform/github/webhook';
import { WebhookVerificationError } from '../utils/errors';

/**
 * Middleware to verify GitHub webhook signatures
 */
export function authMiddleware(): Middleware {
  return async (context, next) => {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // Skip auth for health check
    if (request.method === 'GET' && url.pathname === '/health') {
      return next();
    }
    
    // Only check POST requests
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    
    // Verify GitHub webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      throw new WebhookVerificationError('Missing signature header');
    }
    
    // Clone request to read body
    const bodyText = await request.text();
    
    const isValid = await verifyWebhookSignature(
      bodyText,
      signature,
      env.GITHUB_WEBHOOK_SECRET
    );
    
    if (!isValid) {
      throw new WebhookVerificationError('Invalid signature');
    }
    
    // Recreate request with body for next middleware
    const newRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyText,
    });
    
    context.request = newRequest;
    
    return next();
  };
}
