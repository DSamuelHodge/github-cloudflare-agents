/**
 * RAG (Retrieval-Augmented Generation) Configuration
 * Fine-tuning parameters for documentation retrieval quality
 */

/**
 * Chunking configuration for document processing
 */
export interface ChunkingConfig {
  /**
   * Maximum tokens per chunk (default: 800)
   * Smaller chunks = more precise retrieval but more embeddings
   * Larger chunks = more context but less precise matching
   */
  maxTokens: number;
  
  /**
   * Token overlap between consecutive chunks (default: 100)
   * Higher overlap ensures context continuity across chunks
   */
  overlapTokens: number;
  
  /**
   * Whether to preserve paragraph boundaries when chunking (default: true)
   * Helps maintain semantic coherence within chunks
   */
  preserveParagraphs: boolean;
}

/**
 * Search quality configuration
 */
export interface SearchConfig {
  /**
   * Minimum relevance score threshold (0-1, default: 0.7)
   * Filters out low-quality matches
   * Higher threshold = fewer but more relevant results
   */
  minRelevanceScore: number;
  
  /**
   * Maximum number of results to return (default: 3)
   */
  maxResults: number;
  
  /**
   * Whether to include context snippets before/after match (default: false)
   */
  includeContext: boolean;
  
  /**
   * File types to prioritize in search results
   * e.g., ['markdown', 'text'] - prioritize docs over code
   */
  priorityFileTypes?: string[];
  
  /**
   * Enable hybrid search (semantic + keyword) - Phase 1.5.5
   */
  enableHybridSearch?: boolean;
  
  /**
   * Weight for semantic search in hybrid mode (0-1, default: 0.7)
   */
  semanticWeight?: number;
  
  /**
   * Weight for keyword search in hybrid mode (0-1, default: 0.3)
   */
  keywordWeight?: number;
}

/**
 * Quality metrics for RAG retrieval
 */
export interface RAGQualityMetrics {
  /**
   * Query identifier
   */
  queryId: string;
  
  /**
   * Timestamp of retrieval
   */
  timestamp: string;
  
  /**
   * Number of results retrieved
   */
  resultsRetrieved: number;
  
  /**
   * Number of results after filtering by relevance threshold
   */
  resultsAfterFiltering: number;
  
  /**
   * Average relevance score of returned results
   */
  averageRelevanceScore: number;
  
  /**
   * Highest relevance score
   */
  maxRelevanceScore: number;
  
  /**
   * Lowest relevance score (of returned results)
   */
  minRelevanceScore: number;
  
  /**
   * Time taken to retrieve results (milliseconds)
   */
  retrievalTimeMs: number;
  
  /**
   * Total embeddings searched
   */
  totalEmbeddingsSearched: number;
  
  /**
   * Whether any results were found
   */
  hasResults: boolean;
}

/**
 * Complete RAG configuration
 */
export interface RAGConfig {
  chunking: ChunkingConfig;
  search: SearchConfig;
  
  /**
   * Whether to collect quality metrics (default: true)
   * Metrics help tune RAG parameters over time
   */
  enableMetrics: boolean;
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_CONFIG: RAGConfig = {
  chunking: {
    maxTokens: 800,
    overlapTokens: 100,
    preserveParagraphs: true,
  },
  search: {
    minRelevanceScore: 0.7,
    maxResults: 3,
    includeContext: false,
    priorityFileTypes: ['markdown', 'text'],
    enableHybridSearch: false, // Phase 1.5.5: Disabled by default
    semanticWeight: 0.7,
    keywordWeight: 0.3,
  },
  enableMetrics: true,
};

/**
 * Preset configurations for different use cases
 */
export const RAG_PRESETS = {
  /**
   * Precision-focused: Fewer, higher-quality results
   */
  PRECISION: {
    chunking: {
      maxTokens: 600,
      overlapTokens: 100,
      preserveParagraphs: true,
    },
    search: {
      minRelevanceScore: 0.8,
      enableHybridSearch: true, // Phase 1.5.5: Enable for best quality
      semanticWeight: 0.8,
      keywordWeight: 0.2,
      maxResults: 2,
      includeContext: false,
      priorityFileTypes: ['markdown'],
    },
    enableMetrics: true,
  } as RAGConfig,
  
  /**
   * Recall-focused: More results, lower threshold
   */
  RECALL: {
    chunking: {
      maxTokens: 1000,
      overlapTokens: 150,
      preserveParagraphs: true,
    },
    search: {
      minRelevanceScore: 0.6,
      enableHybridSearch: true, // Phase 1.5.5: Enable for better recall
      semanticWeight: 0.5,
      keywordWeight: 0.5, // Equal weight for maximum coverage
      maxResults: 5,
      includeContext: true,
      priorityFileTypes: ['markdown', 'text'],
    },
    enableMetrics: true,
  } as RAGConfig,
  
  /**
   * Balanced: Good trade-off between precision and recall
   */
  BALANCED: DEFAULT_RAG_CONFIG,
  
  /**
   * Fast: Larger chunks, fewer results for speed
   */
  FAST: {
    chunking: {
      maxTokens: 1200,
      overlapTokens: 50,
      preserveParagraphs: false,
    },
    search: {
      minRelevanceScore: 0.75,
      maxResults: 2,
      includeContext: false,
    },
    enableMetrics: false,
  } as RAGConfig,
};
