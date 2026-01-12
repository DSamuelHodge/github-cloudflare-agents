/**
 * Configuration for PRAgent
 * Phase 2.6: Automated PR Workflow
 */

import type { AgentConfig } from '../../types/agents';
import type { PRAgentConfig } from '../../types/pr-workflow';

export interface FullPRAgentConfig extends AgentConfig, PRAgentConfig {}

export const prAgentConfig: AgentConfig = {
  enabled: true,
  priority: 60, // Higher priority than container-test (50)
  timeout: 300000, // 5 minutes
  retryAttempts: 2,
  retryDelayMs: 3000,
};

export const defaultPRAgentConfig: FullPRAgentConfig = {
  ...prAgentConfig,
  autoCreatePR: true,
  createAsDraft: true,
  autoLabels: ['ai-generated', 'needs-review'],
  autoReviewers: undefined,
  linkToIssue: true,
  cleanupBranches: true,
  minPassRateForPR: 100,
  minConfidenceForPR: 50,
};
