/**
 * Container HTTP server
 * Receives test job requests and executes them using git-worktree-runner
 *
 * This server runs inside the Docker container and handles:
 * - /test endpoint: Execute test jobs
 * - /status endpoint: Container health check
 * - /stop endpoint: Graceful shutdown
 */

import { spawn } from 'child_process';

interface TestJobRequest {
  jobId: string;
  branch: string;
  command: string;
  timeoutMs: number;
  env: Record<string, string>;
  context?: {
    owner: string;
    repo: string;
    prNumber?: number;
    issueNumber?: number;
  };
  createdAt: string;
  streamUrl?: string; // Optional WebSocket URL for streaming
}

interface TestResult {
  jobId: string;
  status: 'success' | 'failure' | 'timeout' | 'error';
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  containerId: string;
  completedAt: Date;
  error?: string;
}

interface StreamMessage {
  type: 'log' | 'error' | 'progress' | 'status' | 'result';
  jobId: string;
  timestamp: string;
  data: any;
}

// Simple HTTP server (for demo purposes - would use Express/Fastify in production)
const port = process.env.PORT || 4000;
const containerId = process.env.CLOUDFLARE_DEPLOYMENT_ID || 'local';

console.log(`Starting container server on port ${port}`);
console.log(`Container ID: ${containerId}`);

// Track running jobs
const runningJobs = new Map<string, { process: any; startTime: number }>();

// Track SSE connections for streaming
const sseConnections = new Map<string, any[]>(); // jobId -> response objects

/**
 * Send SSE message to all connected clients for a job
 */
function broadcastToJob(jobId: string, message: StreamMessage): void {
  const connections = sseConnections.get(jobId) || [];
  const data = `data: ${JSON.stringify(message)}\n\n`;
  
  for (const res of connections) {
    try {
      res.write(data);
    } catch (e) {
      // Connection closed, will be cleaned up
    }
  }
}

/**
 * Execute test job using git-worktree-runner
 */
async function executeTestJob(job: TestJobRequest): Promise<TestResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    // Prepare environment variables
    const env = {
      ...process.env,
      ...job.env,
      JOB_ID: job.jobId,
      BRANCH: job.branch,
      TEST_COMMAND: job.command,
      TIMEOUT_SECONDS: String(Math.floor(job.timeoutMs / 1000)),
      REPO_URL: job.context
        ? `https://github.com/${job.context.owner}/${job.context.repo}.git`
        : '',
    };

    // Execute test runner script
    const testProcess = spawn('/bin/bash', ['/workspace/test-runner.sh'], {
      env,
      cwd: '/workspace',
    });

    // Track running job
    runningJobs.set(job.jobId, {
      process: testProcess,
      startTime,
    });

    // Capture stdout
    testProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      console.log(`[${job.jobId}] ${output}`);
      
      // Broadcast to SSE clients
      broadcastToJob(job.jobId, {
        type: 'log',
        jobId: job.jobId,
        timestamp: new Date().toISOString(),
        data: { content: output, stream: 'stdout' },
      });
    });

    // Capture stderr
    testProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      console.error(`[${job.jobId}] ${output}`);
      
      // Broadcast to SSE clients
      broadcastToJob(job.jobId, {
        type: 'error',
        jobId: job.jobId,
        timestamp: new Date().toISOString(),
        data: { content: output, stream: 'stderr' },
      });
    });

    // Handle process completion
    testProcess.on('close', (exitCode: number) => {
      const durationMs = Date.now() - startTime;
      runningJobs.delete(job.jobId);

      let status: TestResult['status'] = 'success';
      if (exitCode === 124) {
        status = 'timeout';
      } else if (exitCode !== 0) {
        status = 'failure';
      }

      const result = {
        jobId: job.jobId,
        status,
        exitCode,
        stdout,
        stderr,
        durationMs,
        containerId,
        completedAt: new Date(),
      };

      // Broadcast result to SSE clients
      broadcastToJob(job.jobId, {
        type: 'result',
        jobId: job.jobId,
        timestamp: new Date().toISOString(),
        data: result,
      });

      // Clean up SSE connections for this job
      sseConnections.delete(job.jobId);

      resolve(result);
    });

    // Handle process errors
    testProcess.on('error', (error: Error) => {
      const durationMs = Date.now() - startTime;
      runningJobs.delete(job.jobId);

      const result = {
        jobId: job.jobId,
        status: 'error' as const,
        stdout,
        stderr,
        durationMs,
        containerId,
        completedAt: new Date(),
        error: error.message,
      };

      // Broadcast error to SSE clients
      broadcastToJob(job.jobId, {
        type: 'result',
        jobId: job.jobId,
        timestamp: new Date().toISOString(),
        data: result,
      });

      // Clean up SSE connections for this job
      sseConnections.delete(job.jobId);

      resolve(result);
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      if (runningJobs.has(job.jobId)) {
        console.error(`[${job.jobId}] Job timed out after ${job.timeoutMs}ms`);
        testProcess.kill('SIGTERM');
      }
    }, job.timeoutMs);

    // Clear timeout when process completes
    testProcess.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}

/**
 * Simple HTTP request handler
 * In production, would use Express/Fastify
 */
async function handleRequest(req: any, res: any) {
  const url = new URL(req.url, `http://localhost:${port}`);

  // Health check endpoint
  if (url.pathname === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'running',
        containerId,
        runningJobs: Array.from(runningJobs.keys()),
        sseConnections: Array.from(sseConnections.keys()),
        uptime: process.uptime(),
      })
    );
    return;
  }

  // SSE streaming endpoint (Phase 2.4)
  if (url.pathname === '/stream' && req.method === 'GET') {
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing jobId parameter' }));
      return;
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Register this connection for the job
    if (!sseConnections.has(jobId)) {
      sseConnections.set(jobId, []);
    }
    const list = sseConnections.get(jobId);
    if (list) {
      list.push(res);
    } else {
      // Unexpected: initialize list defensively
      sseConnections.set(jobId, [res]);
    }

    console.log(`[SSE] Client connected for job ${jobId}`);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      jobId,
      timestamp: new Date().toISOString(),
      data: { message: 'Connected to stream' },
    })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[SSE] Client disconnected from job ${jobId}`);
      const connections = sseConnections.get(jobId) || [];
      const index = connections.indexOf(res);
      if (index > -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        sseConnections.delete(jobId);
      }
    });

    return;
  }

  // Stop endpoint
  if (url.pathname === '/stop' && req.method === 'POST') {
    console.log('Received stop signal, shutting down gracefully...');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Shutting down' }));

    // Kill all running jobs
    for (const [jobId, { process: proc }] of runningJobs.entries()) {
      console.log(`Killing job ${jobId}`);
      proc.kill('SIGTERM');
    }

    setTimeout(() => {
      process.exit(0);
    }, 1000);
    return;
  }

  // Test execution endpoint
  if (url.pathname === '/test' && req.method === 'POST') {
    let body = '';

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const job: TestJobRequest = JSON.parse(body);

        console.log(`Received test job ${job.jobId} for branch ${job.branch}`);

        const result = await executeTestJob(job);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Error executing test job:', error);

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })
        );
      }
    });

    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Start HTTP server using Node.js built-in http module
import * as http from 'http';

const server = http.createServer(handleRequest);

server.listen(port, () => {
  console.log(`Container server listening on port ${port}`);
});

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');

  // Kill all running jobs
  for (const [jobId, { process: proc }] of runningJobs.entries()) {
    console.log(`Killing job ${jobId}`);
    proc.kill('SIGTERM');
  }

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 15 minutes (Cloudflare grace period)
  setTimeout(() => {
    console.error('Forced shutdown after grace period');
    process.exit(1);
  }, 15 * 60 * 1000);
});
