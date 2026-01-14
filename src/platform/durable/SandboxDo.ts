import type { PluginManifest } from '../sandbox/manifest';
import { SandboxRuntime, PluginEntry } from '../sandbox/runtime';
import { AuditService } from '../audit/AuditService';

export interface SandboxDoState {
  id: string;
  runningJobs: number;
  lastRun?: string;
  auditTrail: Array<{
    timestamp: string;
    action: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class SandboxDo {
  constructor(private state: SandboxDoState, private audit: AuditService = new AuditService(), private env?: Record<string, unknown>) {
    this.state.auditTrail = this.state.auditTrail || [];
  }

  public getState(): SandboxDoState {
    return this.state;
  }

  public async runPlugin(manifest: PluginManifest, entry: PluginEntry, input?: unknown) {
    this.state.runningJobs = (this.state.runningJobs ?? 0) + 1;

    // Create sandbox with conservative defaults
    const runtime = new SandboxRuntime({
      denyNetwork: true,
      denySecrets: true,
      timeoutMs: manifest.resourceLimits.maxExecutionTimeMs,
      memoryLimitMb: manifest.resourceLimits.maxMemoryMb
    }, this.audit, undefined, this.env);

    const result = await runtime.execute(manifest, entry, input);

    this.state.runningJobs = Math.max(0, (this.state.runningJobs ?? 1) - 1);
    this.state.lastRun = new Date().toISOString();

    // Record orchestration audit event
    const auditEvent = {
      timestamp: new Date().toISOString(),
      action: 'do.run',
      message: `Plugin ${manifest.name} execution ${result.success ? 'succeeded' : 'failed'}`,
      metadata: {
        pluginName: manifest.name,
        pluginVersion: manifest.version,
        success: result.success,
        durationMs: result.durationMs,
        error: result.error
      }
    };

    this.state.auditTrail.push(auditEvent);

    await this.audit.record({
      timestamp: new Date().toISOString(),
      eventType: 'sandbox_orchestration',
      action: 'plugin_executed',
      message: auditEvent.message,
      metadata: auditEvent.metadata
    });

    return result;
  }

  public getAuditTrail(): Array<{ timestamp: string; action: string; message: string; metadata?: Record<string, unknown> }> {
    return this.state.auditTrail;
  }

  public async heartbeat(): Promise<void> {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      action: 'do.heartbeat',
      message: 'Sandbox DO heartbeat',
      metadata: { runningJobs: this.state.runningJobs }
    };

    this.state.auditTrail.push(auditEvent);

    await this.audit.record({
      timestamp: new Date().toISOString(),
      eventType: 'sandbox_orchestration',
      action: 'heartbeat',
      message: 'Sandbox DO heartbeat',
      metadata: { runningJobs: this.state.runningJobs }
    });
  }
}
