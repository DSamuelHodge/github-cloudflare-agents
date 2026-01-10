/**
 * Abstract base class for all agents
 * Provides lifecycle hooks and common functionality
 */

import type { IAgent, AgentContext, AgentResult, AgentConfig } from '../../types/agents';
import { validateAgentConfig } from './AgentConfig';

export abstract class BaseAgent implements IAgent {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly triggers: string[];
  readonly config: AgentConfig;
  
  constructor(config: AgentConfig) {
    validateAgentConfig(config);
    this.config = config;
  }
  
  /**
   * Check if this agent should handle the given event
   * Override this method to implement custom logic
   */
  async shouldHandle(context: AgentContext): Promise<boolean> {
    // Check if agent is enabled
    if (!this.config.enabled) {
      context.logger.debug(`Agent ${this.name} is disabled`, { agent: this.name });
      return false;
    }
    
    // Check if event type matches triggers
    if (!this.triggers.includes(context.eventType)) {
      context.logger.debug(`Agent ${this.name} does not handle event type ${context.eventType}`, {
        agent: this.name,
        eventType: context.eventType,
        triggers: this.triggers,
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * Execute the agent logic
   * Must be implemented by concrete agents
   */
  abstract execute(context: AgentContext): Promise<AgentResult>;
  
  /**
   * Run the agent with full lifecycle
   */
  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    
    try {
      // Check if agent should handle this event
      const should = await this.shouldHandle(context);
      if (!should) {
        return {
          success: true,
          agentName: this.name,
          action: 'skipped',
          metadata: {
            reason: 'Agent chose not to handle this event',
          },
        };
      }
      
      // Call beforeExecute hook
      if (this.beforeExecute) {
        await this.beforeExecute(context);
      }
      
      // Execute with timeout
      const result = await this.executeWithTimeout(context);
      
      // Record metrics
      const executionTime = Date.now() - startTime;
      context.metrics.timing('agent.execution_time', executionTime, {
        agent: this.name,
        success: result.success.toString(),
      });
      
      // Add execution time to result
      result.metadata = {
        ...result.metadata,
        executionTimeMs: executionTime,
      };
      
      // Call afterExecute hook
      if (this.afterExecute) {
        await this.afterExecute(context, result);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      context.metrics.increment('agent.error', 1, { agent: this.name });
      
      context.logger.error(`Agent ${this.name} failed`, error as Error, {
        agent: this.name,
        executionTimeMs: executionTime,
      });
      
      // Call onError hook if defined
      if (this.onError) {
        return await this.onError(context, error as Error);
      }
      
      // Default error handling
      return {
        success: false,
        agentName: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          executionTimeMs: executionTime,
        },
      };
    }
  }
  
  /**
   * Execute agent with timeout protection
   */
  private async executeWithTimeout(context: AgentContext): Promise<AgentResult> {
    const timeoutMs = this.config.timeoutMs || 30000;
    
    return Promise.race([
      this.execute(context),
      new Promise<AgentResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent ${this.name} timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
  
  /**
   * Lifecycle hook: called before agent execution
   */
  beforeExecute?(context: AgentContext): Promise<void>;
  
  /**
   * Lifecycle hook: called after agent execution
   */
  afterExecute?(context: AgentContext, result: AgentResult): Promise<void>;
  
  /**
   * Lifecycle hook: handle errors during execution
   */
  onError?(context: AgentContext, error: Error): Promise<AgentResult>;
  
  /**
   * Helper: Create a success result
   */
  protected createSuccessResult(action: string, data?: Record<string, unknown>): AgentResult {
    return {
      success: true,
      agentName: this.name,
      action,
      data,
    };
  }
  
  /**
   * Helper: Create an error result
   */
  protected createErrorResult(error: string, data?: Record<string, unknown>): AgentResult {
    return {
      success: false,
      agentName: this.name,
      error,
      data,
    };
  }
}
