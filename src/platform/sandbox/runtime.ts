import type { PluginManifest } from '../plugin-sdk/types';
import { PluginCapability } from '../plugin-sdk/types';
import type { SandboxOptions, ExecutionResult } from './index';
import { AuditService } from '../audit/AuditService';

export interface RuntimeApi {
  // network call is simulated and will be blocked when denyNetwork is true
  fetch: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
  // metadata helpers
  metadata: Record<string, unknown>;
}

export type PluginEntry = (api: RuntimeApi, input?: unknown) => Promise<unknown> | unknown;

export class SandboxRuntime {
  constructor(private opts: SandboxOptions = {}, private audit?: AuditService) {}

  public async execute(manifest: PluginManifest, entry: PluginEntry, input?: unknown): Promise<ExecutionResult> {
    const start = Date.now();

    // Policy: deny network capability when configured
    if (this.opts.denyNetwork && manifest.capabilities.includes(PluginCapability.NETWORK)) {
      await this.audit?.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'execute.rejected', message: 'network capability denied by sandbox policy' });
      return { success: false, error: 'network capability is not allowed in this sandbox', durationMs: Date.now() - start };
    }

    // Build a runtime API that enforces policy at runtime too
    const api: RuntimeApi = {
      fetch: async (_url: string) => {
        if (this.opts.denyNetwork) {
          throw new Error('network access blocked by sandbox policy');
        }
        // In Stage 2 we do not actually perform network requests — simulate success
        return { ok: true };
      },
      metadata: {
        manifestName: manifest.name,
      },
    };

    // enforce timeout
    const timeoutMs = this.opts.timeoutMs ?? 2000;
    // Simulate resource enforcement
    if (this.opts.memoryLimitMb && this.opts.memoryLimitMb < 32) {
      await this.audit?.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'execute.rejected', message: 'memory limit too low' });
      return { success: false, error: 'memory limit too low', durationMs: Date.now() - start };
    }
    if (this.opts.cpuLimitPct && (this.opts.cpuLimitPct < 10 || this.opts.cpuLimitPct > 100)) {
      await this.audit?.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'execute.rejected', message: 'cpu limit out of range' });
      return { success: false, error: 'cpu limit out of range', durationMs: Date.now() - start };
    }
    const runPromise = (async () => {
      try {
        await this.audit?.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'execute.started', message: `execution started (mem=${this.opts.memoryLimitMb ?? 128}MB cpu=${this.opts.cpuLimitPct ?? 50}%)` });
        const result = await Promise.resolve(entry(api, input));
        await this.audit?.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'execute.succeeded', message: 'execution succeeded' });
        return { success: true, output: result, durationMs: Date.now() - start } as ExecutionResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.audit?.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'execute.failed', message, metadata: { error: message } });
        return { success: false, error: message, durationMs: Date.now() - start } as ExecutionResult;
      }
    })();

    const timeoutPromise = new Promise<ExecutionResult>((resolve) => setTimeout(() => resolve({ success: false, error: 'execution timed out', durationMs: Date.now() - start }), timeoutMs));

    return Promise.race([runPromise, timeoutPromise]);
  }
  }

  export type { PluginManifest };
