/**
 * Triaging Agent Configuration
 * Phase 3.4: Automated issue triaging
 */

import type { AgentConfig } from '../../types/agents';

export const TRIAGING_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  priority: 50, // Lower priority than IssueResponder (100)
  timeout: 15000, // 15 seconds
  retries: 1,
};

/**
 * Default triaging classifications
 */
export const DEFAULT_CLASSIFICATIONS = {
  labels: [
    'bug',
    'enhancement',
    'question',
    'documentation',
    'needs-more-info',
    'confirmed-bug',
    'duplicate',
    'wontfix',
  ],
  severity: ['critical', 'high', 'medium', 'low'],
  categories: ['feature-request', 'bug-report', 'support', 'documentation'],
};
