/**
 * StreamingService - Manages WebSocket connections for real-time test output
 * Phase 2.4: Real-Time Streaming
 */

import type { Env } from '../../types/env';
import type {
  StreamMessage,
  StreamMessageType,
  LogStreamMessage,
  ProgressStreamMessage,
  StatusStreamMessage,
  ResultStreamMessage,
  StreamConnection,
  JobStreamState,
  SubscriptionRequest,
} from '../../types/streaming';
import { Logger } from '../../utils/logger';

export class StreamingService {
  private logger: Logger;
  private connections: Map<string, StreamConnection> = new Map();
  private jobStreams: Map<string, JobStreamState> = new Map();
  private websockets: Map<string, WebSocket> = new Map();
  
  // Configuration
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly HEARTBEAT_INTERVAL_MS = 30000;
  private readonly CONNECTION_TIMEOUT_MS = 300000; // 5 minutes

  constructor(env: Env) {
    const logLevel = (env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
    this.logger = new Logger(logLevel, { component: 'StreamingService' });
  }

  /**
   * Handle WebSocket upgrade request
   */
  handleWebSocketUpgrade(request: Request): Response {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Generate connection ID
    const connectionId = crypto.randomUUID();

    // Accept the WebSocket connection
    server.accept();

    // Register connection
    const connection: StreamConnection = {
      id: connectionId,
      subscribedJobs: new Set(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      clientInfo: {
        userAgent: request.headers.get('User-Agent') || undefined,
        ip: request.headers.get('CF-Connecting-IP') || undefined,
      },
    };
    this.connections.set(connectionId, connection);
    this.websockets.set(connectionId, server);

    this.logger.info('WebSocket connection established', { connectionId });

    // Send connected message
    this.sendToConnection(connectionId, {
      type: 'connected',
      jobId: '',
      timestamp: new Date().toISOString(),
      data: { connectionId },
    });

    // Set up message handler
    server.addEventListener('message', (event) => {
      this.handleClientMessage(connectionId, event.data as string);
    });

    // Set up close handler
    server.addEventListener('close', () => {
      this.handleConnectionClose(connectionId);
    });

    // Set up error handler
    server.addEventListener('error', (event) => {
      this.logger.error('WebSocket error', undefined, { connectionId });
      this.handleConnectionClose(connectionId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle incoming client message
   */
  private handleClientMessage(connectionId: string, data: string): void {
    try {
      const message = JSON.parse(data) as SubscriptionRequest;
      const connection = this.connections.get(connectionId);
      
      if (!connection) {
        this.logger.warn('Message from unknown connection', { connectionId });
        return;
      }

      // Update last heartbeat
      connection.lastHeartbeat = new Date();

      switch (message.action) {
        case 'subscribe':
          this.subscribeToJob(connectionId, message.jobId);
          break;
        case 'unsubscribe':
          this.unsubscribeFromJob(connectionId, message.jobId);
          break;
        default:
          this.logger.warn('Unknown action', { action: (message as any).action });
      }
    } catch (error) {
      this.logger.error('Failed to parse client message', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Subscribe connection to job stream
   */
  private subscribeToJob(connectionId: string, jobId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.subscribedJobs.add(jobId);

    // Create job stream if it doesn't exist
    if (!this.jobStreams.has(jobId)) {
      this.jobStreams.set(jobId, {
        jobId,
        subscribers: new Set(),
        bufferedMessages: [],
        maxBufferSize: this.MAX_BUFFER_SIZE,
        startedAt: new Date(),
      });
    }

    const jobStream = this.jobStreams.get(jobId)!;
    jobStream.subscribers.add(connectionId);

    this.logger.info('Connection subscribed to job', { connectionId, jobId });

    // Send subscribed confirmation
    this.sendToConnection(connectionId, {
      type: 'subscribed',
      jobId,
      timestamp: new Date().toISOString(),
      data: { message: `Subscribed to job ${jobId}` },
    });

    // Send buffered messages
    for (const msg of jobStream.bufferedMessages) {
      this.sendToConnection(connectionId, msg);
    }
  }

  /**
   * Unsubscribe connection from job stream
   */
  private unsubscribeFromJob(connectionId: string, jobId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.subscribedJobs.delete(jobId);

    const jobStream = this.jobStreams.get(jobId);
    if (jobStream) {
      jobStream.subscribers.delete(connectionId);

      // Clean up empty job streams
      if (jobStream.subscribers.size === 0) {
        this.jobStreams.delete(jobId);
      }
    }

    this.logger.debug('Connection unsubscribed from job', { connectionId, jobId });

    this.sendToConnection(connectionId, {
      type: 'unsubscribed',
      jobId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Unsubscribe from all jobs
    for (const jobId of connection.subscribedJobs) {
      const jobStream = this.jobStreams.get(jobId);
      if (jobStream) {
        jobStream.subscribers.delete(connectionId);
        if (jobStream.subscribers.size === 0) {
          this.jobStreams.delete(jobId);
        }
      }
    }

    // Remove connection
    this.connections.delete(connectionId);
    this.websockets.delete(connectionId);

    this.logger.info('WebSocket connection closed', { connectionId });
  }

  /**
   * Send message to specific connection
   */
  private sendToConnection(connectionId: string, message: StreamMessage): void {
    const ws = this.websockets.get(connectionId);
    if (!ws) return;

    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send message', error instanceof Error ? error : undefined, { connectionId });
      this.handleConnectionClose(connectionId);
    }
  }

  /**
   * Broadcast message to all job subscribers
   */
  broadcastToJob(jobId: string, message: StreamMessage): void {
    const jobStream = this.jobStreams.get(jobId);
    
    // Buffer the message even if no subscribers yet
    if (!jobStream) {
      this.jobStreams.set(jobId, {
        jobId,
        subscribers: new Set(),
        bufferedMessages: [message],
        maxBufferSize: this.MAX_BUFFER_SIZE,
        startedAt: new Date(),
        lastMessageAt: new Date(),
      });
      return;
    }

    // Add to buffer
    jobStream.bufferedMessages.push(message);
    jobStream.lastMessageAt = new Date();

    // Trim buffer if needed
    if (jobStream.bufferedMessages.length > jobStream.maxBufferSize) {
      jobStream.bufferedMessages.shift();
    }

    // Send to all subscribers
    for (const connectionId of jobStream.subscribers) {
      this.sendToConnection(connectionId, message);
    }

    this.logger.debug('Broadcast message to job', { 
      jobId, 
      type: message.type, 
      subscriberCount: jobStream.subscribers.size 
    });
  }

  /**
   * Send log message (stdout/stderr)
   */
  sendLog(jobId: string, content: string, stream: 'stdout' | 'stderr'): void {
    const message: LogStreamMessage = {
      type: stream === 'stderr' ? 'error' : 'log',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        content,
        stream,
      },
    };
    this.broadcastToJob(jobId, message);
  }

  /**
   * Send progress update
   */
  sendProgress(
    jobId: string,
    phase: 'cloning' | 'installing' | 'testing' | 'cleanup',
    percent: number,
    message: string,
    testStats?: { run: number; passed: number; failed: number }
  ): void {
    const progressMessage: ProgressStreamMessage = {
      type: 'progress',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        phase,
        percent,
        message,
        testsRun: testStats?.run,
        testsPassed: testStats?.passed,
        testsFailed: testStats?.failed,
      },
    };
    this.broadcastToJob(jobId, progressMessage);
  }

  /**
   * Send status update (container lifecycle)
   */
  sendStatus(
    jobId: string,
    containerStatus: 'starting' | 'running' | 'idle' | 'stopped' | 'error',
    containerId: string,
    message: string
  ): void {
    const statusMessage: StatusStreamMessage = {
      type: 'status',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        containerStatus,
        containerId,
        message,
      },
    };
    this.broadcastToJob(jobId, statusMessage);
  }

  /**
   * Send final result
   */
  sendResult(
    jobId: string,
    result: {
      status: 'success' | 'failure' | 'timeout' | 'error';
      exitCode?: number;
      durationMs: number;
      summary: { testsRun: number; testsPassed: number; testsFailed: number; testsSkipped: number };
      coverage?: { lines: number; functions: number; branches: number; statements: number };
      artifactUrls?: string[];
    }
  ): void {
    const resultMessage: ResultStreamMessage = {
      type: 'result',
      jobId,
      timestamp: new Date().toISOString(),
      data: result,
    };
    this.broadcastToJob(jobId, resultMessage);

    // Clean up job stream after sending result
    setTimeout(() => {
      this.cleanupJobStream(jobId);
    }, 5000); // Keep stream alive for 5 seconds after result
  }

  /**
   * Clean up job stream
   */
  private cleanupJobStream(jobId: string): void {
    const jobStream = this.jobStreams.get(jobId);
    if (!jobStream) return;

    // Notify subscribers
    for (const connectionId of jobStream.subscribers) {
      this.sendToConnection(connectionId, {
        type: 'closed',
        jobId,
        timestamp: new Date().toISOString(),
        data: { message: 'Job stream closed' },
      });
    }

    this.jobStreams.delete(jobId);
    this.logger.info('Job stream cleaned up', { jobId });
  }

  /**
   * Get active connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get job subscriber count
   */
  getJobSubscriberCount(jobId: string): number {
    return this.jobStreams.get(jobId)?.subscribers.size || 0;
  }

  /**
   * Get streaming stats
   */
  getStats(): {
    activeConnections: number;
    activeJobStreams: number;
    totalSubscriptions: number;
  } {
    let totalSubscriptions = 0;
    for (const [, jobStream] of this.jobStreams) {
      totalSubscriptions += jobStream.subscribers.size;
    }

    return {
      activeConnections: this.connections.size,
      activeJobStreams: this.jobStreams.size,
      totalSubscriptions,
    };
  }
}
