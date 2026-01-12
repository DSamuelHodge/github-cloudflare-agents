/**
 * Embedding generation service using Gemini API
 */

import { Logger } from '../../utils/logger';
import type { ChunkEmbedding } from '../../types/documentation';
import { getGlobalCostTracker } from '../monitoring/CostTracker';

export interface EmbeddingOptions {
  model?: string; // Default: 'text-embedding-004'
  batchSize?: number; // Default: 10
}

export class EmbeddingService {
  private readonly GEMINI_EMBEDDING_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
  private readonly DEFAULT_MODEL = 'text-embedding-004';
  private readonly DEFAULT_BATCH_SIZE = 10;
  
  private logger: Logger;
  private apiKey: string;
  private costTracker = getGlobalCostTracker();
  
  constructor(
    apiKey: string,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.apiKey = apiKey;
    this.logger = new Logger(logLevel, { component: 'EmbeddingService' });
  }
  
  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    chunkId: string,
    options: EmbeddingOptions = {}
  ): Promise<ChunkEmbedding> {
    const model = options.model || this.DEFAULT_MODEL;
    const url = `${this.GEMINI_EMBEDDING_ENDPOINT}/${model}:embedContent?key=${this.apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            parts: [{
              text,
            }],
          },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini embedding API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as {
        embedding: {
          values: number[];
        };
      };
      
      if (!data.embedding || !data.embedding.values) {
        throw new Error('Invalid embedding response from Gemini API');
      }
      
      // Track cost
      const tokenCount = this.estimateTokens(text);
      this.costTracker.trackOperation('embedding_generation', model, {
        inputTokens: tokenCount,
        outputTokens: 0,
        totalTokens: tokenCount,
      });
      
      return {
        chunkId,
        embedding: data.embedding.values,
        dimensions: data.embedding.values.length,
        model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to generate embedding', error as Error, {
        chunkId,
        model,
      });
      throw error;
    }
  }
  
  /**
   * Generate embeddings in batches
   */
  async generateEmbeddings(
    items: Array<{ text: string; chunkId: string }>,
    options: EmbeddingOptions = {}
  ): Promise<ChunkEmbedding[]> {
    const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;
    const embeddings: ChunkEmbedding[] = [];
    
    // Process in batches to avoid rate limits
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      this.logger.debug(`Processing embedding batch ${Math.floor(i / batchSize) + 1}`, {
        batchSize: batch.length,
        total: items.length,
      });
      
      const batchPromises = batch.map(item =>
        this.generateEmbedding(item.text, item.chunkId, options)
      );
      
      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return embeddings;
  }
  
  /**
   * Generate query embedding (for search)
   */
  async generateQueryEmbedding(
    query: string,
    options: EmbeddingOptions = {}
  ): Promise<number[]> {
    const model = options.model || this.DEFAULT_MODEL;
    const url = `${this.GEMINI_EMBEDDING_ENDPOINT}/${model}:embedContent?key=${this.apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            parts: [{
              text: query,
            }],
          },
          taskType: 'RETRIEVAL_QUERY',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini embedding API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as {
        embedding: {
          values: number[];
        };
      };
      
      if (!data.embedding || !data.embedding.values) {
        throw new Error('Invalid embedding response from Gemini API');
      }
      
      return data.embedding.values;
    } catch (error) {
      this.logger.error('Failed to generate query embedding', error as Error);
      throw error;
    }
  }
}

/**
 * Store embedding in KV
 */
export async function storeEmbedding(
  kv: KVNamespace,
  embedding: ChunkEmbedding
): Promise<void> {
  const key = `embedding:${embedding.chunkId}`;
  await kv.put(key, JSON.stringify(embedding), {
    metadata: {
      chunkId: embedding.chunkId,
      dimensions: embedding.dimensions,
      model: embedding.model,
      createdAt: embedding.createdAt,
    },
  });
}

/**
 * Retrieve embedding from KV
 */
export async function getEmbedding(
  kv: KVNamespace,
  chunkId: string
): Promise<ChunkEmbedding | null> {
  const key = `embedding:${chunkId}`;
  const value = await kv.get(key, 'json');
  return value as ChunkEmbedding | null;
}
