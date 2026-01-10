/**
 * Metrics collection for monitoring agent performance
 */

import type { AgentMetrics } from '../types/agents';

export interface MetricData {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'timing';
  tags?: Record<string, string>;
  timestamp: Date;
}

export class Metrics implements AgentMetrics {
  private metrics: MetricData[] = [];
  private defaultTags: Record<string, string>;
  
  constructor(defaultTags: Record<string, string> = {}) {
    this.defaultTags = defaultTags;
  }
  
  private record(
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'timing',
    tags?: Record<string, string>
  ): void {
    const metric: MetricData = {
      name,
      value,
      type,
      tags: { ...this.defaultTags, ...tags },
      timestamp: new Date(),
    };
    
    this.metrics.push(metric);
    
    // Log metric for observability
    console.log(JSON.stringify({
      metric: name,
      value,
      type,
      tags: metric.tags,
    }));
  }
  
  /**
   * Increment a counter metric
   */
  increment(metric: string, value: number = 1, tags?: Record<string, string>): void {
    this.record(metric, value, 'counter', tags);
  }
  
  /**
   * Set a gauge metric
   */
  gauge(metric: string, value: number, tags?: Record<string, string>): void {
    this.record(metric, value, 'gauge', tags);
  }
  
  /**
   * Record a timing metric (in milliseconds)
   */
  timing(metric: string, value: number, tags?: Record<string, string>): void {
    this.record(metric, value, 'timing', tags);
  }
  
  /**
   * Get all collected metrics
   */
  getMetrics(): MetricData[] {
    return [...this.metrics];
  }
  
  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
  
  /**
   * Create a child metrics instance with additional default tags
   */
  child(tags: Record<string, string>): Metrics {
    return new Metrics({ ...this.defaultTags, ...tags });
  }
}

/**
 * Create a metrics instance from environment
 */
export function createMetrics(context?: Record<string, string>): Metrics {
  return new Metrics(context);
}
