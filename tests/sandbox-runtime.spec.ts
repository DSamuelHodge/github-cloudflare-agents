import { describe, it, expect, vi } from 'vitest';
import { SandboxRuntime } from '../src/platform/sandbox/runtime';
import { PluginCapability } from '../src/platform/sandbox/manifest';
import type { PluginManifest } from '../src/platform/sandbox/manifest';
import { AuditService } from '../src/platform/audit/AuditService';

// Test manifests
const manifestWithNetwork: PluginManifest = {
  name: 'network-plugin',
  version: '1.0.0',
  description: 'A plugin that needs network access',
  author: 'Test Author',
  entryPoint: 'main',
  capabilities: [PluginCapability.NETWORK_ACCESS],
  resourceLimits: {
    maxExecutionTimeMs: 2000,
    maxMemoryMb: 10,
    maxConcurrentExecutions: 1,
  },
};

const manifestWithSecrets: PluginManifest = {
  name: 'secret-plugin',
  version: '1.0.0',
  description: 'A plugin that needs secret access',
  author: 'Test Author',
  entryPoint: 'main',
  capabilities: [PluginCapability.SECRET_ACCESS],
  resourceLimits: {
    maxExecutionTimeMs: 2000,
    maxMemoryMb: 10,
    maxConcurrentExecutions: 1,
  },
};

const manifestBasic: PluginManifest = {
  name: 'basic-plugin',
  version: '1.0.0',
  description: 'A basic plugin with no special capabilities',
  author: 'Test Author',
  entryPoint: 'main',
  capabilities: [],
  resourceLimits: {
    maxExecutionTimeMs: 2000,
    maxMemoryMb: 10,
    maxConcurrentExecutions: 1,
  },
};

const manifestHighResource: PluginManifest = {
  name: 'high-resource-plugin',
  version: '1.0.0',
  description: 'A plugin with high resource requirements',
  author: 'Test Author',
  entryPoint: 'main',
  capabilities: [],
  resourceLimits: {
    maxExecutionTimeMs: 5000,
    maxMemoryMb: 50,
    maxConcurrentExecutions: 5,
  },
};

describe('SandboxRuntime', () => {
  const testEnv = { PHASE5_ENABLE: 'true' };

  describe('Policy Enforcement', () => {
    it('rejects execution when manifest declares NETWORK_ACCESS and sandbox denies network', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({ denyNetwork: true }, auditService, undefined, testEnv);

      const entry = async () => ({ result: 'success' });

      const result = await runtime.execute(manifestWithNetwork, entry);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network access denied by sandbox policy');
      expect(result.auditEvents.some(e => e.action === 'execute.rejected')).toBe(true);
    });

    it('rejects execution when manifest declares SECRET_ACCESS and sandbox denies secrets', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({ denySecrets: true }, auditService, undefined, testEnv);

      const entry = async () => ({ result: 'success' });

      const result = await runtime.execute(manifestWithSecrets, entry);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Secret access denied by sandbox policy');
      expect(result.auditEvents.some(e => e.action === 'execute.rejected')).toBe(true);
    });

    it('rejects execution when plugin memory requirement exceeds sandbox limit', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({ memoryLimitMb: 5 }, auditService, undefined, testEnv);

      const entry = async () => ({ result: 'success' });

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Plugin requires 10MB, but sandbox limit is 5MB');
      expect(result.auditEvents.some(e => e.action === 'execute.rejected')).toBe(true);
    });
  });

  describe('Runtime API Enforcement', () => {
    it('blocks access to sensitive configuration keys', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({
        config: { API_KEY: 'secret123', PUBLIC_VAR: 'public' }
      }, auditService, undefined, testEnv);

      const entry = async (api: any) => {
        const publicVar = api.getConfig('PUBLIC_VAR');
        expect(() => api.getConfig('API_KEY')).toThrow('Access denied');
        return { publicVar };
      };

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(true);
      expect((result.output as any).publicVar).toBe('public');
    });

    it('enforces sleep duration limits', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({}, auditService, undefined, testEnv);

      const entry = async (api: any) => {
        await api.sleep(3000); // Exceeds manifest limit of 2000ms
        return { result: 'slept' };
      };

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Sleep duration 3000ms exceeds maximum execution time');
    });

    it('provides safe logging with redaction', async () => {
      const auditService = new AuditService();
      const logs: Array<{ level: string; message: string; meta?: any }> = [];

      const logger = (level: string, message: string, meta?: any) => {
        logs.push({ level, message, meta });
      };

      const runtime = new SandboxRuntime({}, auditService, logger, testEnv);

      const entry = async (api: any) => {
        api.log('info', 'Processing API_KEY=sk-1234567890abcdef and email=user@example.com');
        return { result: 'logged' };
      };

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].message).toContain('[REDACTED_TOKEN]');
      expect(logs[0].message).toContain('[REDACTED_EMAIL]');
      expect(logs[0].message).not.toContain('sk-1234567890abcdef');
      expect(logs[0].message).not.toContain('user@example.com');
    });
  });

  describe('Execution Behavior', () => {
    it('executes successful plugin entry and records audit events', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({}, auditService, undefined, testEnv);

      const entry = async (api: any, input: any) => {
        // Add small delay to ensure duration > 0
        await new Promise(resolve => setTimeout(resolve, 5));
        return {
          processed: input,
          timestamp: api.now()
        };
      };

      const input = { data: 'test' };
      const result = await runtime.execute(manifestBasic, entry, input);

      expect(result.success).toBe(true);
      expect((result.output as any).processed).toEqual(input);
      expect(typeof (result.output as any).timestamp).toBe('number');
      expect(result.durationMs).toBeGreaterThan(0);

      // Check audit events
      expect(result.auditEvents.some(e => e.action === 'execute.started')).toBe(true);
      expect(result.auditEvents.some(e => e.action === 'execute.succeeded')).toBe(true);
    });

    it('handles plugin execution errors gracefully', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({}, auditService, undefined, testEnv);

      const entry = async () => {
        throw new Error('Plugin execution failed');
      };

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin execution failed');
      expect(result.auditEvents.some(e => e.action === 'execute.failed')).toBe(true);
    });

    it('enforces execution timeout', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({ timeoutMs: 100 }, auditService, undefined, testEnv);

      const entry = async (api: any) => {
        await api.sleep(200); // This will timeout
        return { result: 'completed' };
      };

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution timed out');
      expect(result.auditEvents.some(e => e.action === 'execute.timeout')).toBe(true);
    });
  });

  describe('Resource Limits', () => {
    it('respects manifest resource limits', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({}, auditService, undefined, testEnv);

      const entry = async (api: any) => {
        await api.sleep(1500); // Within 2000ms limit
        return { result: 'within-limits' };
      };

      const result = await runtime.execute(manifestBasic, entry);
      expect(result.success).toBe(true);
    });

    it('allows high-resource plugins when sandbox limits permit', async () => {
      const auditService = new AuditService();
      const runtime = new SandboxRuntime({
        memoryLimitMb: 100,
        timeoutMs: 10000
      }, auditService, undefined, testEnv);

      const entry = async () => ({ result: 'high-resource-success' });

      const result = await runtime.execute(manifestHighResource, entry);
      expect(result.success).toBe(true);
    });
  });

  describe('Audit Integration', () => {
    it('records comprehensive audit trail', async () => {
      const auditService = {
        record: vi.fn().mockResolvedValue(undefined)
      } as any;

      const runtime = new SandboxRuntime({}, auditService, undefined, testEnv);

      const entry = async () => ({ result: 'audited' });

      const result = await runtime.execute(manifestBasic, entry);

      expect(result.success).toBe(true);
      expect(result.auditEvents.length).toBeGreaterThan(1);

      // Check that audit service was called
      expect(auditService.record).toHaveBeenCalled();
      const call = auditService.record.mock.calls[0][0];
      expect(call.eventType).toBe('plugin_execution');
      expect(call.action).toBe('execute.started');
    });
  });
});
