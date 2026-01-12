/**
 * Hybrid search combining semantic (vector) and keyword (BM25) search
 * Provides better retrieval quality by leveraging both approaches
 */

import type { DocumentChunk, DocumentSearchQuery, DocumentSearchResult } from '../../types/documentation';
import type { SearchConfig } from '../../types/rag-config';
import { DocumentSearchService } from './search';
import { KeywordSearchService } from './keyword-search';
import { EmbeddingService } from './embeddings';
import { Logger } from '../../utils/logger';

/**
 * Hybrid search configuration
 */
export interface HybridSearchConfig extends SearchConfig {
  /**
   * Weight for semantic search scores (0-1, default: 0.7)
   * Higher weight prioritizes semantic similarity
   */
  semanticWeight: number;
  
  /**
   * Weight for keyword search scores (0-1, default: 0.3)
   * Higher weight prioritizes exact keyword matches
   */
  keywordWeight: number;
  
  /**
   * Enable keyword search (default: true)
   */
  enableKeywordSearch: boolean;
}

/**
 * Default hybrid search configuration
 */
export const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  minRelevanceScore: 0.7,
  maxResults: 3,
  includeContext: false,
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  enableKeywordSearch: true,
};

/**
 * Hybrid search service combining semantic and keyword search
 */
export class HybridSearchService {
  private logger: Logger;
  private semanticSearch: DocumentSearchService;
  private keywordSearch: KeywordSearchService;
  private embeddingService: EmbeddingService;
  
  constructor(
    private r2Bucket: R2Bucket,
    private kvNamespace: KVNamespace,
    private geminiApiKey: string,
    private config: HybridSearchConfig = DEFAULT_HYBRID_CONFIG,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.logger = new Logger(logLevel, { component: 'HybridSearchService' });
    this.semanticSearch = new DocumentSearchService(r2Bucket, kvNamespace, config, logLevel);
    this.keywordSearch = new KeywordSearchService({}, logLevel);
    this.embeddingService = new EmbeddingService(geminiApiKey, logLevel);
  }
  
  /**
   * Index chunks for both semantic and keyword search
   */
  async indexChunks(chunks: DocumentChunk[]): Promise<void> {
    this.logger.info('Indexing chunks for hybrid search', {
      totalChunks: chunks.length,
    });
    
    // Index for keyword search (synchronous)
    this.keywordSearch.indexChunks(chunks);
    
    // Note: Semantic indexing (embeddings) is handled separately
    // during documentation indexing process
    
    this.logger.info('Hybrid indexing completed');
  }
  
  /**
   * Normalize scores to 0-1 range
   */
  private normalizeScores(scores: Array<{ chunkId: string; score: number }>): Map<string, number> {
    if (scores.length === 0) {
      return new Map();
    }
    
    const maxScore = Math.max(...scores.map(s => s.score));
    const minScore = Math.min(...scores.map(s => s.score));
    const range = maxScore - minScore;
    
    const normalized = new Map<string, number>();
    
    for (const { chunkId, score } of scores) {
      // Normalize to 0-1 range
      const normalizedScore = range > 0 ? (score - minScore) / range : 1;
      normalized.set(chunkId, normalizedScore);
    }
    
    return normalized;
  }
  
  /**
   * Combine semantic and keyword search results
   */
  private combineScores(
    semanticScores: Map<string, number>,
    keywordScores: Map<string, number>
  ): Array<{ chunkId: string; score: number; semanticScore: number; keywordScore: number }> {
    const allChunkIds = new Set([...semanticScores.keys(), ...keywordScores.keys()]);
    const combined: Array<{
      chunkId: string;
      score: number;
      semanticScore: number;
      keywordScore: number;
    }> = [];
    
    for (const chunkId of allChunkIds) {
      const semanticScore = semanticScores.get(chunkId) || 0;
      const keywordScore = keywordScores.get(chunkId) || 0;
      
      // Weighted combination
      const combinedScore = 
        semanticScore * this.config.semanticWeight +
        keywordScore * this.config.keywordWeight;
      
      combined.push({
        chunkId,
        score: combinedScore,
        semanticScore,
        keywordScore,
      });
    }
    
    // Sort by combined score descending
    combined.sort((a, b) => b.score - a.score);
    
    return combined;
  }
  
  /**
   * Fetch chunk from R2
   */
  private async getChunk(chunkId: string, owner: string, repo: string): Promise<DocumentChunk | null> {
    try {
      const listResult = await this.r2Bucket.list({
        prefix: `docs/${owner}/${repo}/`,
      });
      
      for (const obj of listResult.objects) {
        if (obj.key.includes(chunkId)) {
          const object = await this.r2Bucket.get(obj.key);
          if (object) {
            return await object.json() as DocumentChunk;
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
   * Perform hybrid search combining semantic and keyword approaches
   */
  async search(
    query: string,
    options: DocumentSearchQuery
  ): Promise<DocumentSearchResult[]> {
    const startTime = Date.now();
    const { owner, repo } = options;
    
    this.logger.info('Starting hybrid search', {
      query: query.substring(0, 100),
      owner,
      repo,
      semanticWeight: this.config.semanticWeight,
      keywordWeight: this.config.keywordWeight,
    });
    
    try {
      // 1. Perform semantic search
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(query);
      const semanticResults = await this.semanticSearch.search(queryEmbedding, {
        ...options,
        maxResults: options.maxResults || 10, // Get more candidates
      });
      
      const semanticScoresRaw = semanticResults.map(r => ({
        chunkId: r.chunk.id,
        score: r.score,
      }));
      
      // 2. Perform keyword search (if enabled)
      let keywordScoresRaw: Array<{ chunkId: string; score: number }> = [];
      
      if (this.config.enableKeywordSearch) {
        keywordScoresRaw = this.keywordSearch.search(query, options.maxResults || 10);
      }
      
      // 3. Normalize scores
      const semanticScores = this.normalizeScores(semanticScoresRaw);
      const keywordScores = this.normalizeScores(keywordScoresRaw);
      
      this.logger.debug('Search results before combination', {
        semanticResults: semanticScoresRaw.length,
        keywordResults: keywordScoresRaw.length,
      });
      
      // 4. Combine scores
      const combined = this.combineScores(semanticScores, keywordScores);
      
      // 5. Filter by relevance threshold
      const minScore = this.config.minRelevanceScore;
      const filtered = combined.filter(c => c.score >= minScore);
      
      // 6. Take top N results
      const topResults = filtered.slice(0, options.maxResults || this.config.maxResults);
      
      // 7. Fetch full chunks
      const results: DocumentSearchResult[] = [];
      
      for (const result of topResults) {
        const chunk = await this.getChunk(result.chunkId, owner, repo);
        
        if (chunk) {
          results.push({
            chunk,
            score: result.score,
          });
        }
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Hybrid search completed', {
        resultsFound: results.length,
        semanticCandidates: semanticScoresRaw.length,
        keywordCandidates: keywordScoresRaw.length,
        durationMs: duration,
      });
      
      return results;
    } catch (error) {
      this.logger.error('Hybrid search failed', error as Error);
      throw error;
    }
  }
  
  /**
   * Get search statistics
   */
  getStats(): {
    keyword: ReturnType<KeywordSearchService['getStats']>;
    config: HybridSearchConfig;
  } {
    return {
      keyword: this.keywordSearch.getStats(),
      config: this.config,
    };
  }
}
