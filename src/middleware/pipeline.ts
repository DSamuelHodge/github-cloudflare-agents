/**
 * Middleware system for request processing
 */

import type { RequestContext } from '../types/env';

export type MiddlewareResult = Response | null;

export type Middleware = (
  context: RequestContext,
  next: () => Promise<MiddlewareResult>
) => Promise<MiddlewareResult>;

/**
 * Middleware pipeline builder
 */
export class MiddlewarePipeline {
  private middlewares: Middleware[] = [];
  
  /**
   * Add middleware to the pipeline
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }
  
  /**
   * Execute the middleware pipeline
   */
  async execute(
    context: RequestContext,
    handler: (context: RequestContext) => Promise<Response>
  ): Promise<Response> {
    let index = 0;
    
    const next = async (): Promise<MiddlewareResult> => {
      if (index >= this.middlewares.length) {
        return await handler(context);
      }
      
      const middleware = this.middlewares[index++];
      return await middleware(context, next);
    };
    
    const result = await next();
    return result || new Response('No response generated', { status: 500 });
  }
}

/**
 * Create a middleware pipeline with common middlewares
 */
export function createPipeline(): MiddlewarePipeline {
  return new MiddlewarePipeline();
}
