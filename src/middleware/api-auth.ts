/**
 * Bearer token authentication middleware for API endpoints
 * Secures administrative endpoints like /index-docs
 */

import type { Middleware } from './pipeline';
import { AuthenticationError } from '../utils/errors';

/**
 * Bearer token authentication for API endpoints
 * Validates Authorization: Bearer <token> header against env.API_SECRET_TOKEN
 */
export function bearerAuthMiddleware(requiredPaths: string[]): Middleware {
  return async (context, next) => {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // Check if this path requires authentication
    const requiresAuth = requiredPaths.some(path => url.pathname === path);
    
    if (!requiresAuth) {
      return next();
    }
    
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader) {
      throw new AuthenticationError('Missing Authorization header');
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Invalid Authorization header format. Expected: Bearer <token>');
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Validate token against environment secret
    if (!env.API_SECRET_TOKEN) {
      throw new AuthenticationError('API_SECRET_TOKEN not configured');
    }
    
    if (token !== env.API_SECRET_TOKEN) {
      throw new AuthenticationError('Invalid API token');
    }
    
    // Token is valid, proceed to next middleware
    return next();
  };
}

/**
 * IP-based rate limiting for specific endpoints
 * More aggressive than default rate limit for sensitive operations
 */
export function endpointRateLimitMiddleware(config: {
  paths: string[];
  windowMs: number;
  maxRequests: number;
}): Middleware {
  const requests = new Map<string, number[]>();
  
  // Cleanup old entries every 60 seconds
  setInterval(() => {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    for (const [key, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        requests.delete(key);
      } else {
        requests.set(key, validTimestamps);
      }
    }
  }, 60000);
  
  return async (context, next) => {
    const { request } = context;
    const url = new URL(request.url);
    
    // Check if this path requires rate limiting
    const requiresLimiting = config.paths.some(path => url.pathname === path);
    
    if (!requiresLimiting) {
      return next();
    }
    
    // Get client identifier (IP or API key)
    const identifier = request.headers.get('cf-connecting-ip') || 
                      request.headers.get('x-forwarded-for') ||
                      'unknown';
    
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Get existing requests for this identifier
    let timestamps = requests.get(identifier) || [];
    
    // Filter out requests outside the current window
    timestamps = timestamps.filter(t => t > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= config.maxRequests) {
      const resetTime = Math.ceil((timestamps[0] + config.windowMs - now) / 1000);
      
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: resetTime,
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': resetTime.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil((timestamps[0] + config.windowMs) / 1000).toString(),
        },
      });
    }
    
    // Add current request
    timestamps.push(now);
    requests.set(identifier, timestamps);
    
    // Add rate limit headers to response
    const response = await next();
    
    if (!response) {
      return response;
    }
    
    const remaining = config.maxRequests - timestamps.length;
    const resetTimestamp = Math.ceil((timestamps[0] + config.windowMs) / 1000);
    
    // Clone response to add headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-RateLimit-Limit', config.maxRequests.toString());
    newHeaders.set('X-RateLimit-Remaining', remaining.toString());
    newHeaders.set('X-RateLimit-Reset', resetTimestamp.toString());
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
