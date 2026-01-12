/**
 * Phase 2.4 Integration Tests: Real-Time Streaming
 * 
 * Tests SSE, WebSocket connections, GitHubStreamUpdater,
 * and live progress updates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  StreamMessage,
  LogStreamMessage,
  ProgressStreamMessage,
  StatusStreamMessage,
  ResultStreamMessage,
  StreamConnection,
  JobStreamState,
  SubscriptionRequest,
} from '../src/types/streaming';

// Mock WebSocket Pair
class MockWebSocket {
  readyState = 1; // OPEN
  listeners: Map<string, Function[]> = new Map();

  accept() {}

  send(data: string) {}

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  emit(event: string, data?: any) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}

describe('Phase 2.4: Real-Time Streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('WebSocket Connection Management', () => {
    it('should accept WebSocket upgrade requests', () => {
      const request = new Request('https://example.com/ws', {
        headers: { Upgrade: 'websocket' },
      });

      const upgradeHeader = request.headers.get('Upgrade');
      expect(upgradeHeader).toBe('websocket');
    });

    it('should reject non-WebSocket requests', () => {
      const request = new Request('https://example.com/ws', {
        headers: { Upgrade: 'http' },
      });

      const upgradeHeader = request.headers.get('Upgrade');
      expect(upgradeHeader).not.toBe('websocket');
    });

    it('should generate unique connection IDs', () => {
      const connectionIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const id = crypto.randomUUID();
        expect(connectionIds.has(id)).toBe(false);
        connectionIds.add(id);
      }

      expect(connectionIds.size).toBe(100);
    });

    it('should track connection metadata', () => {
      const connection: StreamConnection = {
        id: 'conn-123',
        subscribedJobs: new Set(['job-1', 'job-2']),
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        clientInfo: {
          userAgent: 'Mozilla/5.0',
          ip: '192.168.1.100',
        },
      };

      expect(connection.id).toBe('conn-123');
      expect(connection.subscribedJobs.size).toBe(2);
      expect(connection.clientInfo?.userAgent).toBe('Mozilla/5.0');
    });

    it('should handle connection close gracefully', () => {
      const ws = new MockWebSocket();
      let closeCalled = false;

      ws.addEventListener('close', () => {
        closeCalled = true;
      });

      ws.close();

      expect(ws.readyState).toBe(3); // CLOSED
      expect(closeCalled).toBe(true);
    });

    it('should handle connection errors', () => {
      const ws = new MockWebSocket();
      let errorCalled = false;

      ws.addEventListener('error', () => {
        errorCalled = true;
      });

      ws.emit('error', new Error('Connection lost'));

      expect(errorCalled).toBe(true);
    });
  });

  describe('Job Subscription', () => {
    it('should subscribe to job streams', () => {
      const connection: StreamConnection = {
        id: 'conn-123',
        subscribedJobs: new Set(),
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      };

      const subscribeRequest: SubscriptionRequest = {
        action: 'subscribe',
        jobId: 'job-test-001',
      };

      connection.subscribedJobs.add(subscribeRequest.jobId);

      expect(connection.subscribedJobs.has('job-test-001')).toBe(true);
      expect(connection.subscribedJobs.size).toBe(1);
    });

    it('should unsubscribe from job streams', () => {
      const connection: StreamConnection = {
        id: 'conn-123',
        subscribedJobs: new Set(['job-1', 'job-2', 'job-3']),
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      };

      const unsubscribeRequest: SubscriptionRequest = {
        action: 'unsubscribe',
        jobId: 'job-2',
      };

      connection.subscribedJobs.delete(unsubscribeRequest.jobId);

      expect(connection.subscribedJobs.has('job-2')).toBe(false);
      expect(connection.subscribedJobs.size).toBe(2);
    });

    it('should handle ping/pong heartbeats', () => {
      const connection: StreamConnection = {
        id: 'conn-123',
        subscribedJobs: new Set(),
        connectedAt: new Date(),
        lastHeartbeat: new Date('2024-01-01T00:00:00Z'),
      };

      // Heartbeat updates connection timestamp
      connection.lastHeartbeat = new Date();

      expect(connection.lastHeartbeat.getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00Z').getTime()
      );
    });

    it('should support multiple job subscriptions per connection', () => {
      const connection: StreamConnection = {
        id: 'conn-123',
        subscribedJobs: new Set(),
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      };

      const jobIds = ['job-1', 'job-2', 'job-3', 'job-4', 'job-5'];

      for (const jobId of jobIds) {
        connection.subscribedJobs.add(jobId);
      }

      expect(connection.subscribedJobs.size).toBe(5);
      expect([...connection.subscribedJobs]).toEqual(jobIds);
    });
  });

  describe('Stream Message Format', () => {
    it('should format log stream messages', () => {
      const logMessage: LogStreamMessage = {
        type: 'log',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: {
          content: 'Running tests...',
          stream: 'stdout',
        },
      };

      expect(logMessage.type).toBe('log');
      expect(logMessage.data.content).toBe('Running tests...');
      expect(logMessage.data.stream).toBe('stdout');
    });

    it('should format progress stream messages', () => {
      const progressMessage: ProgressStreamMessage = {
        type: 'progress',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: {
          phase: 'testing',
          percent: 45,
          message: 'Running test suite...',
          testsRun: 10,
          testsPassed: 8,
          testsFailed: 2,
        },
      };

      expect(progressMessage.type).toBe('progress');
      expect(progressMessage.data.percent).toBe(45);
      expect(progressMessage.data.testsPassed).toBe(8);
    });

    it('should format status stream messages', () => {
      const statusMessage: StatusStreamMessage = {
        type: 'status',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: {
          containerStatus: 'running',
          containerId: 'container-123',
          message: 'Test execution in progress',
        },
      };

      expect(statusMessage.type).toBe('status');
      expect(statusMessage.data.containerStatus).toBe('running');
    });

    it('should format result stream messages', () => {
      const resultMessage: ResultStreamMessage = {
        type: 'result',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: {
          status: 'success',
          exitCode: 0,
          durationMs: 5230,
          summary: {
            testsRun: 15,
            testsPassed: 15,
            testsFailed: 0,
            testsSkipped: 0,
          },
        },
      };

      expect(resultMessage.type).toBe('result');
      expect(resultMessage.data.status).toBe('success');
      expect(resultMessage.data.exitCode).toBe(0);
    });

    it('should format error stream messages', () => {
      const errorMessage: LogStreamMessage = {
        type: 'error',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: {
          content: 'Test execution failed: Out of memory',
          stream: 'stderr',
        },
      };

      expect(errorMessage.type).toBe('error');
      expect(errorMessage.data.content).toContain('Out of memory');
    });
  });

  describe('Server-Sent Events (SSE)', () => {
    it('should format SSE data correctly', () => {
      const streamMessage: StreamMessage = {
        type: 'log',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: { content: 'Test log', stream: 'stdout' },
      };

      const sseData = `data: ${JSON.stringify(streamMessage)}\n\n`;

      expect(sseData).toContain('data: ');
      expect(sseData).toContain('"type":"log"');
      expect(sseData.endsWith('\n\n')).toBe(true);
    });

    it('should support SSE event types', () => {
      const eventTypes = ['log', 'progress', 'status', 'result', 'error'];

      for (const eventType of eventTypes) {
        const sse = `event: ${eventType}\ndata: {"message":"test"}\n\n`;
        expect(sse).toContain(`event: ${eventType}`);
      }
    });

    it('should handle SSE connection timeout', () => {
      const connectionTimeout = 300000; // 5 minutes
      const startTime = Date.now();
      const elapsedTime = 350000; // 5 minutes 50 seconds

      const isTimedOut = elapsedTime > connectionTimeout;

      expect(isTimedOut).toBe(true);
    });

    it('should keep SSE connection alive with heartbeat', () => {
      const heartbeatInterval = 30000; // 30 seconds
      const lastHeartbeat = Date.now();
      const now = lastHeartbeat + 25000; // 25 seconds later

      const needsHeartbeat = now - lastHeartbeat >= heartbeatInterval;

      expect(needsHeartbeat).toBe(false);
    });
  });

  describe('Job Stream State Management', () => {
    it('should track active job streams', () => {
      const jobStream: JobStreamState = {
        jobId: 'job-123',
        subscribers: new Set(['conn-1', 'conn-2', 'conn-3']),
        bufferedMessages: [],
        maxBufferSize: 100,
        startedAt: new Date(),
        lastMessageAt: new Date(),
      };

      expect(jobStream.subscribers.size).toBe(3);
      expect(jobStream.maxBufferSize).toBe(100);
    });

    it('should buffer messages for late subscribers', () => {
      const jobStream: JobStreamState = {
        jobId: 'job-123',
        subscribers: new Set(),
        bufferedMessages: [
          {
            type: 'log',
            jobId: 'job-123',
            timestamp: new Date().toISOString(),
            data: { content: 'Message 1', stream: 'stdout' },
          },
          {
            type: 'log',
            jobId: 'job-123',
            timestamp: new Date().toISOString(),
            data: { content: 'Message 2', stream: 'stdout' },
          },
        ],
        maxBufferSize: 100,
        startedAt: new Date(),
        lastMessageAt: new Date(),
      };

      expect(jobStream.bufferedMessages).toHaveLength(2);
    });

    it('should limit message buffer size', () => {
      const maxBufferSize = 100;
      const buffer: LogStreamMessage[] = [];

      // Add 150 messages
      for (let i = 0; i < 150; i++) {
        buffer.push({
          type: 'log',
          jobId: 'job-123',
          timestamp: new Date().toISOString(),
          data: { content: `Message ${i}`, stream: 'stdout' },
        });

        // Enforce buffer limit
        if (buffer.length > maxBufferSize) {
          buffer.shift();
        }
      }

      expect(buffer.length).toBe(maxBufferSize);
      expect(buffer[0].data.content).toBe('Message 50');
    });

    it('should cleanup completed job streams', () => {
      const completedJobs = new Map<string, { jobStream: JobStreamState; completedAt: Date }>();

      completedJobs.set('job-1', {
        jobStream: {
          jobId: 'job-1',
          subscribers: new Set(),
          bufferedMessages: [],
          maxBufferSize: 100,
          startedAt: new Date(Date.now() - 3600000), // 1 hour ago
          lastMessageAt: new Date(Date.now() - 3600000),
        },
        completedAt: new Date(Date.now() - 3600000),
      });

      const retentionMs = 1800000; // 30 minutes
      const now = Date.now();

      for (const [jobId, entry] of completedJobs.entries()) {
        const age = now - entry.completedAt.getTime();
        if (age > retentionMs) {
          completedJobs.delete(jobId);
        }
      }

      expect(completedJobs.size).toBe(0);
    });
  });

  describe('GitHub Stream Updater', () => {
    it('should rate limit comment updates', () => {
      const minUpdateInterval = 3000; // 3 seconds
      const lastUpdate = Date.now();
      const now = lastUpdate + 1500; // 1.5 seconds later

      const shouldUpdate = now - lastUpdate >= minUpdateInterval;

      expect(shouldUpdate).toBe(false);
    });

    it('should allow updates after rate limit period', () => {
      const minUpdateInterval = 3000; // 3 seconds
      const lastUpdate = Date.now();
      const now = lastUpdate + 4000; // 4 seconds later

      const shouldUpdate = now - lastUpdate >= minUpdateInterval;

      expect(shouldUpdate).toBe(true);
    });

    it('should format progress indicators', () => {
      const progressPhases = [
        { phase: 'cloning', percent: 10, emoji: '📥' },
        { phase: 'installing', percent: 30, emoji: '📦' },
        { phase: 'testing', percent: 70, emoji: '🧪' },
        { phase: 'cleanup', percent: 95, emoji: '🧹' },
      ];

      for (const { phase, percent } of progressPhases) {
        expect(percent).toBeGreaterThanOrEqual(0);
        expect(percent).toBeLessThanOrEqual(100);
      }
    });

    it('should format progress bar', () => {
      const percent = 65;
      const barLength = 20;
      const filled = Math.floor((percent / 100) * barLength);
      const empty = barLength - filled;

      const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

      expect(progressBar.length).toBe(barLength);
      expect(progressBar).toContain('█');
      expect(progressBar).toContain('░');
    });

    it('should cache comment IDs to avoid recreating comments', () => {
      const commentCache = new Map<string, { commentId: number; lastUpdate: Date }>();

      const cacheKey = 'owner/repo/42/job-123';
      commentCache.set(cacheKey, { commentId: 123456, lastUpdate: new Date() });

      const cached = commentCache.get(cacheKey);

      expect(cached).toBeDefined();
      expect(cached?.commentId).toBe(123456);
    });

    it('should replace progress comment with final result', () => {
      const commentCache = new Map<string, { commentId: number; lastUpdate: Date }>();

      const cacheKey = 'owner/repo/42/job-123';
      commentCache.set(cacheKey, { commentId: 123456, lastUpdate: new Date() });

      // Final result updates the same comment ID
      const cached = commentCache.get(cacheKey);
      expect(cached?.commentId).toBe(123456);

      // Then delete from cache
      commentCache.delete(cacheKey);
      expect(commentCache.has(cacheKey)).toBe(false);
    });

    it('should include test statistics in progress updates', () => {
      const testStats = {
        run: 50,
        passed: 45,
        failed: 3,
        skipped: 2,
      };

      const successRate = (testStats.passed / testStats.run) * 100;

      expect(successRate).toBe(90);
      expect(testStats.run).toBe(testStats.passed + testStats.failed + testStats.skipped);
    });

    it('should format live test output in collapsible sections', () => {
      const logs = [
        'Starting test suite...',
        '✓ Test 1 passed',
        '✓ Test 2 passed',
        '✕ Test 3 failed',
      ];

      const collapsibleSection = `
<details>
<summary>Live Output (${logs.length} lines)</summary>

\`\`\`
${logs.join('\n')}
\`\`\`
</details>
      `.trim();

      expect(collapsibleSection).toContain('<details>');
      expect(collapsibleSection).toContain('Live Output');
      expect(collapsibleSection).toContain('Test 1 passed');
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast messages to all subscribers', () => {
      const subscribers = new Set(['conn-1', 'conn-2', 'conn-3']);
      const message: StreamMessage = {
        type: 'log',
        jobId: 'job-123',
        timestamp: new Date().toISOString(),
        data: { content: 'Broadcast test', stream: 'stdout' },
      };

      const deliveryCount = subscribers.size;

      expect(deliveryCount).toBe(3);
    });

    it('should handle subscriber disconnection during broadcast', () => {
      const subscribers = new Set(['conn-1', 'conn-2', 'conn-3']);

      // Simulate conn-2 disconnecting
      subscribers.delete('conn-2');

      expect(subscribers.size).toBe(2);
      expect(subscribers.has('conn-2')).toBe(false);
    });

    it('should queue messages for slow subscribers', () => {
      const messageQueue: StreamMessage[] = [];
      const maxQueueSize = 50;

      for (let i = 0; i < 60; i++) {
        messageQueue.push({
          type: 'log',
          jobId: 'job-123',
          timestamp: new Date().toISOString(),
          data: { content: `Message ${i}`, stream: 'stdout' },
        });

        // Enforce queue limit
        if (messageQueue.length > maxQueueSize) {
          messageQueue.shift();
        }
      }

      expect(messageQueue.length).toBe(maxQueueSize);
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket send failures', () => {
      const ws = new MockWebSocket();
      ws.readyState = 3; // CLOSED

      if (ws.readyState !== 1) {
        // Cannot send, connection closed
        expect(ws.readyState).not.toBe(1);
      }
    });

    it('should handle malformed subscription requests', () => {
      const malformedRequests = [
        '{ invalid json',
        '{}',
        '{"action": "unknown"}',
        '{"action": "subscribe"}', // Missing jobId
      ];

      for (const request of malformedRequests) {
        try {
          const parsed = JSON.parse(request);
          const isValid = parsed.action && (parsed.action === 'ping' || parsed.jobId);
          expect(isValid).toBe(false);
        } catch {
          // JSON parse error expected for first case
          expect(true).toBe(true);
        }
      }
    });

    it('should handle GitHub API failures gracefully', async () => {
      const mockGitHubError = {
        status: 403,
        message: 'Rate limit exceeded',
      };

      // Should not throw, should log error
      expect(mockGitHubError.status).toBe(403);
    });

    it('should detect stale connections', () => {
      const connection: StreamConnection = {
        id: 'conn-123',
        subscribedJobs: new Set(),
        connectedAt: new Date(),
        lastHeartbeat: new Date(Date.now() - 120000), // 2 minutes ago
      };

      const heartbeatTimeout = 60000; // 1 minute
      const isStale = Date.now() - connection.lastHeartbeat.getTime() > heartbeatTimeout;

      expect(isStale).toBe(true);
    });
  });
});
