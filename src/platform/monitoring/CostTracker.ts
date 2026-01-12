/**
 * Cost tracking service for AI operations
 */

import { Logger } from '../../utils/logger';

/**
 * Gemini API Pricing (as of January 2026)
 * Source: https://ai.google.dev/pricing
 */
export const GEMINI_PRICING = {
  // Gemini 2.0 Flash (chat completions)
  'gemini-2.0-flash': {
    input: 0.075 / 1_000_000,  // $0.075 per 1M tokens
    output: 0.30 / 1_000_000,  // $0.30 per 1M tokens
  },
  
  // Text Embedding 004
  'text-embedding-004': {
    input: 0.00001 / 1_000,  // $0.00001 per 1K tokens
    output: 0,  // No output tokens for embeddings
  },
} as const;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUSD: number;
  outputCostUSD: number;
  totalCostUSD: number;
  timestamp: string;
}

export interface CostSummary {
  totalOperations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  breakdownByOperation: Record<string, {
    count: number;
    tokens: number;
    costUSD: number;
  }>;
}

export class CostTracker {
  private logger: Logger;
  private costs: CostBreakdown[] = [];
  
  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logger = new Logger(logLevel, { component: 'CostTracker' });
  }
  
  /**
   * Calculate cost for token usage
   */
  calculateCost(
    model: string,
    usage: TokenUsage
  ): { inputCost: number; outputCost: number; totalCost: number } {
    const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING];
    
    if (!pricing) {
      this.logger.warn(`Unknown model pricing: ${model}, using default`);
      // Use Gemini Flash pricing as default
      const defaultPricing = GEMINI_PRICING['gemini-2.0-flash'];
      const inputCost = usage.inputTokens * defaultPricing.input;
      const outputCost = usage.outputTokens * defaultPricing.output;
      return {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
      };
    }
    
    const inputCost = usage.inputTokens * pricing.input;
    const outputCost = usage.outputTokens * pricing.output;
    
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }
  
  /**
   * Track an AI operation cost
   */
  trackOperation(
    operation: string,
    model: string,
    usage: TokenUsage
  ): CostBreakdown {
    const { inputCost, outputCost, totalCost } = this.calculateCost(model, usage);
    
    const breakdown: CostBreakdown = {
      operation,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputCostUSD: inputCost,
      outputCostUSD: outputCost,
      totalCostUSD: totalCost,
      timestamp: new Date().toISOString(),
    };
    
    this.costs.push(breakdown);
    
    this.logger.info('AI operation cost tracked', {
      operation,
      model,
      tokens: usage.totalTokens,
      costUSD: totalCost.toFixed(6),
    });
    
    return breakdown;
  }
  
  /**
   * Get cost summary
   */
  getSummary(): CostSummary {
    const summary: CostSummary = {
      totalOperations: this.costs.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUSD: 0,
      breakdownByOperation: {},
    };
    
    for (const cost of this.costs) {
      summary.totalInputTokens += cost.inputTokens;
      summary.totalOutputTokens += cost.outputTokens;
      summary.totalCostUSD += cost.totalCostUSD;
      
      if (!summary.breakdownByOperation[cost.operation]) {
        summary.breakdownByOperation[cost.operation] = {
          count: 0,
          tokens: 0,
          costUSD: 0,
        };
      }
      
      const opSummary = summary.breakdownByOperation[cost.operation];
      opSummary.count++;
      opSummary.tokens += cost.inputTokens + cost.outputTokens;
      opSummary.costUSD += cost.totalCostUSD;
    }
    
    return summary;
  }
  
  /**
   * Get recent operations
   */
  getRecentOperations(limit: number = 10): CostBreakdown[] {
    return this.costs.slice(-limit);
  }
  
  /**
   * Reset cost tracking
   */
  reset(): void {
    this.costs = [];
    this.logger.debug('Cost tracking reset');
  }
}

/**
 * Global cost tracker instance (per-isolate)
 */
let globalCostTracker: CostTracker | null = null;

export function getGlobalCostTracker(): CostTracker {
  if (!globalCostTracker) {
    globalCostTracker = new CostTracker('info');
  }
  return globalCostTracker;
}
