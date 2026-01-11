/**
 * Types for Pull Request automation workflow
 * Phase 2.6: Automated PR Workflow
 */

import type { SolutionVariant, ParallelTestResult } from './parallel';

/**
 * Pull Request creation options
 */
export interface PRCreationOptions {
  /** Repository owner */
  owner: string;
  
  /** Repository name */
  repo: string;
  
  /** Base branch to merge into */
  baseBranch: string;
  
  /** Head branch with changes */
  headBranch: string;
  
  /** PR title */
  title: string;
  
  /** PR body/description */
  body: string;
  
  /** Create as draft PR */
  draft?: boolean;
  
  /** Labels to add */
  labels?: string[];
  
  /** Reviewers to request */
  reviewers?: string[];
  
  /** Related issue number */
  issueNumber?: number;
}

/**
 * Created Pull Request result
 */
export interface CreatedPR {
  /** PR number */
  number: number;
  
  /** PR URL */
  url: string;
  
  /** PR state */
  state: 'open' | 'closed' | 'merged';
  
  /** Head branch */
  headBranch: string;
  
  /** Base branch */
  baseBranch: string;
  
  /** Created timestamp */
  createdAt: Date;
}

/**
 * PR workflow job - tracks the full automation flow
 */
export interface PRWorkflowJob {
  /** Job ID */
  jobId: string;
  
  /** Related issue number (if any) */
  issueNumber?: number;
  
  /** Solution being proposed */
  solution: SolutionVariant;
  
  /** Test results */
  testResults?: ParallelTestResult;
  
  /** Created PR (if any) */
  createdPR?: CreatedPR;
  
  /** Workflow status */
  status: PRWorkflowStatus;
  
  /** Error message if failed */
  error?: string;
  
  /** GitHub context */
  context: {
    owner: string;
    repo: string;
  };
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Completed timestamp */
  completedAt?: Date;
}

/**
 * PR workflow status
 */
export type PRWorkflowStatus =
  | 'pending'          // Waiting to start
  | 'testing'          // Running tests
  | 'creating-branch'  // Creating feature branch
  | 'creating-pr'      // Creating pull request
  | 'adding-labels'    // Adding labels to PR
  | 'posting-summary'  // Posting test summary comment
  | 'completed'        // Successfully completed
  | 'failed';          // Failed at some step

/**
 * Branch cleanup options
 */
export interface BranchCleanupOptions {
  /** Repository owner */
  owner: string;
  
  /** Repository name */
  repo: string;
  
  /** Branch names to clean up */
  branches: string[];
  
  /** Only delete if merged */
  onlyMerged?: boolean;
  
  /** Skip branches matching pattern */
  skipPatterns?: string[];
}

/**
 * Branch cleanup result
 */
export interface BranchCleanupResult {
  /** Branches successfully deleted */
  deleted: string[];
  
  /** Branches that failed to delete */
  failed: Array<{ branch: string; error: string }>;
  
  /** Branches skipped (protected/unmerged) */
  skipped: Array<{ branch: string; reason: string }>;
}

/**
 * PR summary for GitHub comment
 */
export interface PRSummary {
  /** Solution ID */
  solutionId: string;
  
  /** Solution name */
  solutionName: string;
  
  /** Solution strategy */
  strategy: string;
  
  /** Test pass rate */
  passRate: number;
  
  /** Tests passed/total */
  testStats: {
    passed: number;
    failed: number;
    total: number;
  };
  
  /** Execution duration */
  durationMs: number;
  
  /** Coverage (if available) */
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  
  /** AI reasoning */
  reasoning: string;
  
  /** Confidence score */
  confidence: number;
  
  /** Artifact URLs */
  artifactUrls?: string[];
}

/**
 * PR agent configuration
 */
export interface PRAgentConfig {
  /** Auto-create PR for winning solution */
  autoCreatePR: boolean;
  
  /** Create PR as draft */
  createAsDraft: boolean;
  
  /** Auto-add labels */
  autoLabels: string[];
  
  /** Auto-request reviewers */
  autoReviewers?: string[];
  
  /** Link to related issue */
  linkToIssue: boolean;
  
  /** Clean up test branches after PR creation */
  cleanupBranches: boolean;
  
  /** Minimum pass rate to create PR (0-100) */
  minPassRateForPR: number;
  
  /** Minimum confidence to create PR (0-100) */
  minConfidenceForPR: number;
}

/**
 * Default PR agent configuration
 */
export const DEFAULT_PR_AGENT_CONFIG: PRAgentConfig = {
  autoCreatePR: true,
  createAsDraft: true,
  autoLabels: ['ai-generated', 'needs-review'],
  autoReviewers: undefined,
  linkToIssue: true,
  cleanupBranches: true,
  minPassRateForPR: 100,
  minConfidenceForPR: 50,
};
