import { Logger } from '../../../utils/logger';
import type { Alert, AlertProvider } from '../alerts';

export class SlackProvider implements AlertProvider {
  public readonly name = 'slack';
  private readonly webhookUrl: string;
  private readonly logger: Logger;

  constructor(webhookUrl: string, logger?: Logger) {
    if (!webhookUrl) throw new Error('Slack webhook URL is required');
    this.webhookUrl = webhookUrl;
    this.logger = logger ?? new Logger('info', { component: 'SlackProvider' });
  }

  async send(alert: Alert): Promise<void> {
    const payload = {
      text: `*${alert.severity.toUpperCase()}* - ${alert.title}\n${alert.message}`,
    };

    this.logger.info('Sending Slack alert', { title: alert.title, severity: alert.severity });

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<no-body>');
      this.logger.error('Slack webhook responded with non-ok status', undefined, { status: res.status, body: text });
      throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}`);
    }

    this.logger.info('Slack alert sent');
  }
}
