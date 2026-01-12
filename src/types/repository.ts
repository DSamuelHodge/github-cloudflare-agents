/**
 * Repository Configuration Types
 * Phase 3.3: Multi-repository configuration model
 */

/**
 * Configuration for a single repository
 */
export interface RepositoryConfig {
  /** Repository identifier (e.g., "owner/repo") */
  id: string;
  
  /** Repository owner */
  owner: string;
  
  /** Repository name */
  repo: string;
  
  /** Enabled agents for this repository */
  enabledAgents: string[];
  
  /** Triaging configuration */
  triaging?: TriagingConfig;
  
  /** PR review configuration */
  review?: ReviewConfig;
  
  /** Storage prefix for R2/KV isolation */
  storagePrefix: string;
  
  /** Repository-specific settings */
  settings?: {
    /** Enable container-based testing */
    enableContainers?: boolean;
    
    /** Enable documentation RAG */
    enableDocRAG?: boolean;
    
    /** Enable threaded conversations */
    enableConversations?: boolean;
  };
}

/**
 * Automated triaging configuration
 */
export interface TriagingConfig {
  /** Enable automated triaging */
  enabled: boolean;
  
  /** AI model to use for triaging */
  model?: string;
  
  /** Label mappings for classification */
  labelMappings?: Record<string, string[]>;
  
  /** Team assignments based on keywords */
  teamAssignments?: Record<string, string[]>;
  
  /** Minimum confidence threshold (0-1) */
  confidenceThreshold?: number;
}

/**
 * PR review configuration
 */
export interface ReviewConfig {
  /** Enable automated PR reviews */
  enabled: boolean;
  
  /** AI model to use for reviews */
  model?: string;
  
  /** Review focus areas */
  focus?: ('security' | 'performance' | 'style' | 'bugs' | 'best-practices')[];
  
  /** Auto-approve simple PRs (e.g., dependency updates) */
  autoApprovePatterns?: string[];
  
  /** Files to ignore in reviews */
  ignorePatterns?: string[];
  
  /** Minimum severity to comment on */
  minSeverity?: 'info' | 'warning' | 'error';
}

/**
 * Multi-repository registry
 */
export interface RepositoryRegistry {
  /** Default repository (for backward compatibility) */
  defaultRepo?: string;
  
  /** Repository configurations by ID */
  repositories: Record<string, RepositoryConfig>;
}

/**
 * Default repository configuration
 */
export const DEFAULT_REPOSITORY_CONFIG: Partial<RepositoryConfig> = {
  enabledAgents: ['IssueResponderAgent', 'ContainerTestAgent', 'PRAgent'],
  storagePrefix: '',
  settings: {
    enableContainers: true,
    enableDocRAG: true,
    enableConversations: true,
  },
  triaging: {
    enabled: false,
    confidenceThreshold: 0.7,
  },
  review: {
    enabled: false,
    focus: ['bugs', 'security', 'best-practices'],
    minSeverity: 'warning',
  },
};
