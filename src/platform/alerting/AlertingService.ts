import { Logger } from '../../utils/logger';
import { createMetrics } from '../../utils/metrics';
import type { Env } from '../../types/env';
import type { Alert, AlertProvider } from './alerts';
import { SlackProvider } from './providers/slack';
import { ResendProvider } from './providers/email';

export class AlertingService {
  private readonly logger: Logger;
  private readonly providers: AlertProvider[] = [];
  private readonly dedupeWindowMs: number;
  private readonly dedupeMap: Map<string, number> = new Map();

  constructor(env: Env, providers?: AlertProvider[]) {
    this.logger = new Logger('info', { component: 'AlertingService' });
    const dedupeMs = Number(env.ALERT_DEDUPE_WINDOW_MS ?? '60000');
    this.dedupeWindowMs = Number.isFinite(dedupeMs) && dedupeMs > 0 ? dedupeMs : 60000;

    // Register providers from constructor override or environment
    if (providers && providers.length > 0) {
      this.providers.push(...providers);
    } else {
      if (env.ALERT_SLACK_WEBHOOK) {
        this.providers.push(new SlackProvider(env.ALERT_SLACK_WEBHOOK, this.logger));
      }

      // Support Slack Bot API (token + channel)
      if (env.ALERT_SLACK_BOT_TOKEN && env.ALERT_STAGING_CHANNEL) {
        // Lazy import to avoid circular deps in some test/CI flows. Add provider asynchronously.
        import('./providers/slack-bot')
          .then((mod) => {
            try {
              this.providers.push(new mod.SlackBotProvider(env.ALERT_SLACK_BOT_TOKEN as string, env.ALERT_STAGING_CHANNEL as string, this.logger));
            } catch (err) {
              this.logger.error('Failed to initialize SlackBotProvider', err instanceof Error ? err : undefined);
            }
          })
          .catch((err) => this.logger.error('Failed to import SlackBotProvider', err instanceof Error ? err : undefined));
      }

      if (env.RESEND_API_KEY && env.ALERT_FROM) {
        this.providers.push(new ResendProvider(env.RESEND_API_KEY, env.ALERT_FROM, this.logger));
      }
    }

    this.logger.info('AlertingService initialized', { providers: this.providers.map(p => p.name) });
  }

  async alert(alert: Alert): Promise<void> {
    const key = alert.dedupeKey ?? `${alert.title}:${alert.source ?? 'unknown'}`;
    const now = Date.now();
    const last = this.dedupeMap.get(key) ?? 0;

    if (now - last < this.dedupeWindowMs) {
      this.logger.info('Alert suppressed by dedupe', { key });
      return;
    }

    this.dedupeMap.set(key, now);
    setTimeout(() => this.dedupeMap.delete(key), this.dedupeWindowMs);

    const metrics = createMetrics({ component: 'alerting' });
    metrics.increment('alert.requests', 1);

    try {
      await Promise.all(this.providers.map(p => this.sendWithRetry(p, alert, 2)));
      metrics.increment('alert.success', 1);
    } catch (error) {
      metrics.increment('alert.failure', 1);
      this.logger.error('Failed to send alert', error instanceof Error ? error : undefined, { alert: alert.title });
      // Do not rethrow: alert failures should not crash callers
    }
  }

  private async sendWithRetry(provider: AlertProvider, alert: Alert, attempts: number): Promise<void> {
    try {
      await provider.send(alert);
    } catch (error) {
      if (attempts > 1) {
        this.logger.warn('Provider send failed, retrying', { provider: provider.name, attempts: attempts - 1 });
        await new Promise(resolve => setTimeout(resolve, 250));
        return this.sendWithRetry(provider, alert, attempts - 1);
      }

      this.logger.error('Provider send failed', error instanceof Error ? error : undefined, { provider: provider.name });
      throw error;
    }
  }
}

export function createAlertingServiceFromEnv(env: Env): AlertingService {
  return new AlertingService(env);
}
