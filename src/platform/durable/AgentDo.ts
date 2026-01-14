// Durable Object scaffold for Phase 5 agent coordination
// NOTE: This is a spec-level stub. DO implementation, binding, and migration will be done in Stage 7.

export interface AgentState {
  id: string;
  lastHeartbeat?: string;
  runningJobs?: number;
  status?: 'stopped' | 'running';
  auditTrail?: Array<{ timestamp: string; action: string; details?: string }>;
}

export class AgentDo {
  constructor(private state: AgentState) {
    this.state.status = this.state.status ?? 'stopped';
    this.state.auditTrail = this.state.auditTrail ?? [];
  }

  public getState(): AgentState {
    return this.state;
  }

  public async start(): Promise<void> {
    this.state.status = 'running';
    this.recordAudit('start');
  }

  public async stop(): Promise<void> {
    this.state.status = 'stopped';
    this.recordAudit('stop');
  }

  public async heartbeat(): Promise<void> {
    this.state.lastHeartbeat = new Date().toISOString();
    this.recordAudit('heartbeat');
  }

  public getAuditTrail(): Array<{ timestamp: string; action: string; details?: string }> {
    return this.state.auditTrail ?? [];
  }

  private recordAudit(action: string, details?: string) {
    this.state.auditTrail?.push({ timestamp: new Date().toISOString(), action, details });
  }
}
