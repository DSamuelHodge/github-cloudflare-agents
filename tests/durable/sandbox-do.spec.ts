import { describe, it, expect, vi } from 'vitest';
import { SandboxDo, SandboxDoState } from '../../src/platform/durable/SandboxDo';
import type { PluginManifest } from '../../src/platform/sandbox/manifest';
import { AuditService } from '../../src/platform/audit/AuditService';

// Test manifest
const testManifest: PluginManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Test Author',
  entryPoint: 'main',
  capabilities: [],
  resourceLimits: {
    maxExecutionTimeMs: 2000,
    maxMemoryMb: 10,
    maxConcurrentExecutions: 1,
  },
};

describe('SandboxDo Durable Object', () => {
  const testEnv = { PHASE5_ENABLE: 'true' };

  it('initializes with correct state', () => {
    const state: SandboxDoState = {
      id: 'sandbox-1',
      runningJobs: 0,
      auditTrail: []
    };
    const auditService = new AuditService();
    const doInstance = new SandboxDo(state, auditService, testEnv);

    expect(doInstance.getState().id).toBe('sandbox-1');
    expect(doInstance.getState().runningJobs).toBe(0);
    expect(doInstance.getAuditTrail()).toEqual([]);
  });

  it('executes plugin and updates state', async () => {
    const state: SandboxDoState = {
      id: 'sandbox-2',
      runningJobs: 0,
      auditTrail: []
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    } as any;

    const doInstance = new SandboxDo(state, auditService, testEnv);

    const pluginEntry = async () => ({ result: 'success' });

    const result = await doInstance.runPlugin(testManifest, pluginEntry);

    expect(result.success).toBe(true);
    expect((result.output as any).result).toBe('success');

    // Check state updates
    const updatedState = doInstance.getState();
    expect(updatedState.runningJobs).toBe(0); // Should be decremented back
    expect(updatedState.lastRun).toBeDefined();
    expect(typeof updatedState.lastRun).toBe('string');

    // Check audit trail
    const auditTrail = doInstance.getAuditTrail();
    expect(auditTrail.length).toBeGreaterThan(0);
    expect(auditTrail[0].action).toBe('do.run');
    expect(auditTrail[0].message).toContain('test-plugin');
    expect(auditTrail[0].metadata?.success).toBe(true);
  });

  it('handles plugin execution failures', async () => {
    const state: SandboxDoState = {
      id: 'sandbox-3',
      runningJobs: 0,
      auditTrail: []
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    } as any;

    const doInstance = new SandboxDo(state, auditService, testEnv);

    const pluginEntry = async () => {
      throw new Error('Plugin failed');
    };

    const result = await doInstance.runPlugin(testManifest, pluginEntry);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Plugin failed');

    // Check audit trail contains failure
    const auditTrail = doInstance.getAuditTrail();
    expect(auditTrail.length).toBeGreaterThan(0);
    expect(auditTrail[0].metadata?.success).toBe(false);
  });

  it('tracks running jobs correctly', async () => {
    const state: SandboxDoState = {
      id: 'sandbox-4',
      runningJobs: 0,
      auditTrail: []
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    } as any;

    const doInstance = new SandboxDo(state, auditService, testEnv);

    // Start multiple jobs
    const job1 = doInstance.runPlugin(testManifest, async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { job: 1 };
    });

    const job2 = doInstance.runPlugin(testManifest, async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return { job: 2 };
    });

    // Check that jobs are tracked
    expect(doInstance.getState().runningJobs).toBe(2);

    // Wait for completion
    await Promise.all([job1, job2]);

    // Check that jobs are decremented
    expect(doInstance.getState().runningJobs).toBe(0);
  });

  it('records heartbeat events', async () => {
    const state: SandboxDoState = {
      id: 'sandbox-5',
      runningJobs: 2,
      auditTrail: []
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    } as any;

    const doInstance = new SandboxDo(state, auditService, testEnv);

    await doInstance.heartbeat();

    const auditTrail = doInstance.getAuditTrail();
    expect(auditTrail.length).toBe(1);
    expect(auditTrail[0].action).toBe('do.heartbeat');
    expect(auditTrail[0].metadata?.runningJobs).toBe(2);

    expect(auditService.record).toHaveBeenCalledWith({
      timestamp: expect.any(String),
      eventType: 'sandbox_orchestration',
      action: 'heartbeat',
      message: 'Sandbox DO heartbeat',
      metadata: { runningJobs: 2 }
    });
  });
});
