/**
 * Documentation indexing service
 * Crawls repository documentation and stores chunks in R2
 */

import type { GitHubRepositoryService } from '../github/repository';
import { DocumentChunker } from './chunker';
import { EmbeddingService, storeEmbedding } from './embeddings';
import type { DocumentChunk, IndexingJob } from '../../types/documentation';
import type { ChunkingConfig } from '../../types/rag-config';
import { Logger } from '../../utils/logger';

export interface IndexingOptions {
  owner: string;
  repo: string;
  ref?: string; // branch or commit SHA
  paths?: string[]; // Specific paths to index (default: ['README.md', 'docs/'])
  maxFiles?: number; // Maximum files to process (default: 100)
  generateEmbeddings?: boolean; // Generate embeddings (default: true)
  chunkingConfig?: ChunkingConfig; // Chunking configuration (Phase 1.5.3)
}

export class DocumentationIndexer {
  private logger: Logger;
  private chunker: DocumentChunker;
  private embeddingService?: EmbeddingService;
  private kvNamespace?: KVNamespace;
  
  // Documentation file patterns
  private readonly DOC_PATTERNS = [
    /^README\.md$/i,
    /^docs\//,
    /\.md$/,
    /^CONTRIBUTING\.md$/i,
    /^CHANGELOG\.md$/i,
    /^LICENSE\.md$/i,
  ];
  
  constructor(
    private repositoryService: GitHubRepositoryService,
    private bucket: R2Bucket,
    private geminiApiKey?: string,
    private kv?: KVNamespace,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.logger = new Logger(logLevel, { component: 'DocumentationIndexer' });
    this.chunker = new DocumentChunker();
    
    // Initialize embedding service if API key and KV are provided
    if (geminiApiKey && kv) {
      this.embeddingService = new EmbeddingService(geminiApiKey, logLevel);
      this.kvNamespace = kv;
    }
  }
  
  /**
   * Check if file path matches documentation patterns
   */
  private isDocumentationFile(path: string): boolean {
    return this.DOC_PATTERNS.some(pattern => pattern.test(path));
  }
  
  /**
   * Detect file type from extension
   */
  private detectFileType(path: string): string {
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.txt')) return 'text';
    return 'text';
  }
  
  /**
   * List all documentation files in repository
   * This is a simplified version - would need GitHub tree API for production
   */
  private async listDocumentationFiles(
    owner: string,
    repo: string,
    ref?: string
  ): Promise<string[]> {
    const candidates = [
      'README.md',
      'docs/README.md',
      'docs/ARCHITECTURE.md',
      'docs/quickstart.md',
      'docs/PHASE2_RESEARCH.md',
      'CONTRIBUTING.md',
      'CHANGELOG.md',
    ];
    
    const existingFiles: string[] = [];
    
    for (const path of candidates) {
      try {
        const exists = await this.repositoryService.fileExists({
          owner,
          repo,
          path,
          ref,
        });
        
        if (exists) {
          existingFiles.push(path);
        }
      } catch (error) {
        this.logger.debug(`Skipping ${path}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return existingFiles;
  }
  
  /**
   * Store chunk in R2
   * Key format: docs/{owner}/{repo}/{sha}/{chunkId}.json
   */
  private async storeChunk(chunk: DocumentChunk): Promise<void> {
    const key = `docs/${chunk.owner}/${chunk.repo}/${chunk.sha}/${chunk.id}.json`;
    
    await this.bucket.put(key, JSON.stringify(chunk), {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        owner: chunk.owner,
        repo: chunk.repo,
        filePath: chunk.filePath,
        chunkIndex: chunk.chunkIndex.toString(),
        sha: chunk.sha,
      },
    });
  }
  
  /**
   * Index a single file
   */
  private async indexFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    chunkingOptions?: Partial<ChunkingConfig>
  ): Promise<DocumentChunk[]> {
    try {
      const file = await this.repositoryService.getFile({
        owner,
        repo,
        path,
        ref,
      });
      
      const fileName = path.split('/').pop() || path;
      const fileType = this.detectFileType(path);
      
      const chunks = this.chunker.chunkContent(
        file.content,
        {
          owner,
          repo,
          filePath: path,
          fileName,
          fileType,
          sha: file.sha,
        },
        chunkingOptions
      );
      
      this.logger.debug(`Chunked ${path}`, {
        chunks: chunks.length,
        tokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
      });
      
      // Store all chunks in R2
      await Promise.all(chunks.map(chunk => this.storeChunk(chunk)));
      
      return chunks;
    } catch (error) {
      this.logger.error(`Failed to index file: ${path}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Generate and store embeddings for chunks
   */
  private async generateEmbeddingsForChunks(chunks: DocumentChunk[]): Promise<void> {
    if (!this.embeddingService || !this.kvNamespace) {
      this.logger.warn('Embedding service not configured, skipping embeddings');
      return;
    }
    
    this.logger.info('Generating embeddings', { chunks: chunks.length });
    
    const items = chunks.map(chunk => ({
      text: chunk.content,
      chunkId: chunk.id,
    }));
    
    const embeddings = await this.embeddingService.generateEmbeddings(items);
    
    // Store embeddings in KV
    await Promise.all(
      embeddings.map(embedding => storeEmbedding(this.kvNamespace!, embedding))
    );
    
    this.logger.info('Embeddings stored', { count: embeddings.length });
  }
  
  /**
   * Index repository documentation
   */
  async indexDocumentation(options: IndexingOptions): Promise<IndexingJob> {
    const { owner, repo, ref, maxFiles = 100 } = options;
    const jobId = `${owner}/${repo}/${Date.now()}`;
    
    const job: IndexingJob = {
      id: jobId,
      owner,
      repo,
      ref,
      status: 'running',
      startedAt: new Date().toISOString(),
      stats: {
        filesProcessed: 0,
        chunksCreated: 0,
        totalTokens: 0,
        errors: 0,
      },
      errors: [],
    };
    
    this.logger.info('Starting documentation indexing', {
      owner,
      repo,
      ref,
    });
    
    try {
      // List documentation files
      const files = await this.listDocumentationFiles(owner, repo, ref);
      const filesToProcess = files.slice(0, maxFiles);
      
      this.logger.info(`Found ${files.length} documentation files`, {
        processing: filesToProcess.length,
      });
      
      // Index each file
      const allChunks: DocumentChunk[] = [];
      
      for (const path of filesToProcess) {
        try {
          const chunks = await this.indexFile(owner, repo, path, ref, options.chunkingConfig);
          
          job.stats.filesProcessed++;
          job.stats.chunksCreated += chunks.length;
          job.stats.totalTokens += chunks.reduce((sum, c) => sum + c.tokenCount, 0);
          
          allChunks.push(...chunks);
        } catch (error) {
          job.stats.errors++;
          job.errors?.push({
            path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      // Generate embeddings if enabled
      if (options.generateEmbeddings !== false && allChunks.length > 0) {
        try {
          await this.generateEmbeddingsForChunks(allChunks);
        } catch (error) {
          this.logger.error('Failed to generate embeddings', error as Error);
          job.stats.errors++;
        }
      }
      
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      
      this.logger.info('Documentation indexing completed', {
        filesProcessed: job.stats.filesProcessed,
        chunksCreated: job.stats.chunksCreated,
        totalTokens: job.stats.totalTokens,
        errors: job.stats.errors,
      });
    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      
      this.logger.error('Documentation indexing failed', error as Error);
    }
    
    return job;
  }
}
