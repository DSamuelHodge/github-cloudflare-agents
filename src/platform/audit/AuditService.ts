export interface AuditEvent {
  timestamp: string; // ISO
  plugin: string;
  manifestChecksum?: string;
  action: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  private events: AuditEvent[] = [];

  public async record(event: AuditEvent): Promise<void> {
    const safe = this.redact(event);
    // In Stage 1 we store in-memory for tests; future stages will persist to KV/R2.
    this.events.push(safe);
  }

  public list(): AuditEvent[] {
    return [...this.events];
  }

  public redact(event: AuditEvent): AuditEvent {
    const redacted: AuditEvent = JSON.parse(JSON.stringify(event));
    if (redacted.message) {
      redacted.message = this.redactString(redacted.message);
    }
    if (redacted.metadata) {
      redacted.metadata = this.redactObj(redacted.metadata);
    }
    return redacted;
  }

  private redactObj(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out[k] = this.redactString(v);
      else if (typeof v === 'object' && v !== null) out[k] = this.redactObj(v as Record<string, unknown>);
      else out[k] = v;
    }
    return out;
  }

  private redactString(s: string): string {
    // naive redaction: redact anything that looks like a token/secret
    return s.replace(/([A-Za-z0-9_-]{20,})/g, 'REDACTED');
  }
}
