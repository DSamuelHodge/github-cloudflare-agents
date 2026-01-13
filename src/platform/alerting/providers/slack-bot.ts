import { Logger } from '../../../utils/logger';
import type { Alert, AlertProvider } from '../alerts';

export class SlackBotProvider implements AlertProvider {
  public readonly name = 'slack-bot';
  private readonly token: string;
  private readonly channel: string;
  private readonly logger: Logger;

  constructor(token: string, channel: string, logger?: Logger) {
    if (!token) throw new Error('Slack bot token is required');
    if (!channel) throw new Error('Slack channel is required');
    this.token = token;
    this.channel = channel;
    this.logger = logger ?? new Logger('info', { component: 'SlackBotProvider' });
  }

  async send(alert: Alert): Promise<void> {
    // Use channel from alert metadata if provided
    const channel = (alert.metadata?.channel as string) || this.channel;

    const payload = {
      channel,
      text: `*${alert.severity.toUpperCase()}* - ${alert.title}\n${alert.message}`,
    };

    this.logger.info('Sending Slack Bot alert', { title: alert.title, severity: alert.severity, channel });

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || (data && data.ok === false)) {
      this.logger.error('Slack API returned an error', undefined, { status: res.status, body: data });
      throw new Error(`Slack API failed: ${res.status} ${res.statusText}`);
    }

    this.logger.info('Slack Bot alert sent');
  }
}
