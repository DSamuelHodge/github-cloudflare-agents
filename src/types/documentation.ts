/**
 * Documentation types for RAG system
 */

/**
 * Vector embedding for a document chunk
 */
export interface ChunkEmbedding {
  chunkId: string;
  embedding: number[]; // 768-dimensional vector from Gemini
  dimensions: number;
  model: string; // e.g., 'text-embedding-004'
  createdAt: string;
}

/**
 * A chunk of documentation content
 */
export interface DocumentChunk {
  id: string; // Unique chunk ID: {owner}/{repo}/{sha}/{path}/{index}
  owner: string;
  repo: string;
  filePath: string;
  fileName: string;
  fileType: string; // 'markdown', 'text', 'code'
  
  // Content
  content: string;
  chunkIndex: number;
  totalChunks: number;
  
  // Metadata
  sha: string; // Git SHA of the file (for version control)
  tokenCount: number;
  characterCount: number;
  
  // Timestamps
  indexedAt: string;
  lastModified?: string;
}

/**
 * Documentation indexing job status
 */
export interface IndexingJob {
  id: string;
  owner: string;
  repo: string;
  ref?: string; // branch or commit SHA
  
  status: 'pending' | 'running' | 'completed' | 'failed';
  
  startedAt: string;
  completedAt?: string;
  
  stats: {
    filesProcessed: number;
    chunksCreated: number;
    totalTokens: number;
    errors: number;
  };
  
  errors?: Array<{
    path: string;
    error: string;
  }>;
}

/**
 * Documentation search query
 */
export interface DocumentSearchQuery {
  owner: string;
  repo: string;
  query: string;
  maxResults?: number;
  fileTypes?: string[];
}

/**
 * Documentation search result
 */
export interface DocumentSearchResult {
  chunk: DocumentChunk;
  score: number; // Relevance score (from vector similarity or keyword matching)
  context?: {
    before?: string;
    after?: string;
  };
}
