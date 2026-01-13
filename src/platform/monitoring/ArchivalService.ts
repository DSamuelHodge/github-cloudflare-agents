/**
 * Archival Service
 * 
 * Moves old metrics from KV to R2 for long-term storage and cost optimization.
 * KV has 7-day retention, R2 provides unlimited historical data at lower cost.
 */

import type { MetricsCollector } from './MetricsCollector';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { AIProvider } from '../ai/gateway-client';
import type { AggregatedProviderMetrics, MetricsSummary } from '../../types/monitoring';
import { createLogger } from '../../utils/logger';

const logger = createLogger({});

/**
 * Archived metrics stored in R2
 */
export interface ArchivedMetrics {
  timestamp: number;
  date: string; // YYYY-MM-DD
  providerMetrics: Record<AIProvider, AggregatedProviderMetrics>;
  summary: MetricsSummary;
}

/**
 * Historical data query result
 */
export interface HistoricalDataResult {
  startDate: string;
  endDate: string;
  totalDays: number;
  data: ArchivedMetrics[];
}

/**
 * Archival configuration
 */
export interface ArchivalConfig {
  retentionDays: number; // How long to keep in KV before archiving
  r2BucketName: string;
  archivePrefix: string; // e.g., "metrics-archive/"
}

/**
 * Service for archiving metrics to R2
 */
export class ArchivalService {
  private readonly metricsCollector: MetricsCollector;
  private readonly r2Bucket: R2Bucket;
  private readonly config: ArchivalConfig;

  constructor(
    metricsCollector: MetricsCollector,
    r2Bucket: R2Bucket,
    config?: Partial<ArchivalConfig>
  ) {
    this.metricsCollector = metricsCollector;
    this.r2Bucket = r2Bucket;
    this.config = {
      retentionDays: config?.retentionDays || 7,
      r2BucketName: config?.r2BucketName || 'github-ai-agent-metrics',
      archivePrefix: config?.archivePrefix || 'metrics-archive/',
    };
  }

  /**
   * Archive metrics older than retention period
   * Should be called daily via Cloudflare Cron Trigger
   */
  async archiveMetrics(cutoffDate?: Date): Promise<{
    archived: number;
    failed: number;
    errors: string[];
  }> {
    try {
      const cutoff = cutoffDate || new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
      const cutoffDateStr = this.formatDate(cutoff);

      logger.info('Starting metrics archival', { cutoffDate: cutoffDateStr });

      let archived = 0;
      let failed = 0;
      const errors: string[] = [];

      // Get current metrics snapshot
      const summary = await this.metricsCollector.getAggregatedMetrics();
      const providers: AIProvider[] = ['gemini', 'huggingface', 'anthropic'];

      // Fetch provider metrics
      const providerMetrics: Partial<Record<AIProvider, AggregatedProviderMetrics>> = {};
      for (const provider of providers) {
        const metrics = await this.metricsCollector.getProviderMetrics(provider);
        if (metrics) {
          providerMetrics[provider] = metrics;
        }
      }

      // Create archived metrics object
      const archivedData: ArchivedMetrics = {
        timestamp: Date.now(),
        date: cutoffDateStr,
        providerMetrics: providerMetrics as Record<AIProvider, AggregatedProviderMetrics>,
        summary,
      };

      // Store in R2 with date-based key
      const key = this.generateArchiveKey(cutoff);
      try {
        await this.r2Bucket.put(key, JSON.stringify(archivedData), {
          httpMetadata: {
            contentType: 'application/json',
          },
          customMetadata: {
            archiveDate: cutoffDateStr,
            metricsCount: String(summary.totalRequests),
          },
        });
        archived++;
        logger.info('Archived metrics to R2', { key, date: cutoffDateStr });
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to archive ${cutoffDateStr}: ${errorMsg}`);
        logger.error('Failed to archive metrics', error instanceof Error ? error : undefined);
      }

      return { archived, failed, errors };
    } catch (error) {
      logger.error('Archival process failed', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get historical metrics data from R2
   */
  async getHistoricalData(startDate: Date, endDate: Date): Promise<HistoricalDataResult> {
    try {
      const start = this.formatDate(startDate);
      const end = this.formatDate(endDate);

      logger.info('Fetching historical data', { startDate: start, endDate: end });

      const data: ArchivedMetrics[] = [];
      const currentDate = new Date(startDate);

      // Iterate through date range (use UTC to avoid timezone issues)
      while (currentDate <= endDate) {
        const key = this.generateArchiveKey(currentDate);
        const object = await this.r2Bucket.get(key);

        if (object) {
          const content = await object.text();
          const archived = JSON.parse(content) as ArchivedMetrics;
          data.push(archived);
        }

        // Move to next day (UTC)
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        startDate: start,
        endDate: end,
        totalDays,
        data,
      };
    } catch (error) {
      logger.error('Failed to fetch historical data', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get metrics for a specific date
   */
  async getMetricsForDate(date: Date): Promise<ArchivedMetrics | null> {
    try {
      const key = this.generateArchiveKey(date);
      const object = await this.r2Bucket.get(key);

      if (!object) {
        return null;
      }

      const content = await object.text();
      return JSON.parse(content) as ArchivedMetrics;
    } catch (error) {
      logger.error('Failed to get metrics for date', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Purge archived metrics older than specified days
   */
  async purgeExpired(retentionDays: number): Promise<{
    deleted: number;
    failed: number;
    errors: string[];
  }> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      logger.info('Purging expired archives', { cutoffDate: this.formatDate(cutoffDate), retentionDays });

      let deleted = 0;
      let failed = 0;
      const errors: string[] = [];

      // List all archived objects
      const listed = await this.r2Bucket.list({ prefix: this.config.archivePrefix });

      for (const object of listed.objects) {
        // Extract date from key
        const dateMatch = object.key.match(/(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) continue;

        const objectDate = new Date(dateMatch[1]);
        if (objectDate < cutoffDate) {
          try {
            await this.r2Bucket.delete(object.key);
            deleted++;
            logger.info('Deleted expired archive', { key: object.key });
          } catch (error) {
            failed++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Failed to delete ${object.key}: ${errorMsg}`);
            logger.error('Failed to delete expired archive', error instanceof Error ? error : undefined);
          }
        }
      }

      return { deleted, failed, errors };
    } catch (error) {
      logger.error('Purge process failed', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get archive statistics
   */
  async getArchiveStats(): Promise<{
    totalArchives: number;
    oldestDate: string | null;
    newestDate: string | null;
    totalSizeBytes: number;
  }> {
    try {
      const listed = await this.r2Bucket.list({ prefix: this.config.archivePrefix });

      if (listed.objects.length === 0) {
        return {
          totalArchives: 0,
          oldestDate: null,
          newestDate: null,
          totalSizeBytes: 0,
        };
      }

      const dates: string[] = [];
      let totalSize = 0;

      for (const object of listed.objects) {
        const dateMatch = object.key.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          dates.push(dateMatch[1]);
        }
        totalSize += object.size;
      }

      dates.sort();

      return {
        totalArchives: listed.objects.length,
        oldestDate: dates[0] || null,
        newestDate: dates[dates.length - 1] || null,
        totalSizeBytes: totalSize,
      };
    } catch (error) {
      logger.error('Failed to get archive stats', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Generate R2 key for archived metrics
   */
  private generateArchiveKey(date: Date): string {
    const dateStr = this.formatDate(date);
    return `${this.config.archivePrefix}${dateStr}.json`;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get date range for aggregated queries
   */
  async getAggregatedMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    providerAggregates: Record<AIProvider, {
      totalRequests: number;
      totalSuccess: number;
      totalFailure: number;
      averageLatency: number;
      successRate: number;
    }>;
    overallSuccessRate: number;
    totalRequests: number;
  }> {
    const historical = await this.getHistoricalData(startDate, endDate);

    const providerAggregates: Record<string, {
      totalRequests: number;
      totalSuccess: number;
      totalFailure: number;
      totalLatency: number;
      averageLatency: number;
      successRate: number;
    }> = {
      gemini: { totalRequests: 0, totalSuccess: 0, totalFailure: 0, totalLatency: 0, averageLatency: 0, successRate: 0 },
      huggingface: { totalRequests: 0, totalSuccess: 0, totalFailure: 0, totalLatency: 0, averageLatency: 0, successRate: 0 },
      anthropic: { totalRequests: 0, totalSuccess: 0, totalFailure: 0, totalLatency: 0, averageLatency: 0, successRate: 0 },
    };

    let totalRequests = 0;
    let totalSuccess = 0;

    for (const archived of historical.data) {
      for (const [provider, metrics] of Object.entries(archived.providerMetrics)) {
        const agg = providerAggregates[provider];
        if (agg) {
          agg.totalRequests += metrics.requestsTotal;
          agg.totalSuccess += metrics.requestsSuccess;
          agg.totalFailure += metrics.requestsFailure;
          agg.totalLatency += metrics.latencyAvg * metrics.requestsTotal;
        }
      }

      totalRequests += archived.summary.totalRequests;
      totalSuccess += archived.summary.totalRequests * archived.summary.overallSuccessRate;
    }

    // Calculate averages
    for (const agg of Object.values(providerAggregates)) {
      if (agg.totalRequests > 0) {
        agg.averageLatency = agg.totalLatency / agg.totalRequests;
        agg.successRate = agg.totalSuccess / agg.totalRequests;
      }
    }

    const overallSuccessRate = totalRequests > 0 ? totalSuccess / totalRequests : 0;

    return {
      providerAggregates: providerAggregates as Record<AIProvider, {
        totalRequests: number;
        totalSuccess: number;
        totalFailure: number;
        averageLatency: number;
        successRate: number;
      }>,
      overallSuccessRate,
      totalRequests,
    };
  }
}
