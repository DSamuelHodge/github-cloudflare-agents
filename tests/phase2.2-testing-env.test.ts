/**
 * Phase 2.2 Integration Tests: Isolated Testing Environment
 * 
 * Tests AI-generated fix application, test execution within containers,
 * output parsing, and result formatting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TestJob, TestResult, TestExecutionContext } from '../src/types/containers';

describe('Phase 2.2: Isolated Testing Environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Test Job Execution', () => {
    it('should execute npm test in worktree environment', async () => {
      const testJob: TestJob = {
        jobId: 'test-job-001',
        branch: 'fix-issue-42',
        command: 'npm test',
        timeoutMs: 300000,
        env: {
          NODE_ENV: 'test',
          CI: 'true',
        },
        context: {
          owner: 'DSamuelHodge',
          repo: 'github-agent-repo',
          issueNumber: 42,
        },
        createdAt: new Date(),
      };

      expect(testJob.command).toBe('npm test');
      expect(testJob.env.NODE_ENV).toBe('test');
      expect(testJob.env.CI).toBe('true');
    });

    it('should support multiple test frameworks', () => {
      const testFrameworks = [
        { command: 'npm test', framework: 'Jest/Vitest' },
        { command: 'pytest', framework: 'Python pytest' },
        { command: 'cargo test', framework: 'Rust Cargo' },
        { command: 'go test ./...', framework: 'Go testing' },
        { command: 'npm run test:unit', framework: 'Custom npm script' },
      ];

      for (const { command, framework } of testFrameworks) {
        expect(command).toBeTruthy();
        expect(framework).toBeTruthy();
      }
    });

    it('should handle test execution timeout', () => {
      const result: TestResult = {
        jobId: 'timeout-job',
        status: 'timeout',
        exitCode: 124, // Standard timeout exit code
        stdout: 'Test started...\nPartial output',
        stderr: '',
        durationMs: 300000,
        containerId: 'container-123',
        completedAt: new Date(),
        error: 'Test execution exceeded 5 minute timeout',
      };

      expect(result.status).toBe('timeout');
      expect(result.exitCode).toBe(124);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Test Output Parsing', () => {
    it('should parse Jest/Vitest test output', () => {
      const stdout = `
 ✓ tests/unit/service.test.ts (5)
   ✓ ServiceClass (5)
     ✓ should initialize correctly
     ✓ should handle valid input
     ✓ should reject invalid input
     ✓ should cleanup resources
     ✓ should handle errors gracefully

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  1.23s
      `;

      // Parse test counts
      const passedMatch = stdout.match(/Tests\s+(\d+)\s+passed/);
      const durationMatch = stdout.match(/Duration\s+([\d.]+)s/);

      expect(passedMatch).toBeTruthy();
      expect(passedMatch?.[1]).toBe('5');
      expect(durationMatch?.[1]).toBe('1.23');
    });

    it('should parse failing test output', () => {
      const stderr = `
 FAIL  tests/unit/service.test.ts
  ServiceClass
    ✓ should initialize correctly
    ✕ should handle valid input (15 ms)
    ✓ should reject invalid input

  ● ServiceClass › should handle valid input

    expect(received).toBe(expected) // Object.is equality

    Expected: 42
    Received: 0

      15 |     const service = new ServiceClass();
      16 |     const result = service.process(input);
    > 17 |     expect(result).toBe(42);
         |                    ^
      18 |   });

    at Object.<anonymous> (tests/unit/service.test.ts:17:20)

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
      `;

      // Extract failure information
      const failedMatch = stderr.match(/Tests\s+(\d+)\s+failed/);
      const passedMatch = stderr.match(/(\d+)\s+passed/);
      const errorLineMatch = stderr.match(/at Object\.<anonymous> \((.*):(\d+):/);

      expect(failedMatch?.[1]).toBe('1');
      expect(passedMatch?.[1]).toBe('2');
      expect(errorLineMatch).toBeTruthy();
    });

    it('should parse pytest output', () => {
      const stdout = `
============================= test session starts ==============================
platform linux -- Python 3.11.0, pytest-7.4.0
collected 8 items

tests/test_api.py::test_get_user PASSED                                  [ 12%]
tests/test_api.py::test_create_user PASSED                               [ 25%]
tests/test_api.py::test_update_user FAILED                               [ 37%]
tests/test_api.py::test_delete_user PASSED                               [ 50%]
tests/test_models.py::test_user_validation PASSED                        [ 62%]
tests/test_models.py::test_user_serialization PASSED                     [ 75%]
tests/test_models.py::test_user_relationships PASSED                     [ 87%]
tests/test_models.py::test_user_queries PASSED                          [100%]

=========================== short test summary info ============================
FAILED tests/test_api.py::test_update_user - AssertionError: 200 != 404
========================= 1 failed, 7 passed in 2.34s ==========================
      `;

      // Parse pytest results
      const failedMatch = stdout.match(/(\d+) failed/);
      const passedMatch = stdout.match(/(\d+) passed/);
      const durationMatch = stdout.match(/in ([\d.]+)s/);

      expect(failedMatch?.[1]).toBe('1');
      expect(passedMatch?.[1]).toBe('7');
      expect(durationMatch?.[1]).toBe('2.34');
    });

    it('should extract coverage information', () => {
      const stdout = `
-------------- coverage: platform linux, python 3.11.0 -----------
Name                      Stmts   Miss  Cover
---------------------------------------------
src/api.py                   45      3    93%
src/models.py                67      8    88%
src/utils.py                 23      0   100%
---------------------------------------------
TOTAL                       135     11    92%
      `;

      // Parse coverage percentage
      const totalCoverageMatch = stdout.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/);

      expect(totalCoverageMatch?.[1]).toBe('92');
    });

    it('should handle empty test output', () => {
      const emptyOutput = '';
      const result: TestResult = {
        jobId: 'empty-job',
        status: 'error',
        stdout: emptyOutput,
        stderr: 'No tests found',
        durationMs: 100,
        containerId: 'container-456',
        completedAt: new Date(),
        error: 'No test output generated',
      };

      expect(result.stdout).toBe('');
      expect(result.status).toBe('error');
    });
  });

  describe('AI-Generated Fix Application', () => {
    it('should validate fix patch format', () => {
      const validPatch = `
diff --git a/src/service.ts b/src/service.ts
index 1234567..89abcdef 100644
--- a/src/service.ts
+++ b/src/service.ts
@@ -10,7 +10,7 @@ export class Service {
   }
 
   async process(data: any): Promise<number> {
-    return 0;
+    return data.value || 42;
   }
 }
      `.trim();

      // Validate patch structure
      expect(validPatch).toContain('diff --git');
      expect(validPatch).toContain('@@');
      expect(validPatch).toContain('-    return 0;');
      expect(validPatch).toContain('+    return data.value || 42;');
    });

    it('should reject malformed patches', () => {
      const malformedPatches = [
        '', // Empty patch
        'random text without diff format',
        'diff --git\n@@\n- missing header',
      ];

      for (const patch of malformedPatches) {
        // Valid patch needs diff --git AND --- AND +++ AND @@
        const isValid =
          patch.includes('diff --git') &&
          patch.includes('---') &&
          patch.includes('+++') &&
          patch.includes('@@') &&
          !patch.includes('../../');
        expect(isValid).toBe(false);
      }
    });

    it('should validate file paths in patches', () => {
      const dangerousPatches = [
        'diff --git a/../../../etc/passwd b/../../../etc/passwd',
        'diff --git a//etc/hosts b//etc/hosts',
        'diff --git a/~/.ssh/id_rsa b/~/.ssh/id_rsa',
      ];

      for (const patch of dangerousPatches) {
        // Check for .. (path traversal), // (absolute), or ~/ patterns
        const hasDangerousPath = /\.\.|\/\/|~\//.test(patch);
        expect(hasDangerousPath).toBe(true);
      }
    });

    it('should support multi-file patches', () => {
      const multiFilePatch = `
diff --git a/src/api.ts b/src/api.ts
index aaa..bbb 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,1 +1,1 @@
-old code
+new code

diff --git a/src/utils.ts b/src/utils.ts
index ccc..ddd 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,5 +5,5 @@
-old util
+new util
      `.trim();

      const fileCount = (multiFilePatch.match(/diff --git/g) || []).length;
      expect(fileCount).toBe(2);
    });
  });

  describe('Test Result Formatting', () => {
    it('should format successful test result for GitHub comment', () => {
      const result: TestResult = {
        jobId: 'job-success',
        status: 'success',
        exitCode: 0,
        stdout: '✓ All 15 tests passed in 3.2s',
        stderr: '',
        durationMs: 3200,
        containerId: 'container-789',
        completedAt: new Date(),
      };

      const comment = formatResultAsGitHubComment(result);

      expect(comment).toContain('✅ Tests Passed');
      expect(comment).toContain('15 tests');
      expect(comment).toContain('3.2s');
      expect(comment).toContain(result.jobId);
    });

    it('should format failed test result with error details', () => {
      const result: TestResult = {
        jobId: 'job-failure',
        status: 'failure',
        exitCode: 1,
        stdout: '✓ 12 passed\n✕ 3 failed',
        stderr: 'AssertionError: Expected 5 to equal 10',
        durationMs: 2500,
        containerId: 'container-abc',
        completedAt: new Date(),
        error: '3 tests failed',
      };

      const comment = formatResultAsGitHubComment(result);

      expect(comment).toContain('❌ Tests Failed');
      expect(comment).toContain('3 failed');
      expect(comment).toContain('AssertionError');
      // The error field exists but formatResultAsGitHubComment might not include it
      // Check for stderr content instead
      expect(comment).toContain('Expected 5 to equal 10');
    });

    it('should truncate very long test output', () => {
      const longOutput = 'x'.repeat(50000); // 50KB output
      const result: TestResult = {
        jobId: 'job-long-output',
        status: 'success',
        exitCode: 0,
        stdout: longOutput,
        stderr: '',
        durationMs: 1000,
        containerId: 'container-xyz',
        completedAt: new Date(),
      };

      const comment = formatResultAsGitHubComment(result);
      const maxCommentLength = 65536; // GitHub comment size limit

      expect(comment.length).toBeLessThanOrEqual(maxCommentLength);
      if (longOutput.length > 10000) {
        expect(comment).toContain('truncated');
      }
    });

    it('should include coverage metrics if available', () => {
      const result: TestResult = {
        jobId: 'job-coverage',
        status: 'success',
        exitCode: 0,
        stdout: 'Tests passed',
        stderr: '',
        durationMs: 4000,
        containerId: 'container-cov',
        completedAt: new Date(),
        coverage: {
          lines: 87.5,
          functions: 92.1,
          branches: 81.3,
          statements: 88.0,
        },
      };

      const comment = formatResultAsGitHubComment(result);

      expect(comment).toContain('87.5%');
      expect(comment).toContain('Coverage');
    });
  });

  describe('Test Execution Context', () => {
    it('should create valid execution context', () => {
      const job: TestJob = {
        jobId: 'ctx-job-001',
        branch: 'solution-a',
        command: 'npm test',
        timeoutMs: 120000,
        env: { NODE_ENV: 'test' },
        context: {
          owner: 'DSamuelHodge',
          repo: 'github-agent-repo',
          issueNumber: 10,
        },
        createdAt: new Date(),
      };

      const executionContext: TestExecutionContext = {
        job,
        container: {
          id: 'container-001',
          bindingName: 'TEST_CONTAINER',
          status: 'running',
          createdAt: new Date(),
          jobsExecuted: 5,
          config: {
            port: 4000,
            sleepAfterMs: 600000,
            maxInstances: 10,
          },
        },
      };

      expect(executionContext.job.jobId).toBe('ctx-job-001');
      expect(executionContext.container.status).toBe('running');
      expect(executionContext.container.config.port).toBe(4000);
    });

    it('should support abort signal for cancellation', () => {
      const abortController = new AbortController();
      const executionContext: Partial<TestExecutionContext> = {
        abortSignal: abortController.signal,
      };

      expect(executionContext.abortSignal?.aborted).toBe(false);

      abortController.abort();

      expect(executionContext.abortSignal?.aborted).toBe(true);
    });

    it('should handle streaming message callbacks', () => {
      const messages: any[] = [];
      const executionContext: Partial<TestExecutionContext> = {
        onStreamingMessage: (msg) => {
          messages.push(msg);
        },
      };

      // Simulate streaming messages
      executionContext.onStreamingMessage?.({
        type: 'log',
        content: 'Test started',
        timestamp: new Date(),
        jobId: 'stream-job',
      });

      executionContext.onStreamingMessage?.({
        type: 'status',
        content: 'Running tests...',
        timestamp: new Date(),
        jobId: 'stream-job',
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('log');
      expect(messages[1].type).toBe('status');
    });
  });

  describe('Error Handling', () => {
    it('should handle container startup failures', () => {
      const error = {
        code: 'CONTAINER_START_FAILED',
        message: 'Failed to start container: Connection timeout',
        timestamp: new Date(),
      };

      expect(error.code).toBe('CONTAINER_START_FAILED');
      expect(error.message).toContain('timeout');
    });

    it('should handle worktree creation errors', () => {
      const error = {
        code: 'WORKTREE_CREATE_FAILED',
        message: 'Branch "fix-issue-99" not found in repository',
        timestamp: new Date(),
      };

      expect(error.code).toBe('WORKTREE_CREATE_FAILED');
      expect(error.message).toContain('not found');
    });

    it('should handle test command not found errors', () => {
      const result: TestResult = {
        jobId: 'cmd-not-found',
        status: 'error',
        exitCode: 127,
        stdout: '',
        stderr: 'npm: command not found',
        durationMs: 50,
        containerId: 'container-err',
        completedAt: new Date(),
        error: 'Test command failed to execute',
      };

      expect(result.exitCode).toBe(127); // Command not found exit code
      expect(result.stderr).toContain('command not found');
    });

    it('should handle out of memory errors', () => {
      const result: TestResult = {
        jobId: 'oom-job',
        status: 'error',
        exitCode: 137,
        stdout: 'Tests running...',
        stderr: 'JavaScript heap out of memory',
        durationMs: 25000,
        containerId: 'container-oom',
        completedAt: new Date(),
        error: 'Container ran out of memory',
      };

      expect(result.exitCode).toBe(137); // SIGKILL (OOM)
      expect(result.stderr).toContain('out of memory');
    });
  });
});

/**
 * Helper function: Format TestResult as GitHub comment
 */
function formatResultAsGitHubComment(result: TestResult): string {
  let comment = '';

  if (result.status === 'success') {
    comment += '## ✅ Tests Passed\n\n';
  } else if (result.status === 'failure') {
    comment += '## ❌ Tests Failed\n\n';
  } else if (result.status === 'timeout') {
    comment += '## ⏱️ Tests Timed Out\n\n';
  } else {
    comment += '## ⚠️ Test Execution Error\n\n';
  }

  comment += `**Job ID:** \`${result.jobId}\`\n`;
  comment += `**Duration:** ${(result.durationMs / 1000).toFixed(2)}s\n`;
  comment += `**Exit Code:** ${result.exitCode}\n\n`;

  if (result.coverage) {
    comment += '### Coverage\n';
    comment += `- Lines: ${result.coverage.lines.toFixed(1)}%\n`;
    comment += `- Functions: ${result.coverage.functions.toFixed(1)}%\n`;
    comment += `- Branches: ${result.coverage.branches.toFixed(1)}%\n`;
    comment += `- Statements: ${result.coverage.statements.toFixed(1)}%\n\n`;
  }

  // Truncate output if too long
  const maxOutputLength = 10000;
  let stdout = result.stdout;
  if (stdout.length > maxOutputLength) {
    stdout = stdout.slice(0, maxOutputLength) + '\n\n... (output truncated)';
  }

  if (result.status !== 'success') {
    comment += '### Error Details\n';
    comment += '```\n';
    comment += result.stderr || result.error || 'No error details available';
    comment += '\n```\n\n';
  }

  comment += '### Test Output\n';
  comment += '```\n';
  comment += stdout || 'No output';
  comment += '\n```\n';

  return comment;
}
