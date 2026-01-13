// Durable Object scaffold for Phase 5 agent coordination
// NOTE: This is a spec-level stub. DO implementation, binding, and migration will be done in Stage 7.

export interface AgentState {
  id: string;
  lastHeartbeat?: string;
  runningJobs?: number;
}

export class AgentDo {
  // Intentionally minimal and non-deployed in Stage 1
  constructor(private state: AgentState) {}

  public getState(): AgentState {
    return this.state;
  }

  public async heartbeat(): Promise<void> {
    this.state.lastHeartbeat = new Date().toISOString();
  }
}
