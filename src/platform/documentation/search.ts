/**
 * Vector similarity search for documentation retrieval
 */

import type { DocumentChunk, DocumentSearchQuery, DocumentSearchResult } from '../../types/documentation';
import type { SearchConfig } from '../../types/rag-config';
import { getEmbedding } from './embeddings';
import { Logger } from '../../utils/logger';
import { getGlobalRAGMetricsTracker } from '../monitoring/RAGMetrics';
import type { RAGQualityMetrics } from '../../types/rag-config';

export class DocumentSearchService {
  private logger: Logger;
  private metricsTracker = getGlobalRAGMetricsTracker();
  
  constructor(
    private r2Bucket: R2Bucket,
    private kvNamespace: KVNamespace,
    private searchConfig?: SearchConfig,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.logger = new Logger(logLevel, { component: 'DocumentSearchService' });
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
  
  /**
   * List all embeddings for a repository
   */
  private async listEmbeddings(owner: string, repo: string): Promise<string[]> {
    const prefix = `embedding:${owner}/${repo}/`;
    const list = await this.kvNamespace.list({ prefix });
    
    return list.keys.map(key => key.name.replace('embedding:', ''));
  }
  
  /**
   * Get chunk from R2 storage
   */
  private async getChunk(chunkId: string, owner: string, repo: string): Promise<DocumentChunk | null> {
    try {
      // Chunk is stored at: docs/{owner}/{repo}/{sha}/{chunkId}.json
      const listResult = await this.r2Bucket.list({
        prefix: `docs/${owner}/${repo}/`,
      });
      
      // Find matching chunk by ID
      for (const obj of listResult.objects) {
        if (obj.key.includes(chunkId)) {
          const object = await this.r2Bucket.get(obj.key);
          if (object) {
            const chunk = await object.json() as DocumentChunk;
            return chunk;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`Failed to retrieve chunk: ${chunkId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  
  /**
   * Search for relevant documentation chunks
   */
  async search(
    queryEmbedding: number[],
    options: DocumentSearchQuery
  ): Promise<DocumentSearchResult[]> {
    const startTime = Date.now();
    const { owner, repo, maxResults = this.searchConfig?.maxResults || 5 } = options;
    const minRelevanceScore = this.searchConfig?.minRelevanceScore || 0.7;
    
    this.logger.debug('Starting document search', {
      owner,
      repo,
      maxResults,
      minRelevanceScore,
    });
    
    try {
      // List all embeddings for this repository
      const chunkIds = await this.listEmbeddings(owner, repo);
      
      if (chunkIds.length === 0) {
        this.logger.warn('No embeddings found for repository', { owner, repo });
        
        // Track failed retrieval
        this.trackMetrics({
          queryId: `${owner}/${repo}/${Date.now()}`,
          timestamp: new Date().toISOString(),
          resultsRetrieved: 0,
          resultsAfterFiltering: 0,
          averageRelevanceScore: 0,
          maxRelevanceScore: 0,
          minRelevanceScore: 0,
          retrievalTimeMs: Date.now() - startTime,
          totalEmbeddingsSearched: 0,
          hasResults: false,
        });
        
        return [];
      }
      
      this.logger.debug(`Found ${chunkIds.length} embeddings`);
      
      // Calculate similarity for each embedding
      const similarities: Array<{ chunkId: string; score: number }> = [];
      
      for (const chunkId of chunkIds) {
        const embedding = await getEmbedding(this.kvNamespace, chunkId);
        
        if (!embedding) {
          continue;
        }
        
        const score = this.cosineSimilarity(queryEmbedding, embedding.embedding);
        similarities.push({ chunkId, score });
      }
      
      // Sort by score descending
      similarities.sort((a, b) => b.score - a.score);
      
      // Filter by relevance threshold
      const filteredResults = similarities.filter(s => s.score >= minRelevanceScore);
      
      this.logger.debug(`Filtered to ${filteredResults.length} results above threshold ${minRelevanceScore}`);
      
      // Take top N results
      const topResults = filteredResults.slice(0, maxResults);
      
      // Fetch chunks from R2
      const results: DocumentSearchResult[] = [];
      
      for (const { chunkId, score } of topResults) {
        const chunk = await this.getChunk(chunkId, owner, repo);
        
        if (chunk) {
          results.push({
            chunk,
            score,
          });
        }
      }
      
      // Calculate metrics
      const relevanceScores = results.map(r => r.score);
      const metrics: RAGQualityMetrics = {
        queryId: `${owner}/${repo}/${Date.now()}`,
        timestamp: new Date().toISOString(),
        resultsRetrieved: similarities.length,
        resultsAfterFiltering: results.length,
        averageRelevanceScore: relevanceScores.length > 0 
          ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length 
          : 0,
        maxRelevanceScore: relevanceScores.length > 0 ? Math.max(...relevanceScores) : 0,
        minRelevanceScore: relevanceScores.length > 0 ? Math.min(...relevanceScores) : 0,
        retrievalTimeMs: Date.now() - startTime,
        totalEmbeddingsSearched: chunkIds.length,
        hasResults: results.length > 0,
      };
      
      this.trackMetrics(metrics);
      
      this.logger.info('Search completed', {
        totalEmbeddings: chunkIds.length,
        resultsBeforeFiltering: similarities.length,
        resultsAfterFiltering: results.length,
        averageRelevance: metrics.averageRelevanceScore.toFixed(3),
        retrievalTime: `${metrics.retrievalTimeMs}ms`,
      });
      
      return results;
    } catch (error) {
      this.logger.error('Search failed', error as Error);
      throw error;
    }
  }
  
  /**
   * Track quality metrics if enabled
   */
  private trackMetrics(metrics: RAGQualityMetrics): void {
    if (this.searchConfig?.minRelevanceScore !== undefined) {
      this.metricsTracker.trackRetrieval(metrics);
    }
  }
}
