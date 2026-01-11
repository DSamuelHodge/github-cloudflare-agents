/**
 * Configuration for ContainerTestAgent
 */

import type { AgentConfig } from '../../types/agents';

export const containerTestAgentConfig: AgentConfig = {
  enabled: true,
  priority: 50, // Medium priority
  timeout: 600000, // 10 minutes (allows for long-running tests)
  retryAttempts: 1, // Retry once on failure
  retryDelayMs: 5000, // 5 second delay before retry
};
