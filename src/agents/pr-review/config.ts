/**
 * PR Review Agent Configuration
 * Phase 3.5: Automated PR code review
 */

import type { AgentConfig } from '../../types/agents';

export const PR_REVIEW_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  priority: 60, // Between triaging (50) and issue responder (100)
  timeoutMs: 25000, // 25 seconds (leave buffer for PR creation)
};

/**
 * Review focus areas
 */
export const REVIEW_FOCUS_AREAS = ['security', 'performance', 'bugs', 'best-practices', 'style'] as const;

export type ReviewFocusArea = typeof REVIEW_FOCUS_AREAS[number];

/**
 * Review severity levels
 */
export const REVIEW_SEVERITIES = ['info', 'warning', 'error'] as const;

export type ReviewSeverity = typeof REVIEW_SEVERITIES[number];

/**
 * Maximum files to analyze per PR (to avoid timeout)
 */
export const MAX_FILES_PER_REVIEW = 20;

/**
 * Maximum lines to analyze per file
 */
export const MAX_LINES_PER_FILE = 1000;
