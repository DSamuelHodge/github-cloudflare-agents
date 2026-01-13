export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp?: string; // ISO string
  metadata?: Record<string, unknown>;
  source?: string;
  dedupeKey?: string;
}

export interface AlertProvider {
  name: string;
  send(alert: Alert): Promise<void>;
}
