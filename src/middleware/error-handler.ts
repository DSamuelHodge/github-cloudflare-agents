/**
 * Error handling middleware
 */

import type { Middleware } from './pipeline';
import { isAgentError, toAgentError } from '../utils/errors';

/**
 * Global error handler middleware
 */
export function errorHandler(): Middleware {
  return async (context, next) => {
    try {
      return await next();
    } catch (error) {
      console.error('[ErrorHandler] Caught error:', error);
      
      const agentError = toAgentError(error);
      
      const errorResponse = {
        error: {
          code: agentError.code,
          message: agentError.message,
          ...(agentError.metadata && { metadata: agentError.metadata }),
        },
        timestamp: new Date().toISOString(),
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: agentError.statusCode,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

/**
 * CORS middleware for development
 */
export function corsMiddleware(): Middleware {
  return async (context, next) => {
    const response = await next();
    
    if (!response) {
      return null;
    }
    
    // Add CORS headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return newResponse;
  };
}
