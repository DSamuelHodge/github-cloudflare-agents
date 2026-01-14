import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/platform/tools/ToolRegistry';

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const r = new ToolRegistry();
    r.register({ id: 'snyk-scan', description: 'Snyk CLI wrapper' });

    expect(r.isRegistered('snyk-scan')).toBe(true);
    const meta = r.get('snyk-scan');
    expect(meta).toBeDefined();
    expect(meta?.id).toBe('snyk-scan');
  });

  it('throws on duplicate registration', () => {
    const r = new ToolRegistry();
    r.register({ id: 't1', description: 't1' });
    expect(() => r.register({ id: 't1', description: 'duplicate' })).toThrow();
  });
});
