/**
 * Content chunking service for documentation
 * Splits large documents into smaller, overlapping chunks for RAG
 */

import type { DocumentChunk } from '../../types/documentation';

export interface ChunkingOptions {
  maxTokens: number; // Maximum tokens per chunk (default: 800)
  overlapTokens: number; // Overlap between chunks (default: 100)
  preserveParagraphs?: boolean; // Try to keep paragraphs intact
}

export class DocumentChunker {
  private readonly defaultOptions: ChunkingOptions = {
    maxTokens: 800,
    overlapTokens: 100,
    preserveParagraphs: true,
  };
  
  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Split content into sentences (basic implementation)
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries (., !, ?) followed by whitespace or newline
    return text
      .split(/([.!?]+[\s\n]+)/)
      .reduce((acc, part, i, arr) => {
        if (i % 2 === 0 && part.trim()) {
          const punctuation = arr[i + 1] || '';
          acc.push(part + punctuation);
        }
        return acc;
      }, [] as string[])
      .filter(s => s.trim().length > 0);
  }
  
  /**
   * Split content into paragraphs
   */
  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }
  
  /**
   * Chunk content into overlapping pieces
   */
  chunkContent(
    content: string,
    metadata: {
      owner: string;
      repo: string;
      filePath: string;
      fileName: string;
      fileType: string;
      sha: string;
    },
    options: Partial<ChunkingOptions> = {}
  ): DocumentChunk[] {
    const opts = { ...this.defaultOptions, ...options };
    const chunks: DocumentChunk[] = [];
    
    // Split into paragraphs first if option is enabled
    const segments = opts.preserveParagraphs
      ? this.splitIntoParagraphs(content)
      : this.splitIntoSentences(content);
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentTokens = this.estimateTokens(segment);
      
      // If adding this segment would exceed max tokens, save current chunk
      if (currentTokens + segmentTokens > opts.maxTokens && currentChunk) {
        chunks.push(this.createChunk(
          currentChunk.trim(),
          chunkIndex,
          metadata
        ));
        
        // Start new chunk with overlap from previous chunk
        const overlapText = this.getOverlapText(currentChunk, opts.overlapTokens);
        currentChunk = overlapText + segment + '\n\n';
        currentTokens = this.estimateTokens(currentChunk);
        chunkIndex++;
      } else {
        // Add segment to current chunk
        currentChunk += segment + '\n\n';
        currentTokens += segmentTokens;
      }
    }
    
    // Save final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunkIndex,
        metadata
      ));
    }
    
    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach(chunk => {
      chunk.totalChunks = totalChunks;
    });
    
    return chunks;
  }
  
  /**
   * Get overlap text from previous chunk
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    const targetChars = overlapTokens * 4; // Approximate character count
    
    if (text.length <= targetChars) {
      return text;
    }
    
    // Get last N characters and find last sentence boundary
    const lastPart = text.slice(-targetChars);
    const sentenceMatch = lastPart.match(/[.!?]\s+/);
    
    if (sentenceMatch && sentenceMatch.index !== undefined) {
      return lastPart.slice(sentenceMatch.index + sentenceMatch[0].length);
    }
    
    return lastPart;
  }
  
  /**
   * Create a document chunk
   */
  private createChunk(
    content: string,
    chunkIndex: number,
    metadata: {
      owner: string;
      repo: string;
      filePath: string;
      fileName: string;
      fileType: string;
      sha: string;
    }
  ): DocumentChunk {
    const tokenCount = this.estimateTokens(content);
    const id = `${metadata.owner}/${metadata.repo}/${metadata.sha}/${metadata.filePath}/${chunkIndex}`;
    
    return {
      id,
      owner: metadata.owner,
      repo: metadata.repo,
      filePath: metadata.filePath,
      fileName: metadata.fileName,
      fileType: metadata.fileType,
      content,
      chunkIndex,
      totalChunks: 0, // Will be updated after all chunks are created
      sha: metadata.sha,
      tokenCount,
      characterCount: content.length,
      indexedAt: new Date().toISOString(),
    };
  }
}
