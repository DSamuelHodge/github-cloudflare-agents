/**
 * SolutionGenerator - Generates multiple AI solution variants
 * Phase 2.5: Creates diverse solutions for parallel testing
 */

import type { SolutionVariant } from '../../types/parallel';

/**
 * Solution generation strategies
 */
export interface SolutionStrategy {
  id: string;
  name: string;
  description: string;
  prompt: string;
  confidence: number;
  priority: number;
}

/**
 * Default solution strategies for diverse approaches
 */
export const DEFAULT_STRATEGIES: SolutionStrategy[] = [
  {
    id: 'minimal',
    name: 'Minimal Fix',
    description: 'Make the smallest possible change to fix the issue',
    prompt: 'Fix this issue with minimal code changes. Only modify what is absolutely necessary.',
    confidence: 80,
    priority: 1,
  },
  {
    id: 'conservative',
    name: 'Conservative Fix',
    description: 'Safe, well-tested approach following existing patterns',
    prompt: 'Fix this issue using conservative, well-established patterns. Prioritize safety and backwards compatibility.',
    confidence: 75,
    priority: 2,
  },
  {
    id: 'refactor',
    name: 'Refactoring Solution',
    description: 'Clean up the code while fixing the issue',
    prompt: 'Fix this issue and improve the code quality. Refactor if it makes the code cleaner.',
    confidence: 60,
    priority: 3,
  },
  {
    id: 'aggressive',
    name: 'Aggressive Fix',
    description: 'Comprehensive fix that addresses root cause',
    prompt: 'Fix this issue thoroughly, addressing the root cause even if it requires significant changes.',
    confidence: 50,
    priority: 4,
  },
];

/**
 * Issue context for solution generation
 */
export interface IssueContext {
  /** Issue title */
  title: string;
  
  /** Issue body/description */
  body: string;
  
  /** Error messages or stack traces */
  errorContext?: string;
  
  /** Relevant file paths */
  relevantFiles?: string[];
  
  /** Previous fix attempts */
  previousAttempts?: string[];
  
  /** Test file paths */
  testFiles?: string[];
}

/**
 * Solution Generator class
 */
export class SolutionGenerator {
  private strategies: SolutionStrategy[];
  private baseBranch: string;

  constructor(baseBranch: string = 'main', strategies?: SolutionStrategy[]) {
    this.baseBranch = baseBranch;
    this.strategies = strategies || DEFAULT_STRATEGIES;
  }

  /**
   * Generate solution variants for an issue
   */
  generateVariants(
    jobId: string,
    _issue: IssueContext,
    maxVariants: number = 3
  ): SolutionVariant[] {
    // Select top strategies by priority
    const selectedStrategies = this.strategies
      .sort((a, b) => a.priority - b.priority)
      .slice(0, maxVariants);

    return selectedStrategies.map((strategy, index) => ({
      solutionId: `solution-${String.fromCharCode(97 + index)}`, // 'solution-a', 'solution-b', etc.
      name: strategy.name,
      branch: `${this.baseBranch}-fix-${jobId}-${strategy.id}`,
      reasoning: strategy.description,
      confidence: strategy.confidence,
      strategy: strategy.id as SolutionVariant['strategy'],
    }));
  }

  /**
   * Create AI prompts for each solution variant
   */
  createPrompts(issue: IssueContext, variants: SolutionVariant[]): Map<string, string> {
    const prompts = new Map<string, string>();

    for (const variant of variants) {
      const strategy = this.strategies.find(s => s.id === variant.strategy);
      if (!strategy) continue;

      const prompt = this.buildPrompt(issue, strategy);
      prompts.set(variant.solutionId, prompt);
    }

    return prompts;
  }

  /**
   * Build AI prompt for a specific strategy
   */
  private buildPrompt(issue: IssueContext, strategy: SolutionStrategy): string {
    let prompt = `## Issue: ${issue.title}\n\n`;
    prompt += `${issue.body}\n\n`;
    
    if (issue.errorContext) {
      prompt += `## Error Context\n\`\`\`\n${issue.errorContext}\n\`\`\`\n\n`;
    }

    if (issue.relevantFiles && issue.relevantFiles.length > 0) {
      prompt += `## Relevant Files\n${issue.relevantFiles.map(f => `- ${f}`).join('\n')}\n\n`;
    }

    if (issue.testFiles && issue.testFiles.length > 0) {
      prompt += `## Test Files\n${issue.testFiles.map(f => `- ${f}`).join('\n')}\n\n`;
    }

    if (issue.previousAttempts && issue.previousAttempts.length > 0) {
      prompt += `## Previous Attempts (did not work)\n`;
      prompt += issue.previousAttempts.map((a, i) => `${i + 1}. ${a}`).join('\n');
      prompt += '\n\n';
    }

    prompt += `## Strategy: ${strategy.name}\n`;
    prompt += `${strategy.prompt}\n\n`;
    prompt += `## Instructions\n`;
    prompt += `1. Analyze the issue and understand the root cause\n`;
    prompt += `2. Apply the ${strategy.name} approach\n`;
    prompt += `3. Ensure all existing tests continue to pass\n`;
    prompt += `4. Provide a clear explanation of your changes\n`;

    return prompt;
  }

  /**
   * Add custom strategy
   */
  addStrategy(strategy: SolutionStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Get all strategies
   */
  getStrategies(): SolutionStrategy[] {
    return [...this.strategies];
  }
}
