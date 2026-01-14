import { describe, it, expect } from 'vitest';
import { SandboxRuntime } from '../src/platform/sandbox/runtime';
import { AuditService } from '../src/platform/audit/AuditService';
import { PluginCapability } from '../src/platform/plugin-sdk/types';

const manifestWithNetwork = {
  name: 'net-plugin',
  version: '1.0.0',
  capabilities: [PluginCapability.NETWORK],
};
const manifestNoNetwork = {
  name: 'local-plugin',
  version: '1.0.0',
  capabilities: [],
};

describe('SandboxRuntime', () => {
  it('rejects execution when manifest declares NETWORK and sandbox denies network', async () => {
    const audit = new AuditService();
    const runtime = new SandboxRuntime({ denyNetwork: true }, audit);

    const entry = async () => ({ ok: true });

    const res = await runtime.execute(manifestWithNetwork as any, entry as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain('network capability is not allowed');

    const events = audit.list();
    expect(events.some((e) => e.action === 'execute.rejected')).toBe(true);
  });

  it('blocks network access at runtime via api.fetch', async () => {
    const audit = new AuditService();
    const runtime = new SandboxRuntime({ denyNetwork: true }, audit);

    const entry = async (api: any) => {
      await api.fetch('https://example.com');
      return { ok: true };
    };

    const res = await runtime.execute(manifestNoNetwork as any, entry as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain('network access blocked');

    const events = audit.list();
    expect(events.some((e) => e.action === 'execute.failed')).toBe(true);
  });

  it('executes successful plugin entry', async () => {
    const audit = new AuditService();
    const runtime = new SandboxRuntime({}, audit);

    const entry = async (_api: any, input: any) => ({ echo: input });

    const res = await runtime.execute(manifestNoNetwork as any, entry as any, { foo: 'bar' });
    expect(res.success).toBe(true);
    expect((res.output as any).echo).toEqual({ foo: 'bar' });

    const events = audit.list();
    expect(events.some((e) => e.action === 'execute.succeeded')).toBe(true);
  });

  it('enforces resource limits (smoke test)', async () => {
    const auditLowMem = new AuditService();
    const runtimeLowMem = new SandboxRuntime({ memoryLimitMb: 8 }, auditLowMem);
    const entry = async () => 'ok';
    const resLowMem = await runtimeLowMem.execute(manifestNoNetwork as any, entry as any);
    expect(resLowMem.success).toBe(false);
    expect(resLowMem.error).toContain('memory limit too low');
    expect(auditLowMem.list().some(e => e.action === 'execute.rejected' && e.message.includes('memory limit too low'))).toBe(true);

    const auditBadCpu = new AuditService();
    const runtimeBadCpu = new SandboxRuntime({ cpuLimitPct: 5 }, auditBadCpu);
    const resBadCpu = await runtimeBadCpu.execute(manifestNoNetwork as any, entry as any);
    expect(resBadCpu.success).toBe(false);
    expect(resBadCpu.error).toContain('cpu limit out of range');
    expect(auditBadCpu.list().some(e => e.action === 'execute.rejected' && e.message.includes('cpu limit out of range'))).toBe(true);
  });
});
