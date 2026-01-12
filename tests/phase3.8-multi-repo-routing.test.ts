/**
 * Phase 3.8: Multi-repository webhook routing
 */

import { describe, expect, it } from 'vitest';
import { AgentRegistry } from '../src/agents/registry';
import { RepositoryConfigService } from '../src/platform/repository-config';
import type { IAgent, AgentContext, AgentEnv, AgentResult, AgentLogger, AgentMetrics } from '../src/types/agents';
import { extractRepositoryTarget, hasRepositoryConfigs, resolveRepositoryContext } from '../src/utils/repository';

const noopLogger: AgentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const noopMetrics: AgentMetrics = {
  increment: () => {},
  gauge: () => {},
  timing: () => {},
};

class StubAgent implements IAgent {
  readonly name: string;
  readonly version = '1.0.0';
  readonly triggers: string[] = ['issues'];
  readonly config = { enabled: true };

  constructor(name: string) {
    this.name = name;
  }

  async shouldHandle(): Promise<boolean> {
    return true;
  }

  async execute(): Promise<AgentResult> {
    return { success: true, agentName: this.name };
  }

  async run(context: AgentContext): Promise<AgentResult> {
    return this.execute();
  }
}

const samplePayload = {
  repository: {
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: { login: 'octocat' },
  },
};

const env: AgentEnv = {
  GITHUB_TOKEN: 't',
  GITHUB_BOT_USERNAME: 'bot',
  GITHUB_WEBHOOK_SECRET: 'secret',
  GEMINI_API_KEY: 'key',
  REPO_CONFIG: JSON.stringify({
    defaultRepo: 'octocat/hello-world',
    repositories: {
      'octocat/hello-world': {
        id: 'octocat/hello-world',
        owner: 'octocat',
        repo: 'hello-world',
        enabledAgents: ['AllowedAgent'],
        storagePrefix: '',
      },
    },
  }),
};

describe('Multi-repository routing', () => {
  it('extracts repository target from payload', () => {
    const target = extractRepositoryTarget(samplePayload);
    expect(target).toEqual({ owner: 'octocat', repo: 'hello-world', fullName: 'octocat/hello-world' });
  });

  it('returns null when repository is missing', () => {
    expect(extractRepositoryTarget({})).toBeNull();
  });

  it('resolves repository context with fallback storage prefix', () => {
    const configService = RepositoryConfigService.fromEnvironment({
      TARGET_REPO: env.TARGET_REPO,
      REPO_CONFIG: env.REPO_CONFIG,
    }, noopLogger);

    const target = extractRepositoryTarget(samplePayload);
    expect(target).not.toBeNull();
    if (!target) {
      return;
    }

    const repositoryContext = resolveRepositoryContext(target, configService);
    expect(repositoryContext.storagePrefix).toBe('octocat/hello-world/');
    expect(hasRepositoryConfigs(configService)).toBe(true);
  });

  it('filters agents using repository configuration', async () => {
    const configService = RepositoryConfigService.fromEnvironment({
      TARGET_REPO: env.TARGET_REPO,
      REPO_CONFIG: env.REPO_CONFIG,
    }, noopLogger);

    const registry = new AgentRegistry();
    registry.register(new StubAgent('AllowedAgent'));
    registry.register(new StubAgent('BlockedAgent'));

    const target = extractRepositoryTarget(samplePayload);
    expect(target).not.toBeNull();
    if (!target) {
      return;
    }

    const repositoryContext = resolveRepositoryContext(target, configService);

    const context: AgentContext = {
      requestId: 'req-1',
      timestamp: new Date(),
      eventType: 'issues',
      payload: samplePayload,
      repository: repositoryContext,
      env,
      logger: noopLogger,
      metrics: noopMetrics,
    };

    const results = await registry.executeAll(context);
    const agentNames = results.map(r => r.agentName);

    expect(agentNames).toContain('AllowedAgent');
    expect(agentNames).not.toContain('BlockedAgent');
  });
});
