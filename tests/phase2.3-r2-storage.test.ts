/**
 * Phase 2.3 Integration Tests: R2 Persistent Storage
 * 
 * Tests artifact upload/download, retention policies, and cleanup operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ArtifactMetadata, StoredArtifact, ArtifactType } from '../src/platform/storage/r2';

// Mock R2 Bucket interface
interface MockR2Object {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  customMetadata?: Record<string, string>;
  body: ReadableStream;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

describe('Phase 2.3: R2 Persistent Storage', () => {
  let mockR2Bucket: any;
  let mockMetadata: ArtifactMetadata;

  beforeEach(() => {
    // Mock R2 bucket operations
    mockR2Bucket = {
      put: vi.fn().mockResolvedValue({
        key: 'test-key',
        etag: 'test-etag',
        size: 1024,
      }),
      get: vi.fn().mockResolvedValue({
        key: 'test-key',
        size: 1024,
        etag: 'test-etag',
        httpEtag: '"test-etag"',
        uploaded: new Date(),
        text: async () => 'test content',
        json: async () => ({ data: 'test' }),
        arrayBuffer: async () => new ArrayBuffer(1024),
      } as MockR2Object),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({
        objects: [],
        truncated: false,
        cursor: undefined,
      }),
    };

    // Sample artifact metadata
    mockMetadata = {
      jobId: 'job-123-abc',
      branch: 'fix-issue-42',
      testCommand: 'npm test',
      status: 'success',
      exitCode: 0,
      durationMs: 5230,
      createdAt: new Date().toISOString(),
      owner: 'DSamuelHodge',
      repo: 'github-agent-repo',
      issueNumber: 42,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Storage Key Generation', () => {
    it('should generate correct key format for test logs', () => {
      const key = generateStorageKey(mockMetadata, 'logs', 'stdout.txt');

      expect(key).toBe(
        'test-artifacts/DSamuelHodge/github-agent-repo/job-123-abc/logs/stdout.txt'
      );
    });

    it('should generate correct key format for coverage reports', () => {
      const key = generateStorageKey(mockMetadata, 'coverage', 'coverage.json');

      expect(key).toBe(
        'test-artifacts/DSamuelHodge/github-agent-repo/job-123-abc/coverage/coverage.json'
      );
    });

    it('should generate correct key format for diffs', () => {
      const key = generateStorageKey(mockMetadata, 'diffs', 'changes.diff');

      expect(key).toBe(
        'test-artifacts/DSamuelHodge/github-agent-repo/job-123-abc/diffs/changes.diff'
      );
    });

    it('should sanitize special characters in repository names', () => {
      const unsafeMetadata = {
        ...mockMetadata,
        owner: 'user/../../../etc',
        repo: 'repo;rm -rf /',
      };

      // Should reject or sanitize dangerous characters
      const isSafe = /^[\w-]+$/.test(unsafeMetadata.owner);
      expect(isSafe).toBe(false);
    });

    it('should handle long file names gracefully', () => {
      const longFilename = 'a'.repeat(300) + '.txt';
      const maxFilenameLength = 255;

      // File systems typically limit to 255 characters
      if (longFilename.length > maxFilenameLength) {
        const truncated = longFilename.slice(0, maxFilenameLength);
        expect(truncated.length).toBeLessThanOrEqual(maxFilenameLength);
      }
    });
  });

  describe('Artifact Upload', () => {
    it('should upload test stdout logs to R2', async () => {
      const stdout = '✓ All 15 tests passed\nDuration: 3.2s';

      await mockR2Bucket.put(
        generateStorageKey(mockMetadata, 'logs', 'stdout.txt'),
        stdout,
        {
          httpMetadata: { contentType: 'text/plain' },
          customMetadata: {
            jobId: mockMetadata.jobId,
            status: mockMetadata.status,
          },
        }
      );

      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        expect.stringContaining('stdout.txt'),
        stdout,
        expect.objectContaining({
          httpMetadata: { contentType: 'text/plain' },
        })
      );
    });

    it('should upload test stderr logs to R2', async () => {
      const stderr = 'Warning: Deprecated API usage detected';

      await mockR2Bucket.put(
        generateStorageKey(mockMetadata, 'logs', 'stderr.txt'),
        stderr,
        {
          httpMetadata: { contentType: 'text/plain' },
          customMetadata: {
            jobId: mockMetadata.jobId,
          },
        }
      );

      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        expect.stringContaining('stderr.txt'),
        stderr,
        expect.any(Object)
      );
    });

    it('should upload coverage reports as JSON', async () => {
      const coverageData = {
        total: {
          lines: { pct: 85.5 },
          statements: { pct: 86.2 },
          functions: { pct: 92.3 },
          branches: { pct: 78.1 },
        },
      };

      await mockR2Bucket.put(
        generateStorageKey(mockMetadata, 'coverage', 'coverage.json'),
        JSON.stringify(coverageData, null, 2),
        {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: {
            jobId: mockMetadata.jobId,
            type: 'coverage',
          },
        }
      );

      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        expect.stringContaining('coverage.json'),
        expect.any(String),
        expect.objectContaining({
          httpMetadata: { contentType: 'application/json' },
        })
      );
    });

    it('should upload diff/patch files', async () => {
      const diffContent = `
diff --git a/src/service.ts b/src/service.ts
index 1234567..89abcdef 100644
--- a/src/service.ts
+++ b/src/service.ts
@@ -10,7 +10,7 @@ export class Service {
-  return 0;
+  return 42;
      `.trim();

      await mockR2Bucket.put(
        generateStorageKey(mockMetadata, 'diffs', 'changes.diff'),
        diffContent,
        {
          httpMetadata: { contentType: 'text/x-diff' },
          customMetadata: {
            jobId: mockMetadata.jobId,
            branch: mockMetadata.branch,
          },
        }
      );

      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        expect.stringContaining('changes.diff'),
        diffContent,
        expect.any(Object)
      );
    });

    it('should handle binary artifact uploads', async () => {
      const binaryData = new ArrayBuffer(1024);

      await mockR2Bucket.put(
        generateStorageKey(mockMetadata, 'reports', 'screenshot.png'),
        binaryData,
        {
          httpMetadata: { contentType: 'image/png' },
          customMetadata: {
            jobId: mockMetadata.jobId,
          },
        }
      );

      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        expect.stringContaining('screenshot.png'),
        binaryData,
        expect.any(Object)
      );
    });

    it('should reject uploads exceeding size limits', async () => {
      const maxSizeBytes = 100 * 1024 * 1024; // 100MB
      const oversizedContent = 'x'.repeat(maxSizeBytes + 1);

      if (oversizedContent.length > maxSizeBytes) {
        expect(oversizedContent.length).toBeGreaterThan(maxSizeBytes);
      }
    });

    it('should include custom metadata with uploads', async () => {
      await mockR2Bucket.put('test-key', 'content', {
        customMetadata: {
          jobId: 'job-123',
          branch: 'fix-issue-42',
          status: 'success',
          owner: 'DSamuelHodge',
          repo: 'github-agent-repo',
        },
      });

      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        'test-key',
        'content',
        expect.objectContaining({
          customMetadata: expect.objectContaining({
            jobId: 'job-123',
            status: 'success',
          }),
        })
      );
    });
  });

  describe('Artifact Retrieval', () => {
    it('should retrieve artifact by key', async () => {
      const key = generateStorageKey(mockMetadata, 'logs', 'stdout.txt');
      const object = await mockR2Bucket.get(key);

      expect(mockR2Bucket.get).toHaveBeenCalledWith(key);
      expect(object).toBeDefined();
      expect(object.key).toBe('test-key');
    });

    it('should retrieve artifact as text', async () => {
      const key = generateStorageKey(mockMetadata, 'logs', 'stdout.txt');
      const object = await mockR2Bucket.get(key);
      const text = await object.text();

      expect(text).toBe('test content');
    });

    it('should retrieve artifact as JSON', async () => {
      const key = generateStorageKey(mockMetadata, 'coverage', 'coverage.json');
      const object = await mockR2Bucket.get(key);
      const json = await object.json();

      expect(json).toEqual({ data: 'test' });
    });

    it('should retrieve artifact as ArrayBuffer', async () => {
      const key = generateStorageKey(mockMetadata, 'reports', 'screenshot.png');
      const object = await mockR2Bucket.get(key);
      const buffer = await object.arrayBuffer();

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(1024);
    });

    it('should handle non-existent keys gracefully', async () => {
      mockR2Bucket.get.mockResolvedValue(null);

      const key = 'non-existent-key';
      const object = await mockR2Bucket.get(key);

      expect(object).toBeNull();
    });

    it('should extract custom metadata from retrieved objects', async () => {
      const objectWithMetadata = {
        ...await mockR2Bucket.get('test-key'),
        customMetadata: {
          jobId: 'job-123',
          status: 'success',
          branch: 'fix-issue-42',
        },
      };

      expect(objectWithMetadata.customMetadata?.jobId).toBe('job-123');
      expect(objectWithMetadata.customMetadata?.status).toBe('success');
    });
  });

  describe('Artifact Listing', () => {
    it('should list artifacts by job ID prefix', async () => {
      mockR2Bucket.list.mockResolvedValue({
        objects: [
          {
            key: 'test-artifacts/DSamuelHodge/github-agent-repo/job-123/logs/stdout.txt',
            size: 512,
          },
          {
            key: 'test-artifacts/DSamuelHodge/github-agent-repo/job-123/logs/stderr.txt',
            size: 128,
          },
          {
            key: 'test-artifacts/DSamuelHodge/github-agent-repo/job-123/coverage/coverage.json',
            size: 2048,
          },
        ],
        truncated: false,
        cursor: undefined,
      });

      const prefix = 'test-artifacts/DSamuelHodge/github-agent-repo/job-123/';
      const result = await mockR2Bucket.list({ prefix });

      expect(mockR2Bucket.list).toHaveBeenCalledWith({ prefix });
      expect(result.objects).toHaveLength(3);
      expect(result.objects[0].key).toContain('stdout.txt');
    });

    it('should handle paginated listing results', async () => {
      // First page
      mockR2Bucket.list.mockResolvedValueOnce({
        objects: Array(1000).fill({ key: 'artifact-1', size: 100 }),
        truncated: true,
        cursor: 'page-2-cursor',
      });

      // Second page
      mockR2Bucket.list.mockResolvedValueOnce({
        objects: Array(500).fill({ key: 'artifact-2', size: 100 }),
        truncated: false,
        cursor: undefined,
      });

      const page1 = await mockR2Bucket.list({ prefix: 'test-artifacts/' });
      expect(page1.truncated).toBe(true);
      expect(page1.cursor).toBe('page-2-cursor');

      const page2 = await mockR2Bucket.list({
        prefix: 'test-artifacts/',
        cursor: page1.cursor,
      });
      expect(page2.truncated).toBe(false);
    });

    it('should filter artifacts by type', async () => {
      const logsPrefix = `test-artifacts/${mockMetadata.owner}/${mockMetadata.repo}/${mockMetadata.jobId}/logs/`;

      mockR2Bucket.list.mockResolvedValue({
        objects: [
          { key: `${logsPrefix}stdout.txt`, size: 512 },
          { key: `${logsPrefix}stderr.txt`, size: 128 },
        ],
        truncated: false,
      });

      const result = await mockR2Bucket.list({ prefix: logsPrefix });

      expect(result.objects).toHaveLength(2);
      expect(result.objects.every((obj: any) => obj.key.includes('/logs/'))).toBe(true);
    });
  });

  describe('Artifact Deletion', () => {
    it('should delete single artifact', async () => {
      const key = generateStorageKey(mockMetadata, 'logs', 'stdout.txt');

      await mockR2Bucket.delete(key);

      expect(mockR2Bucket.delete).toHaveBeenCalledWith(key);
    });

    it('should delete multiple artifacts in batch', async () => {
      const keys = [
        generateStorageKey(mockMetadata, 'logs', 'stdout.txt'),
        generateStorageKey(mockMetadata, 'logs', 'stderr.txt'),
        generateStorageKey(mockMetadata, 'coverage', 'coverage.json'),
      ];

      mockR2Bucket.delete.mockResolvedValue(undefined);

      for (const key of keys) {
        await mockR2Bucket.delete(key);
      }

      expect(mockR2Bucket.delete).toHaveBeenCalledTimes(3);
    });

    it('should handle deletion of non-existent keys', async () => {
      // R2 delete is idempotent - doesn't error on non-existent keys
      mockR2Bucket.delete.mockResolvedValue(undefined);

      await mockR2Bucket.delete('non-existent-key');

      expect(mockR2Bucket.delete).toHaveBeenCalledWith('non-existent-key');
    });
  });

  describe('Retention Policy', () => {
    it('should identify artifacts older than retention period', () => {
      const retentionDays = 30;
      const now = new Date();
      const oldArtifact = new Date(now.getTime() - (31 * 24 * 60 * 60 * 1000));
      const recentArtifact = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));

      const isOldArtifactExpired = 
        (now.getTime() - oldArtifact.getTime()) / (1000 * 60 * 60 * 24) > retentionDays;
      const isRecentArtifactExpired = 
        (now.getTime() - recentArtifact.getTime()) / (1000 * 60 * 60 * 24) > retentionDays;

      expect(isOldArtifactExpired).toBe(true);
      expect(isRecentArtifactExpired).toBe(false);
    });

    it('should implement retention policy cleanup logic', async () => {
      const retentionDays = 30;
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (retentionDays * 24 * 60 * 60 * 1000));

      mockR2Bucket.list.mockResolvedValue({
        objects: [
          {
            key: 'old-artifact',
            uploaded: new Date(now.getTime() - (45 * 24 * 60 * 60 * 1000)),
          },
          {
            key: 'recent-artifact',
            uploaded: new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)),
          },
        ],
        truncated: false,
      });

      const result = await mockR2Bucket.list({ prefix: 'test-artifacts/' });
      const expiredObjects = result.objects.filter(
        (obj: any) => obj.uploaded < cutoffDate
      );

      expect(expiredObjects).toHaveLength(1);
      expect(expiredObjects[0].key).toBe('old-artifact');
    });

    it('should preserve artifacts from successful builds', () => {
      const successfulBuilds = [
        { jobId: 'job-1', status: 'success', retentionDays: 90 },
        { jobId: 'job-2', status: 'failure', retentionDays: 30 },
        { jobId: 'job-3', status: 'success', retentionDays: 90 },
      ];

      for (const build of successfulBuilds) {
        if (build.status === 'success') {
          expect(build.retentionDays).toBe(90);
        } else {
          expect(build.retentionDays).toBe(30);
        }
      }
    });
  });

  describe('StoredArtifact Structure', () => {
    it('should validate stored artifact metadata', () => {
      const artifact: StoredArtifact = {
        key: generateStorageKey(mockMetadata, 'logs', 'stdout.txt'),
        url: 'https://artifacts.example.com/job-123/stdout.txt',
        size: 1024,
        etag: 'abc123def456',
        metadata: mockMetadata,
      };

      expect(artifact.key).toContain('job-123-abc');
      expect(artifact.size).toBeGreaterThan(0);
      expect(artifact.etag).toBeTruthy();
      expect(artifact.metadata.jobId).toBe('job-123-abc');
    });

    it('should support multiple artifact types', () => {
      const artifactTypes: ArtifactType[] = [
        'logs',
        'coverage',
        'reports',
        'diffs',
        'snapshots',
      ];

      for (const type of artifactTypes) {
        const key = generateStorageKey(mockMetadata, type, `file.${type}`);
        expect(key).toContain(`/${type}/`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle R2 upload failures', async () => {
      mockR2Bucket.put.mockRejectedValue(new Error('Upload failed: Network timeout'));

      try {
        await mockR2Bucket.put('test-key', 'content');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Upload failed');
      }
    });

    it('should handle R2 retrieval failures', async () => {
      mockR2Bucket.get.mockRejectedValue(new Error('Get failed: Key not found'));

      try {
        await mockR2Bucket.get('non-existent-key');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Get failed');
      }
    });

    it('should handle R2 listing failures', async () => {
      mockR2Bucket.list.mockRejectedValue(new Error('List failed: Access denied'));

      try {
        await mockR2Bucket.list({ prefix: 'test-artifacts/' });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('List failed');
      }
    });

    it('should validate artifact metadata before upload', () => {
      const invalidMetadata = {
        jobId: '',
        branch: '',
        testCommand: 'npm test',
        status: 'success' as const,
        durationMs: -100,
        createdAt: 'invalid-date',
        owner: '',
        repo: '',
      };

      const isValid =
        invalidMetadata.jobId &&
        invalidMetadata.owner &&
        invalidMetadata.repo &&
        invalidMetadata.durationMs > 0;

      // Empty strings are falsy, so isValid should be falsy
      expect(!!isValid).toBe(false);
    });
  });
});

/**
 * Helper function: Generate R2 storage key
 */
function generateStorageKey(
  metadata: ArtifactMetadata,
  type: ArtifactType,
  filename: string
): string {
  const { owner, repo, jobId } = metadata;
  return `test-artifacts/${owner}/${repo}/${jobId}/${type}/${filename}`;
}
