import { describe, it, expect } from 'vitest';
import { AuditService } from '../src/platform/audit/AuditService';

describe('AuditService', () => {
  it('records and redacts secrets in messages', async () => {
    const svc = new AuditService();
    const event = { timestamp: new Date().toISOString(), plugin: 'p', action: 'run', message: 'token ABCDEFGHIJKLMNOPQRSTUVWX secret', metadata: { note: 'mysecret: ABCDEFGHIJKLMNOPQRSTUVWX' } };
    await svc.record(event as any);
    const list = svc.list();
    expect(list.length).toBe(1);
    expect(list[0].message).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWX');
    expect((list[0].metadata as any).note).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWX');
  });
});
