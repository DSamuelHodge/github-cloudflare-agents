/**
 * External context types for AI prompt enrichment
 */

/**
 * Repository file context
 */
export interface FileContext {
  path: string;
  content: string;
  language?: string; // file extension or language identifier
  lineCount?: number;
}

/**
 * Documentation context
 */
export interface DocumentationContext {
  title: string;
  content: string;
  source: string; // URL or file path
  relevanceScore?: number;
}

/**
 * Combined external context for AI prompts
 */
export interface ExternalContext {
  files?: FileContext[];
  documentation?: DocumentationContext[];
  additionalNotes?: string;
}
