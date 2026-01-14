import { CodeGenerationAgent } from '../src/agents/code-generation/agent';
import { describe, it, expect } from 'vitest';

describe('CodeGenerationAgent', () => {
  it('should return placeholder logs and files', async () => {
    const agent = new CodeGenerationAgent({ enabled: true });
    const result = await agent.run({
      requestId: 'test',
      timestamp: new Date(),
      eventType: 'issues',
      payload: {},
      env: {} as any,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      metrics: { increment: () => {}, gauge: () => {}, timing: () => {} },
    });
    expect(result.success).toBe(true);
    expect(result.data?.files).toEqual([]);
    expect((result.data?.logs as string[]).length).toBeGreaterThan(0);
  });
});
