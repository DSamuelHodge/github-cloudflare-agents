import { describe, it, expect } from 'vitest';
import { SandboxDo } from '../../src/platform/durable/SandboxDo';
import { AuditService } from '../../src/platform/audit/AuditService';
import { PluginCapability } from '../../src/platform/plugin-sdk/types';

const manifest = {
  name: 'do-plugin',
  version: '1.0.0',
  capabilities: [PluginCapability.FILESYSTEM],
};

describe('SandboxDo', () => {
  it('runs plugin and records DO state and audit events', async () => {
    const audit = new AuditService();
    const doState = { id: 's1', runningJobs: 0 };
    const sd = new SandboxDo(doState as any, audit);

    const entry = async () => ({ ok: true });

    const res = await sd.runPlugin(manifest as any, entry as any);
    expect(res.success).toBe(true);
    expect(sd.getState().lastRun).toBeDefined();
    expect(sd.getState().runningJobs).toBe(0);

    const events = audit.list();
    // expect at least one orchestration event
    expect(events.some((e) => e.action === 'do.run')).toBe(true);
  });
});
