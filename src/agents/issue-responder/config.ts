/**
 * Issue Responder Agent Configuration
 */

import type { ChunkingConfig, SearchConfig } from '../../types/rag-config';

export interface IssueResponderConfig {
  enabled: boolean;
  priority?: number;
  timeoutMs?: number;
  
  // Agent-specific config
  targetLabels: string[];
  targetRepo?: string;
  maxResponseTokens?: number;
  temperature?: number;
  
  // Context enrichment config
  enableFileContext?: boolean;
  maxFilesPerIssue?: number;
  maxLinesPerFile?: number;
  
  // RAG (documentation retrieval) config
  enableRAG?: boolean;
  maxDocChunks?: number;
  
  // RAG fine-tuning (Phase 1.5.3)
  ragChunkingConfig?: ChunkingConfig;
  ragSearchConfig?: SearchConfig;
}

export const defaultConfig: IssueResponderConfig = {
  enabled: true,
  priority: 100,
  timeoutMs: 30000,
  targetLabels: [], // Empty = process all issues (Phase 1.5+)
  maxResponseTokens: 2000,
  temperature: 0.7,
  
  // Context enrichment defaults
  enableFileContext: true,
  maxFilesPerIssue: 5,
  maxLinesPerFile: 500,
  
  // RAG defaults
  enableRAG: true,
  maxDocChunks: 3,
  
  // RAG fine-tuning defaults (Phase 1.5.3)
  ragChunkingConfig: {
    maxTokens: 800,
    overlapTokens: 100,
    preserveParagraphs: true,
  },
  ragSearchConfig: {
    minRelevanceScore: 0.7,
    maxResults: 3,
    includeContext: false,
    priorityFileTypes: ['markdown', 'text'],
    enableHybridSearch: false, // Phase 1.5.5: Opt-in feature
    semanticWeight: 0.7,
    keywordWeight: 0.3,
  },
};
