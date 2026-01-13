import { describe, it, expect } from 'vitest';
import { SandboxRunner } from '../src/platform/sandbox';
import { PluginCapability } from '../src/platform/plugin-sdk/types';

const manifestWithNetwork = {
  name: 'net-plugin',
  version: '0.0.1',
  capabilities: [PluginCapability.NETWORK as any],
  entrypoint: 'index.js',
};

const manifestNoNetwork = {
  name: 'safe-plugin',
  version: '0.0.1',
  capabilities: [],
  entrypoint: 'index.js',
};

describe('SandboxRunner policy checks', () => {
  it('blocks network when denyNetwork is true', async () => {
    const s = new SandboxRunner({ denyNetwork: true });
    const res = await s.execute(manifestWithNetwork as any, {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/network capability/);
  });

  it('allows execution when capabilities are permitted', async () => {
    const s = new SandboxRunner({ denyNetwork: true });
    const res = await s.execute(manifestNoNetwork as any, {});
    expect(res.success).toBe(true);
    expect((res.output as any).message).toMatch(/simulated/);
  });
});
