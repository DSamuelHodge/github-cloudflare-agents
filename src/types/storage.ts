/**
 * Storage types for R2 artifact management
 */

export interface TestArtifactBundle {
  /** Job identifier */
  jobId: string;
  
  /** Test execution metadata */
  metadata: {
    branch: string;
    command: string;
    status: 'success' | 'failure' | 'timeout' | 'error';
    exitCode?: number;
    durationMs: number;
    startedAt: Date;
    completedAt: Date;
  };
  
  /** GitHub context */
  github: {
    owner: string;
    repo: string;
    prNumber?: number;
    issueNumber?: number;
    commitSha?: string;
  };
  
  /** Test output */
  output: {
    stdout: string;
    stderr: string;
  };
  
  /** Coverage data (if available) */
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
    report?: string; // HTML or JSON report content
  };
  
  /** Additional artifacts */
  artifacts?: Array<{
    name: string;
    type: string;
    content: string | ArrayBuffer;
    contentType: string;
  }>;
}

export interface ArtifactListOptions {
  /** Filter by owner */
  owner?: string;
  
  /** Filter by repo */
  repo?: string;
  
  /** Filter by job ID */
  jobId?: string;
  
  /** Filter by artifact type */
  type?: 'logs' | 'coverage' | 'reports' | 'diffs' | 'snapshots';
  
  /** Maximum number of results */
  limit?: number;
  
  /** Pagination cursor */
  cursor?: string;
}

export interface ArtifactListResult {
  artifacts: Array<{
    key: string;
    size: number;
    uploaded: Date;
    metadata: Record<string, string>;
  }>;
  
  /** True if more results available */
  truncated: boolean;
  
  /** Cursor for next page */
  cursor?: string;
}

export interface StorageQuota {
  /** Total storage used in bytes */
  usedBytes: number;
  
  /** Storage limit in bytes (if applicable) */
  limitBytes?: number;
  
  /** Number of objects stored */
  objectCount: number;
}
