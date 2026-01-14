import { describe, it, expect } from 'vitest';
import { AgentDo, AgentState } from '../../src/platform/durable/AgentDo';

describe('AgentDo Durable Object', () => {
  it('initializes and updates heartbeat', async () => {
    const state: AgentState = { id: 'agent-1', runningJobs: 0 };
    const doInstance = new AgentDo(state);
    expect(doInstance.getState().id).toBe('agent-1');
    expect(doInstance.getState().lastHeartbeat).toBeUndefined();
    await doInstance.heartbeat();
    expect(typeof doInstance.getState().lastHeartbeat).toBe('string');
    expect(doInstance.getAuditTrail().some(e => e.action === 'heartbeat')).toBe(true);
  });

  it('supports start/stop lifecycle and records audit', async () => {
    const state: AgentState = { id: 'agent-2', runningJobs: 0 };
    const doInstance = new AgentDo(state);
    expect(doInstance.getState().status).toBe('stopped');
    await doInstance.start();
    expect(doInstance.getState().status).toBe('running');
    await doInstance.stop();
    expect(doInstance.getState().status).toBe('stopped');
    const actions = doInstance.getAuditTrail().map(e => e.action);
    expect(actions).toContain('start');
    expect(actions).toContain('stop');
  });
});
