/**
 * Issue Responder Agent Configuration
 */

export interface IssueResponderConfig {
  enabled: boolean;
  priority?: number;
  timeoutMs?: number;
  
  // Agent-specific config
  targetLabels: string[];
  targetRepo?: string;
  maxResponseTokens?: number;
  temperature?: number;
}

export const defaultConfig: IssueResponderConfig = {
  enabled: true,
  priority: 100,
  timeoutMs: 30000,
  targetLabels: ['help', 'bug'],
  maxResponseTokens: 2000,
  temperature: 0.7,
};
