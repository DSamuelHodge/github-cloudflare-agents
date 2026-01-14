import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../src/agents/base/BaseAgent';
import type { AgentContext } from '../src/types/agents';
import { Roles } from '../src/agents/roles/roles.schema';
import { globalToolRegistry } from '../src/platform/tools';
import { PrivilegeError } from '../middleware/privilege-check';

class TestAgent extends BaseAgent {
  readonly name = 'test-agent';
  readonly version = '1.0.0';
  readonly triggers = ['issue_comment'];
  private toolId: string;

  constructor(toolId = 'snyk-scan') {
    super({ enabled: true });
    this.toolId = toolId;
  }

  async execute(context: AgentContext) {
    // Attempt to request a tool
    const meta = await this.requestTool(context, this.toolId);
    return this.createSuccessResult('used-tool', { tool: meta.id });
  }
}

describe('BaseAgent tool privilege enforcement', () => {
  it('allows a role to use a permitted tool', async () => {
    // register tool
    globalToolRegistry.register({ id: 'snyk-scan', description: 'Snyk CLI' });

    const agent = new TestAgent('snyk-scan');
    const ctx: AgentContext = {
      requestId: 'r1',
      timestamp: new Date(),
      eventType: 'issue_comment',
      payload: {},
      env: {} as any,
      role: Roles.readonlyService,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      metrics: { increment: () => {}, gauge: () => {}, timing: () => {} },
    };

    const res = await agent.run(ctx);
    if (!res.success) console.error('agent.run result:', res);
    expect(res.success).toBe(true);
    expect(res.action).toBe('used-tool');
  });

  it('blocks a role from using a disallowed tool', async () => {
    const agent = new TestAgent('git-write');
    const ctx: AgentContext = {
      requestId: 'r2',
      timestamp: new Date(),
      eventType: 'issue_comment',
      payload: {},
      env: {} as any,
      role: Roles.readonlyService,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      metrics: { increment: () => {}, gauge: () => {}, timing: () => {} },
    };

    // register a tool the role doesn't have permission for
    globalToolRegistry.register({ id: 'git-write', description: 'Git write' });

    const res = await agent.run(ctx);
    expect(res.success).toBe(false);
    expect(res.error).toContain("not permitted");
  });
});
