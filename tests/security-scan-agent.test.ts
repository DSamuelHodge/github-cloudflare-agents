import { SecurityScanAgent } from '../src/agents/security-scan/agent';
import { describe, it, expect } from 'vitest';

describe('SecurityScanAgent', () => {
  it('should return empty results for no dependencies/files', async () => {
    const agent = new SecurityScanAgent({ name: 'SecurityScanAgent', version: '1.0.0', description: 'Test' });
    const result = await agent.run({ payload: {} } as any);
    expect(result.snykVulnerabilities).toEqual([]);
    expect(result.codeRabbitFindings).toEqual([]);
  });

  it('should detect Snyk vulnerability for lodash', async () => {
    const agent = new SecurityScanAgent({ name: 'SecurityScanAgent', version: '1.0.0', description: 'Test' });
    const result = await agent.run({ payload: { dependencies: [ { name: 'lodash', version: '4.17.15' } ] } } as any);
    expect(result.snykVulnerabilities[0].package).toBe('lodash');
    expect(result.snykVulnerabilities[0].id).toBe('CVE-2020-8203');
  });

  it('should detect CodeRabbit finding for server.js', async () => {
    const agent = new SecurityScanAgent({ name: 'SecurityScanAgent', version: '1.0.0', description: 'Test' });
    const result = await agent.run({ payload: { files: [ { file: 'src/server.js', content: 'eval("danger")' } ] } } as any);
    expect(result.codeRabbitFindings[0].file).toBe('src/server.js');
    expect(result.codeRabbitFindings[0].issue).toContain('unsafe eval');
    expect(result.codeRabbitFindings[0].severity).toBe('critical');
  });
});
