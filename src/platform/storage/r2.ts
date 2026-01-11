/**
 * R2 Storage Service - Persistent storage for test artifacts
 * Handles test logs, coverage reports, and build artifacts
 */

import type { Env } from '../../types/env';
import { Logger } from '../../utils/logger';

/**
 * Artifact metadata stored alongside the object
 */
export interface ArtifactMetadata {
  jobId: string;
  branch: string;
  testCommand: string;
  status: 'success' | 'failure' | 'timeout' | 'error';
  exitCode?: number;
  durationMs: number;
  createdAt: string;
  owner: string;
  repo: string;
  prNumber?: number;
  issueNumber?: number;
}

/**
 * Stored artifact info returned after upload
 */
export interface StoredArtifact {
  key: string;
  url: string;
  size: number;
  etag: string;
  metadata: ArtifactMetadata;
}

/**
 * Artifact types for organizing storage
 */
export type ArtifactType = 'logs' | 'coverage' | 'reports' | 'diffs' | 'snapshots';

export class R2StorageService {
  private logger: Logger;
  private bucket: R2Bucket;
  private readonly BUCKET_PREFIX = 'test-artifacts';

  constructor(env: Env) {
    if (!env.TEST_ARTIFACTS) {
      throw new Error('TEST_ARTIFACTS R2 binding not configured');
    }
    this.bucket = env.TEST_ARTIFACTS;
    const logLevel = (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
    this.logger = new Logger(logLevel, { component: 'R2StorageService' });
  }

  /**
   * Generate storage key for artifact
   * Format: test-artifacts/{owner}/{repo}/{jobId}/{type}/{filename}
   */
  private generateKey(
    metadata: ArtifactMetadata,
    type: ArtifactType,
    filename: string
  ): string {
    const { owner, repo, jobId } = metadata;
    return `${this.BUCKET_PREFIX}/${owner}/${repo}/${jobId}/${type}/${filename}`;
  }

  /**
   * Store test output (stdout/stderr)
   */
  async storeTestLogs(
    metadata: ArtifactMetadata,
    stdout: string,
    stderr: string
  ): Promise<StoredArtifact[]> {
    const artifacts: StoredArtifact[] = [];

    // Store stdout
    if (stdout) {
      const stdoutArtifact = await this.storeArtifact(
        metadata,
        'logs',
        'stdout.txt',
        stdout,
        'text/plain'
      );
      artifacts.push(stdoutArtifact);
    }

    // Store stderr
    if (stderr) {
      const stderrArtifact = await this.storeArtifact(
        metadata,
        'logs',
        'stderr.txt',
        stderr,
        'text/plain'
      );
      artifacts.push(stderrArtifact);
    }

    this.logger.info('Stored test logs', {
      jobId: metadata.jobId,
      artifactCount: artifacts.length,
    });

    return artifacts;
  }

  /**
   * Store coverage report (JSON or HTML)
   */
  async storeCoverageReport(
    metadata: ArtifactMetadata,
    coverageData: string | object,
    format: 'json' | 'html' = 'json'
  ): Promise<StoredArtifact> {
    const filename = format === 'json' ? 'coverage.json' : 'coverage.html';
    const contentType = format === 'json' ? 'application/json' : 'text/html';
    const content = typeof coverageData === 'string' 
      ? coverageData 
      : JSON.stringify(coverageData, null, 2);

    const artifact = await this.storeArtifact(
      metadata,
      'coverage',
      filename,
      content,
      contentType
    );

    this.logger.info('Stored coverage report', {
      jobId: metadata.jobId,
      format,
      size: artifact.size,
    });

    return artifact;
  }

  /**
   * Store test result summary
   */
  async storeTestSummary(
    metadata: ArtifactMetadata,
    summary: object
  ): Promise<StoredArtifact> {
    const artifact = await this.storeArtifact(
      metadata,
      'reports',
      'summary.json',
      JSON.stringify(summary, null, 2),
      'application/json'
    );

    this.logger.info('Stored test summary', {
      jobId: metadata.jobId,
      size: artifact.size,
    });

    return artifact;
  }

  /**
   * Store diff/patch file
   */
  async storeDiff(
    metadata: ArtifactMetadata,
    diffContent: string,
    filename: string = 'changes.diff'
  ): Promise<StoredArtifact> {
    const artifact = await this.storeArtifact(
      metadata,
      'diffs',
      filename,
      diffContent,
      'text/x-diff'
    );

    this.logger.info('Stored diff', {
      jobId: metadata.jobId,
      filename,
      size: artifact.size,
    });

    return artifact;
  }

  /**
   * Store arbitrary artifact
   */
  async storeArtifact(
    metadata: ArtifactMetadata,
    type: ArtifactType,
    filename: string,
    content: string | ArrayBuffer | ReadableStream,
    contentType: string = 'application/octet-stream'
  ): Promise<StoredArtifact> {
    const key = this.generateKey(metadata, type, filename);

    try {
      const result = await this.bucket.put(key, content, {
        httpMetadata: {
          contentType,
        },
        customMetadata: {
          jobId: metadata.jobId,
          branch: metadata.branch,
          status: metadata.status,
          createdAt: metadata.createdAt,
          owner: metadata.owner,
          repo: metadata.repo,
        },
      });

      this.logger.debug('Artifact stored', {
        key,
        size: result.size,
        etag: result.etag,
      });

      return {
        key,
        url: this.generatePublicUrl(key),
        size: result.size,
        etag: result.etag,
        metadata,
      };
    } catch (error) {
      this.logger.error(
        'Failed to store artifact',
        error instanceof Error ? error : undefined,
        { key, type, filename }
      );
      throw error;
    }
  }

  /**
   * Retrieve artifact by key
   */
  async getArtifact(key: string): Promise<{
    content: ReadableStream | null;
    metadata: R2ObjectMetadata | null;
  }> {
    try {
      const object = await this.bucket.get(key);

      if (!object) {
        this.logger.warn('Artifact not found', { key });
        return { content: null, metadata: null };
      }

      return {
        content: object.body,
        metadata: {
          size: object.size,
          etag: object.etag,
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
          uploaded: object.uploaded,
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to retrieve artifact',
        error instanceof Error ? error : undefined,
        { key }
      );
      throw error;
    }
  }

  /**
   * List artifacts for a job
   */
  async listJobArtifacts(
    owner: string,
    repo: string,
    jobId: string
  ): Promise<R2Objects> {
    const prefix = `${this.BUCKET_PREFIX}/${owner}/${repo}/${jobId}/`;

    try {
      const listed = await this.bucket.list({
        prefix,
        limit: 100,
      });

      this.logger.debug('Listed job artifacts', {
        jobId,
        count: listed.objects.length,
      });

      return listed;
    } catch (error) {
      this.logger.error(
        'Failed to list artifacts',
        error instanceof Error ? error : undefined,
        { owner, repo, jobId }
      );
      throw error;
    }
  }

  /**
   * Delete artifacts for a job (cleanup)
   */
  async deleteJobArtifacts(
    owner: string,
    repo: string,
    jobId: string
  ): Promise<number> {
    const listed = await this.listJobArtifacts(owner, repo, jobId);
    const keys = listed.objects.map(obj => obj.key);

    if (keys.length === 0) {
      return 0;
    }

    try {
      await this.bucket.delete(keys);

      this.logger.info('Deleted job artifacts', {
        jobId,
        count: keys.length,
      });

      return keys.length;
    } catch (error) {
      this.logger.error(
        'Failed to delete artifacts',
        error instanceof Error ? error : undefined,
        { owner, repo, jobId, keyCount: keys.length }
      );
      throw error;
    }
  }

  /**
   * Delete old artifacts (retention policy)
   * Deletes artifacts older than specified days
   */
  async cleanupOldArtifacts(
    owner: string,
    repo: string,
    retentionDays: number = 30
  ): Promise<number> {
    const prefix = `${this.BUCKET_PREFIX}/${owner}/${repo}/`;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;
    let cursor: string | undefined;

    do {
      const listed = await this.bucket.list({
        prefix,
        limit: 1000,
        cursor,
      });

      const oldKeys = listed.objects
        .filter(obj => obj.uploaded < cutoffDate)
        .map(obj => obj.key);

      if (oldKeys.length > 0) {
        await this.bucket.delete(oldKeys);
        deletedCount += oldKeys.length;
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    this.logger.info('Cleaned up old artifacts', {
      owner,
      repo,
      retentionDays,
      deletedCount,
    });

    return deletedCount;
  }

  /**
   * Generate a URL for accessing the artifact
   * Note: This is a placeholder - actual URL depends on R2 public access config
   */
  private generatePublicUrl(key: string): string {
    // In production, this would use a custom domain or R2 public URL
    // For now, return a relative path that can be used with Worker routes
    return `/artifacts/${key}`;
  }
}

/**
 * R2 Object metadata interface
 */
interface R2ObjectMetadata {
  size: number;
  etag: string;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  uploaded: Date;
}
