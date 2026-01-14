import { SecurityScanAgent } from '../src/agents/security-scan/agent';
import { describe, it, expect } from 'vitest';

describe('SecurityScanAgent', () => {
  it('should return empty results for no dependencies/files', async () => {
    const agent = new SecurityScanAgent({ enabled: true });
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
    expect(result.data?.snykVulnerabilities).toEqual([]);
    expect(result.data?.codeRabbitFindings).toEqual([]);
  });

  it('should detect Snyk vulnerability for lodash', async () => {
    const agent = new SecurityScanAgent({ enabled: true });
    const result = await agent.run({
      requestId: 'test',
      timestamp: new Date(),
      eventType: 'issues',
      payload: { dependencies: [ { name: 'lodash', version: '4.17.15' } ] },
      env: {} as any,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      metrics: { increment: () => {}, gauge: () => {}, timing: () => {} },
    });
    expect(result.success).toBe(true);
    expect((result.data?.snykVulnerabilities as any[])[0].package).toBe('lodash');
    expect((result.data?.snykVulnerabilities as any[])[0].id).toBe('CVE-2020-8203');
  });

  it('should detect CodeRabbit finding for server.js', async () => {
    const agent = new SecurityScanAgent({ enabled: true });
    const result = await agent.run({
      requestId: 'test',
      timestamp: new Date(),
      eventType: 'issues',
      payload: { files: [ { file: 'src/server.js', content: 'eval("danger")' } ] },
      env: {} as any,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      metrics: { increment: () => {}, gauge: () => {}, timing: () => {} },
    });
    expect(result.success).toBe(true);
    expect((result.data?.codeRabbitFindings as any[])[0].file).toBe('src/server.js');
    expect((result.data?.codeRabbitFindings as any[])[0].issue).toContain('unsafe eval');
    expect((result.data?.codeRabbitFindings as any[])[0].severity).toBe('critical');
  });
});
