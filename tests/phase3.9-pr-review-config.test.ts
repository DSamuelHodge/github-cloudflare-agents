/**
 * Phase 3.9: PR review configuration integration
 */

import { describe, expect, it } from 'vitest';
import { CodeAnalysisService } from '../src/agents/pr-review/services/CodeAnalysisService';
import type { AIClient, AICompletionOptions, AICompletionResponse } from '../src/platform/ai/client';
import type { AgentLogger } from '../src/types/agents';
import type { GitHubPullRequestFile } from '../src/types/github';

const noopLogger: AgentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class StubAIClient {
  private response: AICompletionResponse;

  constructor(response: AICompletionResponse) {
    this.response = response;
  }

  async generateCompletion(_options: AICompletionOptions): Promise<AICompletionResponse> {
    return this.response;
  }
}

const baseFiles: GitHubPullRequestFile[] = [
  {
    sha: '1',
    filename: 'src/app.ts',
    status: 'modified',
    additions: 5,
    deletions: 1,
    changes: 6,
    patch: '@@ -1,1 +1,1 @@',
    blob_url: '',
    raw_url: '',
  },
  {
    sha: '2',
    filename: 'docs/readme.md',
    status: 'modified',
    additions: 2,
    deletions: 0,
    changes: 2,
    patch: '@@ -1,1 +1,1 @@',
    blob_url: '',
    raw_url: '',
  },
];

describe('CodeAnalysisService repository config integration', () => {
  it('filters comments by focus area and minimum severity', async () => {
    const response: AICompletionResponse = {
      content: JSON.stringify([
        { path: 'src/app.ts', line: 10, severity: 'error', category: 'security', message: 'SQL injection risk' },
        { path: 'src/app.ts', line: 12, severity: 'info', category: 'style', message: 'Consider renaming variable' },
      ]),
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      model: 'stub-model',
      finishReason: 'stop',
    };

    const ai = new StubAIClient(response);
    const service = new CodeAnalysisService(ai as unknown as AIClient, noopLogger);

    const result = await service.analyzePR(baseFiles, {
      focusAreas: ['security'],
      minSeverity: 'warning',
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].category).toBe('security');
    expect(result.summary.issuesFound).toBe(1);
    expect(result.summary.bySeverity.error).toBe(1);
    expect(result.summary.bySeverity.info).toBe(0);
  });

  it('applies ignorePatterns to skip files from analysis', async () => {
    const response: AICompletionResponse = {
      content: JSON.stringify([
        { path: 'src/app.ts', line: 5, severity: 'warning', category: 'bugs', message: 'Potential null dereference' },
      ]),
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      model: 'stub-model',
      finishReason: 'stop',
    };

    const ai = new StubAIClient(response);
    const service = new CodeAnalysisService(ai as unknown as AIClient, noopLogger);

    const result = await service.analyzePR(baseFiles, {
      ignorePatterns: ['^docs/'],
    });

    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.analyzedFiles).toBe(1);
    expect(result.comments).toHaveLength(1);
  });
});
