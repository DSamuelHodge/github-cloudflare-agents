/**
 * RAG Quality Metrics Tracker
 * Monitors retrieval quality to help tune RAG parameters
 */

import type { RAGQualityMetrics } from '../../types/rag-config';
import { Logger } from '../../utils/logger';

interface MetricsSummary {
  totalQueries: number;
  averageRelevance: number;
  averageRetrievalTime: number;
  queriesWithResults: number;
  queriesWithoutResults: number;
  averageResultsPerQuery: number;
}

export class RAGMetricsTracker {
  private metrics: RAGQualityMetrics[] = [];
  private logger: Logger;
  
  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logger = new Logger(logLevel, { component: 'RAGMetricsTracker' });
  }
  
  /**
   * Record a RAG retrieval operation
   */
  trackRetrieval(metrics: RAGQualityMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only last 100 metrics to prevent memory bloat
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }
    
    this.logger.debug('RAG retrieval tracked', {
      queryId: metrics.queryId,
      resultsRetrieved: metrics.resultsRetrieved,
      averageRelevance: metrics.averageRelevanceScore.toFixed(3),
      retrievalTime: `${metrics.retrievalTimeMs}ms`,
    });
  }
  
  /**
   * Get summary statistics
   */
  getSummary(): MetricsSummary {
    if (this.metrics.length === 0) {
      return {
        totalQueries: 0,
        averageRelevance: 0,
        averageRetrievalTime: 0,
        queriesWithResults: 0,
        queriesWithoutResults: 0,
        averageResultsPerQuery: 0,
      };
    }
    
    const totalQueries = this.metrics.length;
    const queriesWithResults = this.metrics.filter(m => m.hasResults).length;
    const queriesWithoutResults = totalQueries - queriesWithResults;
    
    const totalRelevance = this.metrics.reduce((sum, m) => sum + m.averageRelevanceScore, 0);
    const averageRelevance = totalRelevance / totalQueries;
    
    const totalRetrievalTime = this.metrics.reduce((sum, m) => sum + m.retrievalTimeMs, 0);
    const averageRetrievalTime = totalRetrievalTime / totalQueries;
    
    const totalResults = this.metrics.reduce((sum, m) => sum + m.resultsAfterFiltering, 0);
    const averageResultsPerQuery = totalResults / totalQueries;
    
    return {
      totalQueries,
      averageRelevance,
      averageRetrievalTime,
      queriesWithResults,
      queriesWithoutResults,
      averageResultsPerQuery,
    };
  }
  
  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 10): RAGQualityMetrics[] {
    return this.metrics.slice(-limit);
  }
  
  /**
   * Get metrics for queries with no results (to identify gaps)
   */
  getFailedQueries(): RAGQualityMetrics[] {
    return this.metrics.filter(m => !m.hasResults);
  }
  
  /**
   * Get metrics with low relevance scores
   */
  getLowQualityQueries(threshold: number = 0.7): RAGQualityMetrics[] {
    return this.metrics.filter(m => m.hasResults && m.averageRelevanceScore < threshold);
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = [];
    this.logger.info('RAG metrics reset');
  }
}

// Global singleton instance
let globalRAGMetricsTracker: RAGMetricsTracker | null = null;

/**
 * Get or create global RAG metrics tracker
 */
export function getGlobalRAGMetricsTracker(): RAGMetricsTracker {
  if (!globalRAGMetricsTracker) {
    globalRAGMetricsTracker = new RAGMetricsTracker('info');
  }
  return globalRAGMetricsTracker;
}
