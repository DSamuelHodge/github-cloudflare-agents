/**
 * Rate limiting middleware
 */

import type { Middleware } from './pipeline';
import { RateLimitError } from '../utils/errors';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

/**
 * Simple in-memory rate limiter
 * Note: In production, use Durable Objects or KV for distributed rate limiting
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private config: RateLimitConfig;
  
  constructor(config: RateLimitConfig) {
    this.config = config;
  }
  
  /**
   * Check if request is within rate limit
   */
  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Get existing requests for this identifier
    let timestamps = this.requests.get(identifier) || [];
    
    // Filter out requests outside the current window
    timestamps = timestamps.filter(t => t > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= this.config.maxRequests) {
      return false;
    }
    
    // Add current request
    timestamps.push(now);
    this.requests.set(identifier, timestamps);
    
    return true;
  }
  
  /**
   * Get remaining requests in current window
   */
  getRemaining(identifier: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    const timestamps = this.requests.get(identifier) || [];
    const validTimestamps = timestamps.filter(t => t > windowStart);
    
    return Math.max(0, this.config.maxRequests - validTimestamps.length);
  }
  
  /**
   * Clean up old entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    for (const [identifier, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      
      if (validTimestamps.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validTimestamps);
      }
    }
  }
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(config: RateLimitConfig): Middleware {
  const limiter = new RateLimiter(config);
  
  // Cleanup every 60 seconds
  setInterval(() => limiter.cleanup(), 60000);
  
  return async (context, next) => {
    const { request } = context;
    const url = new URL(request.url);
    
    // Skip rate limiting for health checks
    if (url.pathname === '/health') {
      return next();
    }
    
    // Use IP address as identifier (or use API key if available)
    const identifier = request.headers.get('cf-connecting-ip') || 'unknown';
    
    if (!limiter.checkLimit(identifier)) {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      throw new RateLimitError(retryAfter);
    }
    
    const response = await next();
    
    if (!response) {
      return null;
    }
    
    // Add rate limit headers
    const remaining = limiter.getRemaining(identifier);
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    newResponse.headers.set('X-RateLimit-Remaining', remaining.toString());
    newResponse.headers.set('X-RateLimit-Reset', (Date.now() + config.windowMs).toString());
    
    return newResponse;
  };
}

/**
 * Default rate limit: 100 requests per minute
 */
export function defaultRateLimit(): Middleware {
  return rateLimitMiddleware({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 100,
  });
}
