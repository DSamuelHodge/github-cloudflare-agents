/**
 * Context gathering service for Issue Responder
 * Extracts file references from issue body and fetches them
 * Also retrieves relevant documentation via RAG
 */

import type { GitHubRepositoryService } from '../../../platform/github/repository';
import type { ExternalContext, FileContext, DocumentationContext } from '../../../types/context';
import type { IssueResponderConfig } from '../config';
import type { SearchConfig } from '../../../types/rag-config';
import { EmbeddingService } from '../../../platform/documentation/embeddings';
import { DocumentSearchService } from '../../../platform/documentation/search';
import { HybridSearchService } from '../../../platform/documentation/hybrid-search';

export interface ContextGatheringOptions {
  issueTitle: string;
  issueBody: string | null;
  owner: string;
  repo: string;
  ref?: string;
}

export class ContextService {
  // Regex patterns to match file paths in issue body
  private readonly FILE_PATH_PATTERNS = [
    // Matches: `src/file.ts`, `./src/file.ts`, `/src/file.ts`
    /`([\.\/]?[\w\-\/\.]+\.\w+)`/g,
    // Matches: src/file.ts (without backticks)
    /(?:^|\s)((?:\.\/|\/)?(?:src|lib|test|tests|docs)\/[\w\-\/\.]+\.\w+)(?:\s|$)/gm,
  ];
  
  private embeddingService?: EmbeddingService;
  private searchService?: DocumentSearchService;
  private hybridSearchService?: HybridSearchService;
  
  constructor(
    private repositoryService: GitHubRepositoryService,
    private config: IssueResponderConfig,
    private geminiApiKey?: string,
    private r2Bucket?: R2Bucket,
    private kvNamespace?: KVNamespace,
    private searchConfig?: SearchConfig
  ) {
    // Initialize RAG services if all dependencies are available
    if (geminiApiKey && r2Bucket && kvNamespace) {
      this.embeddingService = new EmbeddingService(geminiApiKey);
      
      // Use hybrid search if enabled, otherwise standard semantic search
      if (searchConfig?.enableHybridSearch) {
        this.hybridSearchService = new HybridSearchService(
          r2Bucket,
          kvNamespace,
          geminiApiKey,
          {
            ...searchConfig,
            semanticWeight: searchConfig.semanticWeight || 0.7,
            keywordWeight: searchConfig.keywordWeight || 0.3,
            enableKeywordSearch: true,
          }
        );
      } else {
        this.searchService = new DocumentSearchService(r2Bucket, kvNamespace, searchConfig);
      }
    }
  }
  
  /**
   * Extract file paths from issue body
   */
  extractFilePaths(issueBody: string | null): string[] {
    if (!issueBody) {
      return [];
    }
    
    const paths = new Set<string>();
    
    for (const pattern of this.FILE_PATH_PATTERNS) {
      const matches = issueBody.matchAll(pattern);
      for (const match of matches) {
        const path = match[1].trim();
        // Normalize path (remove leading ./ or /)
        const normalizedPath = path.replace(/^\.?\//, '');
        paths.add(normalizedPath);
      }
    }
    
    return Array.from(paths);
  }
  
  /**
   * Fetch files from repository
   */
  private async fetchFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<FileContext | null> {
    try {
      const result = await this.repositoryService.getFile({
        owner,
        repo,
        path,
        ref,
      });
      
      // Calculate line count
      const lineCount = result.content.split('\n').length;
      
      // Truncate if exceeds max lines
      let content = result.content;
      let truncated = false;
      
      if (this.config.maxLinesPerFile && lineCount > this.config.maxLinesPerFile) {
        const lines = result.content.split('\n').slice(0, this.config.maxLinesPerFile);
        content = lines.join('\n');
        truncated = true;
      }
      
      // Add truncation notice
      if (truncated) {
        content += `\n\n... (truncated, showing ${this.config.maxLinesPerFile} of ${lineCount} lines)`;
      }
      
      // Detect language from file extension
      const language = this.detectLanguage(path);
      
      return {
        path: result.path,
        content,
        language,
        lineCount,
      };
    } catch (error) {
      // Log error but don't throw - we want to continue with other files
      console.warn(`Failed to fetch file ${path}:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  
  /**
   * Detect programming language from file extension
   */
  private detectLanguage(path: string): string | undefined {
    const ext = path.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'tsx': 'tsx',
      'jsx': 'jsx',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'md': 'markdown',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'sh': 'bash',
      'bash': 'bash',
    };
    
    return ext ? languageMap[ext] : undefined;
  }
  
  /**
   * Retrieve relevant documentation using RAG (semantic or hybrid search)
   */
  private async retrieveDocumentation(
    issueTitle: string,
    issueBody: string | null,
    owner: string,
    repo: string
  ): Promise<DocumentationContext[]> {
    if (!this.config.enableRAG) {
      return [];
    }
    
    // Check if hybrid search is available and enabled
    if (this.hybridSearchService) {
      return this.retrieveDocumentationHybrid(issueTitle, issueBody, owner, repo);
    }
    
    // Fallback to standard semantic search
    if (!this.embeddingService || !this.searchService) {
      return [];
    }
    
    try {
      // Create search query from issue title and body
      const query = `${issueTitle}\n\n${issueBody || ''}`;
      
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(query);
      
      // Search for relevant chunks
      const maxResults = this.config.maxDocChunks || 3;
      const results = await this.searchService.search(queryEmbedding, {
        owner,
        repo,
        query,
        maxResults,
      });
      
      // Convert to DocumentationContext
      return results.map(result => ({
        title: result.chunk.fileName,
        content: result.chunk.content,
        source: result.chunk.filePath,
        relevanceScore: result.score,
      }));
    } catch (error) {
      console.warn('Failed to retrieve documentation:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  
  /**
   * Retrieve relevant documentation using hybrid search (Phase 1.5.5)
   */
  private async retrieveDocumentationHybrid(
    issueTitle: string,
    issueBody: string | null,
    owner: string,
    repo: string
  ): Promise<DocumentationContext[]> {
    if (!this.hybridSearchService) {
      return [];
    }
    
    try {
      // Create search query from issue title and body
      const query = `${issueTitle}\n\n${issueBody || ''}`;
      
      // Perform hybrid search
      const maxResults = this.config.maxDocChunks || 3;
      const results = await this.hybridSearchService.search(query, {
        owner,
        repo,
        query,
        maxResults,
      });
      
      // Convert to DocumentationContext
      return results.map(result => ({
        title: result.chunk.fileName,
        content: result.chunk.content,
        source: result.chunk.filePath,
        relevanceScore: result.score,
      }));
    } catch (error) {
      console.warn('Failed to retrieve documentation via hybrid search:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  
  /**
   * Gather external context from issue
   */
  async gatherContext(options: ContextGatheringOptions): Promise<ExternalContext | undefined> {
    const { issueTitle, issueBody, owner, repo, ref } = options;
    
    let files: FileContext[] | undefined;
    let documentation: DocumentationContext[] | undefined;
    
    // Fetch file context if enabled
    if (this.config.enableFileContext) {
      // Extract file paths
      const filePaths = this.extractFilePaths(issueBody);
      
      if (filePaths.length > 0) {
        // Limit number of files
        const maxFiles = this.config.maxFilesPerIssue || 5;
        const pathsToFetch = filePaths.slice(0, maxFiles);
        
        // Fetch files in parallel
        const filePromises = pathsToFetch.map(path =>
          this.fetchFile(owner, repo, path, ref)
        );
        
        const fileResults = await Promise.all(filePromises);
        
        // Filter out null results (failed fetches)
        const fetchedFiles = fileResults.filter((f): f is FileContext => f !== null);
        
        if (fetchedFiles.length > 0) {
          files = fetchedFiles;
        }
      }
    }
    
    // Retrieve documentation via RAG if enabled
    if (this.config.enableRAG) {
      const docs = await this.retrieveDocumentation(issueTitle, issueBody, owner, repo);
      if (docs.length > 0) {
        documentation = docs;
      }
    }
    
    // Return combined context if any was found
    if (files || documentation) {
      return {
        files,
        documentation,
      };
    }
    
    return undefined;
  }
}
