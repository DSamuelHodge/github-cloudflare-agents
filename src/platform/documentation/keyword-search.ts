/**
 * BM25 (Best Matching 25) keyword search implementation
 * Provides lexical search to complement semantic vector search
 */

import type { DocumentChunk } from '../../types/documentation';
import { Logger } from '../../utils/logger';

/**
 * BM25 parameters
 */
interface BM25Params {
  k1: number; // Term frequency saturation parameter (default: 1.5)
  b: number;  // Length normalization parameter (default: 0.75)
}

/**
 * Document statistics for BM25
 */
interface DocStats {
  chunkId: string;
  length: number;
  termFreqs: Map<string, number>;
}

/**
 * BM25 keyword search service
 */
export class KeywordSearchService {
  private logger: Logger;
  private params: BM25Params;
  
  // Document statistics cache (per-isolate)
  private docStats: Map<string, DocStats> = new Map();
  private avgDocLength = 0;
  private totalDocs = 0;
  private idfCache: Map<string, number> = new Map();
  
  constructor(
    params: Partial<BM25Params> = {},
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.logger = new Logger(logLevel, { component: 'KeywordSearchService' });
    this.params = {
      k1: params.k1 || 1.5,
      b: params.b || 0.75,
    };
  }
  
  /**
   * Tokenize and normalize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(token => token.length > 2); // Filter out very short tokens
  }
  
  /**
   * Calculate term frequency in document
   */
  private calculateTermFreqs(tokens: string[]): Map<string, number> {
    const freqs = new Map<string, number>();
    
    for (const token of tokens) {
      freqs.set(token, (freqs.get(token) || 0) + 1);
    }
    
    return freqs;
  }
  
  /**
   * Index a document chunk for keyword search
   */
  indexChunk(chunk: DocumentChunk): void {
    const tokens = this.tokenize(chunk.content);
    const termFreqs = this.calculateTermFreqs(tokens);
    
    this.docStats.set(chunk.id, {
      chunkId: chunk.id,
      length: tokens.length,
      termFreqs,
    });
    
    // Update average document length
    this.totalDocs = this.docStats.size;
    this.avgDocLength = Array.from(this.docStats.values())
      .reduce((sum, doc) => sum + doc.length, 0) / this.totalDocs;
    
    // Invalidate IDF cache when documents change
    this.idfCache.clear();
  }
  
  /**
   * Index multiple chunks
   */
  indexChunks(chunks: DocumentChunk[]): void {
    for (const chunk of chunks) {
      this.indexChunk(chunk);
    }
    
    this.logger.info('Indexed chunks for keyword search', {
      totalChunks: this.totalDocs,
      avgDocLength: Math.round(this.avgDocLength),
    });
  }
  
  /**
   * Calculate IDF (Inverse Document Frequency) for a term
   */
  private calculateIDF(term: string): number {
    // Check cache first
    if (this.idfCache.has(term)) {
      return this.idfCache.get(term)!;
    }
    
    // Count documents containing this term
    let docsWithTerm = 0;
    for (const docStat of this.docStats.values()) {
      if (docStat.termFreqs.has(term)) {
        docsWithTerm++;
      }
    }
    
    // IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
    // Where N = total documents, df = document frequency
    const idf = Math.log(
      (this.totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1
    );
    
    this.idfCache.set(term, idf);
    return idf;
  }
  
  /**
   * Calculate BM25 score for a document given query terms
   */
  private calculateBM25Score(
    queryTerms: string[],
    docStats: DocStats
  ): number {
    let score = 0;
    
    for (const term of queryTerms) {
      const idf = this.calculateIDF(term);
      const termFreq = docStats.termFreqs.get(term) || 0;
      
      if (termFreq === 0) {
        continue;
      }
      
      // BM25 formula
      const numerator = termFreq * (this.params.k1 + 1);
      const denominator = termFreq + this.params.k1 * (
        1 - this.params.b + this.params.b * (docStats.length / this.avgDocLength)
      );
      
      score += idf * (numerator / denominator);
    }
    
    return score;
  }
  
  /**
   * Search for documents matching query
   */
  search(query: string, maxResults: number = 10): Array<{ chunkId: string; score: number }> {
    if (this.totalDocs === 0) {
      this.logger.warn('No documents indexed for keyword search');
      return [];
    }
    
    const queryTerms = this.tokenize(query);
    
    if (queryTerms.length === 0) {
      return [];
    }
    
    this.logger.debug('Keyword search', {
      query: queryTerms.join(' '),
      totalDocs: this.totalDocs,
    });
    
    // Calculate BM25 scores for all documents
    const scores: Array<{ chunkId: string; score: number }> = [];
    
    for (const docStat of this.docStats.values()) {
      const score = this.calculateBM25Score(queryTerms, docStat);
      
      if (score > 0) {
        scores.push({
          chunkId: docStat.chunkId,
          score,
        });
      }
    }
    
    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    
    // Return top N results
    return scores.slice(0, maxResults);
  }
  
  /**
   * Clear all indexed documents
   */
  clear(): void {
    this.docStats.clear();
    this.idfCache.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
    this.logger.info('Keyword search index cleared');
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    totalDocs: number;
    avgDocLength: number;
    uniqueTerms: number;
  } {
    const uniqueTerms = new Set<string>();
    
    for (const docStat of this.docStats.values()) {
      for (const term of docStat.termFreqs.keys()) {
        uniqueTerms.add(term);
      }
    }
    
    return {
      totalDocs: this.totalDocs,
      avgDocLength: Math.round(this.avgDocLength),
      uniqueTerms: uniqueTerms.size,
    };
  }
}
