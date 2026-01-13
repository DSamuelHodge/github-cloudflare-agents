import type { PluginManifest } from '../plugin-sdk/types';
import { SandboxRuntime, PluginEntry } from '../sandbox/runtime';
import { AuditService } from '../audit/AuditService';

export interface SandboxDoState {
  id: string;
  runningJobs: number;
  lastRun?: string;
}

export class SandboxDo {
  constructor(private state: SandboxDoState, private audit: AuditService = new AuditService()) {}

  public getState(): SandboxDoState {
    return this.state;
  }

  public async runPlugin(manifest: PluginManifest, entry: PluginEntry, input?: unknown) {
    this.state.runningJobs = (this.state.runningJobs ?? 0) + 1;
    const runtime = new SandboxRuntime({ denyNetwork: true, timeoutMs: 5000 }, this.audit);

    const result = await runtime.execute(manifest, entry, input);

    this.state.runningJobs = Math.max(0, (this.state.runningJobs ?? 1) - 1);
    this.state.lastRun = new Date().toISOString();

    // record an audit event for orchestration
    await this.audit.record({ timestamp: new Date().toISOString(), plugin: manifest.name, action: 'do.run', message: 'plugin run completed', metadata: { success: result.success } });

    return result;
  }
}
