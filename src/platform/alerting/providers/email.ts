import { Logger } from '../../../utils/logger';
import type { Alert, AlertProvider } from '../alerts';

interface ResendEmailPayload {
  from: string;
  to: string;
  subject: string;
  html?: string;
}

export class ResendProvider implements AlertProvider {
  public readonly name = 'resend';
  private readonly apiKey: string;
  private readonly from: string;
  private readonly logger: Logger;

  constructor(apiKey: string, from: string, logger?: Logger) {
    if (!apiKey) throw new Error('RESEND API key is required');
    if (!from) throw new Error('Alert "from" address is required');
    this.apiKey = apiKey;
    this.from = from;
    this.logger = logger ?? new Logger('info', { component: 'ResendProvider' });
  }

  async send(alert: Alert): Promise<void> {
    // Expect recipient to be provided in metadata.to
    const toRaw = alert.metadata?.to;
    if (!toRaw || typeof toRaw !== 'string') {
      throw new Error('Alert recipient (metadata.to) is required for email alerts');
    }

    const payload: ResendEmailPayload = {
      from: this.from,
      to: toRaw,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      html: `<p>${escapeHtml(alert.message)}</p><pre>${escapeHtml(JSON.stringify(alert.metadata ?? {}, null, 2))}</pre>`,
    };

    this.logger.info('Sending email alert via Resend', { to: payload.to, subject: payload.subject });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<no-body>');
      this.logger.error('Resend responded with non-ok status', undefined, { status: res.status, body: text });
      throw new Error(`Resend failed: ${res.status} ${res.statusText}`);
    }

    this.logger.info('Resend email sent');
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
