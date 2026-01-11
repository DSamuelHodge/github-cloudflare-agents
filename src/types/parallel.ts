/**
 * Parallel test execution types
 * Phase 2.5: Parallel Multi-Solution Testing
 */

import type { TestJob, TestResult } from './containers';

/**
 * Solution variant for parallel testing
 * Each solution represents a different AI-generated fix
 */
export interface SolutionVariant {
  /** Unique solution identifier (e.g., 'solution-a', 'solution-b') */
  solutionId: string;
  
  /** Human-readable name */
  name: string;
  
  /** Branch name for this solution */
  branch: string;
  
  /** AI-generated code changes (patch/diff) */
  patch?: string;
  
  /** AI reasoning for this solution approach */
  reasoning: string;
  
  /** Estimated confidence score (0-100) */
  confidence: number;
  
  /** Solution strategy type */
  strategy: 'conservative' | 'aggressive' | 'refactor' | 'minimal';
}

/**
 * Parallel test job - spawns multiple containers
 */
export interface ParallelTestJob {
  /** Parent job ID */
  jobId: string;
  
  /** Solutions to test in parallel */
  solutions: SolutionVariant[];
  
  /** Test command to run on each solution */
  testCommand: string;
  
  /** Timeout per solution (ms) */
  timeoutMs: number;
  
  /** GitHub context */
  context: {
    owner: string;
    repo: string;
    issueNumber?: number;
    prNumber?: number;
  };
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Maximum concurrent containers */
  maxConcurrency: number;
}

/**
 * Result from a single solution test
 */
export interface SolutionTestResult extends TestResult {
  /** Reference to solution variant */
  solutionId: string;
  
  /** Solution-specific metrics */
  metrics: {
    /** Test pass rate (0-100) */
    passRate: number;
    
    /** Number of tests passed */
    testsPassed: number;
    
    /** Number of tests failed */
    testsFailed: number;
    
    /** Number of tests skipped */
    testsSkipped: number;
    
    /** Total tests run */
    totalTests: number;
  };
  
  /** Performance metrics */
  performance?: {
    /** Average test execution time (ms) */
    avgTestTimeMs: number;
    
    /** Memory usage (MB) */
    memoryUsageMb?: number;
  };
}

/**
 * Aggregated result from parallel test execution
 */
export interface ParallelTestResult {
  /** Parent job ID */
  jobId: string;
  
  /** Individual solution results */
  results: SolutionTestResult[];
  
  /** Winning solution (if any) */
  winner?: {
    solutionId: string;
    reason: string;
    score: number;
  };
  
  /** Ranking of all solutions */
  ranking: Array<{
    solutionId: string;
    score: number;
    rank: number;
  }>;
  
  /** Aggregated statistics */
  summary: {
    /** Number of solutions tested */
    solutionsTested: number;
    
    /** Number of solutions that passed all tests */
    solutionsPassed: number;
    
    /** Number of solutions that failed */
    solutionsFailed: number;
    
    /** Total execution time (ms) */
    totalDurationMs: number;
    
    /** Average execution time per solution (ms) */
    avgDurationMs: number;
  };
  
  /** Completion timestamp */
  completedAt: Date;
}

/**
 * Scoring weights for solution comparison
 */
export interface ScoringWeights {
  /** Weight for test pass rate (0-1) */
  passRate: number;
  
  /** Weight for code coverage (0-1) */
  coverage: number;
  
  /** Weight for execution speed (0-1) */
  speed: number;
  
  /** Weight for AI confidence score (0-1) */
  confidence: number;
}

/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  passRate: 0.5,    // 50% weight on test pass rate
  coverage: 0.2,    // 20% weight on code coverage
  speed: 0.1,       // 10% weight on execution speed
  confidence: 0.2,  // 20% weight on AI confidence
};

/**
 * Container allocation strategy for parallel execution
 */
export type AllocationStrategy = 
  | 'round-robin'    // Distribute evenly across instances
  | 'random'         // Random instance selection (load-balanced)
  | 'dedicated';     // One container per solution

/**
 * Parallel execution configuration
 */
export interface ParallelExecutionConfig {
  /** Maximum number of concurrent containers */
  maxConcurrency: number;
  
  /** Container allocation strategy */
  allocationStrategy: AllocationStrategy;
  
  /** Scoring weights for solution comparison */
  scoringWeights: ScoringWeights;
  
  /** Whether to stop on first passing solution */
  stopOnFirstPass: boolean;
  
  /** Timeout for entire parallel job (ms) */
  totalTimeoutMs: number;
}

/**
 * Default parallel execution config
 */
export const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  maxConcurrency: 3,
  allocationStrategy: 'random',
  scoringWeights: DEFAULT_SCORING_WEIGHTS,
  stopOnFirstPass: false,
  totalTimeoutMs: 600000, // 10 minutes
};
