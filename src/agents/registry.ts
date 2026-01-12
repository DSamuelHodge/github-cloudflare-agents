/**
 * Agent Registry - manages agent registration and execution routing
 */

import type { IAgent, AgentContext, AgentResult, AgentRegistration } from '../types/agents';
import { IssueResponderAgent } from './issue-responder/agent';
import { ContainerTestAgent } from './container-test/agent';
import { PRAgent } from './pr-agent/agent';

export class AgentRegistry {
  private agents: Map<string, AgentRegistration> = new Map();
  
  /**
   * Initialize registry with built-in agents
   */
  initialize(): void {
    // Register IssueResponderAgent
    this.register(new IssueResponderAgent());
    
    // Register ContainerTestAgent
    this.register(new ContainerTestAgent());
    
    // Register PRAgent (Phase 2.6)
    this.register(new PRAgent());
  }
  
  /**
   * Register an agent
   */
  register(agent: IAgent, _config?: Record<string, unknown>): void {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent ${agent.name} is already registered`);
    }
    
    const registration: AgentRegistration = {
      agent,
      config: agent.config,
      createdAt: new Date(),
    };
    
    this.agents.set(agent.name, registration);
    console.log(`[AgentRegistry] Registered agent: ${agent.name} v${agent.version}`);
  }
  
  /**
   * Unregister an agent
   */
  unregister(agentName: string): boolean {
    const removed = this.agents.delete(agentName);
    if (removed) {
      console.log(`[AgentRegistry] Unregistered agent: ${agentName}`);
    }
    return removed;
  }
  
  /**
   * Get an agent by name
   */
  getAgent(agentName: string): IAgent | undefined {
    return this.agents.get(agentName)?.agent;
  }
  
  /**
   * Get all registered agents
   */
  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values()).map(reg => reg.agent);
  }
  
  /**
   * Find agents that can handle a specific event
   */
  async findHandlers(context: AgentContext): Promise<IAgent[]> {
    const handlers: Array<{ agent: IAgent; priority: number }> = [];
    
    for (const registration of this.agents.values()) {
      const { agent } = registration;
      
      try {
        const canHandle = await agent.shouldHandle(context);
        if (canHandle) {
          const priority = agent.config.priority || 100;
          handlers.push({ agent, priority });
        }
      } catch (error) {
        context.logger.error(`Error checking if agent ${agent.name} can handle event`, error as Error);
      }
    }
    
    // Sort by priority (higher first)
    handlers.sort((a, b) => b.priority - a.priority);
    
    return handlers.map(h => h.agent);
  }
  
  /**
   * Execute all agents that can handle the event
   */
  async executeAll(context: AgentContext): Promise<AgentResult[]> {
    const handlers = await this.findHandlers(context);
    
    if (handlers.length === 0) {
      context.logger.info('No agents found to handle event', {
        eventType: context.eventType,
        registeredAgents: Array.from(this.agents.keys()),
      });
      return [];
    }
    
    context.logger.info(`Executing ${handlers.length} agent(s)`, {
      agents: handlers.map(a => a.name),
    });
    
    const results: AgentResult[] = [];
    
    for (const agent of handlers) {
      try {
        context.logger.info(`Executing agent: ${agent.name}`);
        const result = await agent.run(context);
        results.push(result);
        
        context.metrics.increment('agent.executed', 1, {
          agent: agent.name,
          success: result.success.toString(),
        });
      } catch (error) {
        context.logger.error(`Agent ${agent.name} threw unhandled error`, error as Error);
        
        results.push({
          success: false,
          agentName: agent.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        context.metrics.increment('agent.unhandled_error', 1, {
          agent: agent.name,
        });
      }
    }
    
    return results;
  }
  
  /**
   * Execute a specific agent by name
   */
  async executeAgent(agentName: string, context: AgentContext): Promise<AgentResult> {
    const registration = this.agents.get(agentName);
    
    if (!registration) {
      const error = `Agent ${agentName} not found`;
      context.logger.error(error);
      return {
        success: false,
        agentName,
        error,
      };
    }
    
    try {
      return await registration.agent.run(context);
    } catch (error) {
      context.logger.error(`Agent ${agentName} threw unhandled error`, error as Error);
      return {
        success: false,
        agentName,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    enabledAgents: number;
    disabledAgents: number;
    agentsByTrigger: Record<string, string[]>;
  } {
    const agents = Array.from(this.agents.values());
    const enabled = agents.filter(a => a.config.enabled);
    const disabled = agents.filter(a => !a.config.enabled);
    
    // Group agents by trigger
    const byTrigger: Record<string, string[]> = {};
    for (const registration of agents) {
      for (const trigger of registration.agent.triggers) {
        if (!byTrigger[trigger]) {
          byTrigger[trigger] = [];
        }
        byTrigger[trigger].push(registration.agent.name);
      }
    }
    
    return {
      totalAgents: agents.length,
      enabledAgents: enabled.length,
      disabledAgents: disabled.length,
      agentsByTrigger: byTrigger,
    };
  }
}

/**
 * Global agent registry instance
 */
export const globalRegistry = new AgentRegistry();
