/**
 * Agent configuration management
 */

import type { AgentConfig } from '../../types/agents';

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  priority: 100,
  timeoutMs: 30000, // 30 seconds
};

/**
 * Agent configuration builder
 */
export class AgentConfigBuilder {
  private config: AgentConfig;
  
  constructor(baseConfig: Partial<AgentConfig> = {}) {
    this.config = {
      ...DEFAULT_AGENT_CONFIG,
      ...baseConfig,
    };
  }
  
  setEnabled(enabled: boolean): this {
    this.config.enabled = enabled;
    return this;
  }
  
  setPriority(priority: number): this {
    this.config.priority = priority;
    return this;
  }
  
  setTimeout(timeoutMs: number): this {
    this.config.timeoutMs = timeoutMs;
    return this;
  }
  
  setCustom(key: string, value: unknown): this {
    this.config[key] = value;
    return this;
  }
  
  build(): AgentConfig {
    return { ...this.config };
  }
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: AgentConfig): void {
  if (typeof config.enabled !== 'boolean') {
    throw new Error('Agent config: enabled must be a boolean');
  }
  
  if (config.priority !== undefined && (typeof config.priority !== 'number' || config.priority < 0)) {
    throw new Error('Agent config: priority must be a non-negative number');
  }
  
  if (config.timeoutMs !== undefined && (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0)) {
    throw new Error('Agent config: timeoutMs must be a positive number');
  }
}
