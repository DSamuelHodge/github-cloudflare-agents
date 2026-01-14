export interface AuditEvent {
  timestamp: string; // ISO
  eventType: string;
  manifestChecksum?: string;
  action: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditServiceOptions {
  kv?: KVNamespace;
  maxEventsInMemory?: number;
  persistToKV?: boolean;
}

export class AuditService {
  private events: AuditEvent[] = [];
  private kv?: KVNamespace;
  private maxEventsInMemory: number;
  private shouldPersistToKV: boolean;

  constructor(options: AuditServiceOptions = {}) {
    this.kv = options.kv;
    this.maxEventsInMemory = options.maxEventsInMemory ?? 1000;
    this.shouldPersistToKV = options.persistToKV ?? !!options.kv;
  }

  public async record(event: AuditEvent): Promise<void> {
    const safe = this.redact(event);

    // Store in memory for immediate access
    this.events.push(safe);

    // Trim in-memory storage if needed
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(-this.maxEventsInMemory);
    }

    // Persist to KV if enabled
    if (this.shouldPersistToKV && this.kv) {
      await this.persistEventToKV(safe);
    }
  }

  public list(): AuditEvent[] {
    return [...this.events];
  }

  public async listFromKV(limit = 100): Promise<AuditEvent[]> {
    if (!this.kv) {
      return this.list();
    }

    const keys = await this.kv.list({ prefix: 'audit:', limit });
    const events: AuditEvent[] = [];

    for (const key of keys.keys) {
      const value = await this.kv.get(key.name);
      if (value) {
        try {
          events.push(JSON.parse(value));
        } catch (error) {
          console.warn(`Failed to parse audit event from KV: ${key.name}`, error);
        }
      }
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return events;
  }

  private async persistEventToKV(event: AuditEvent): Promise<void> {
    if (!this.kv) return;

    const key = `audit:${event.timestamp}:${event.eventType}:${event.action}`;
    await this.kv.put(key, JSON.stringify(event), {
      expirationTtl: 30 * 24 * 60 * 60, // 30 days
    });
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
