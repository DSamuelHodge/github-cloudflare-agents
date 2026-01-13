import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackProvider } from '../src/platform/alerting/providers/slack';
import { ResendProvider } from '../src/platform/alerting/providers/email';
import { AlertingService } from '../src/platform/alerting/AlertingService';

beforeEach(() => {
  (globalThis.fetch as unknown) = vi.fn();
});

describe('Alerting providers', () => {
  it('sends payload to Slack webhook', async () => {
    const mockFetch = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const slack = new SlackProvider('https://hooks.slack.test/webhook');

    await slack.send({ title: 'Test', message: 'Hello', severity: 'info' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://hooks.slack.test/webhook');
    expect((opts as any).method).toBe('POST');
    const body = JSON.parse((opts as any).body as string);
    expect(body.text).toContain('Test');
  });

  it('sends payload to Slack using Bot token', async () => {
    const mockFetch = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true }) });

    const { SlackBotProvider } = await import('../src/platform/alerting/providers/slack-bot');
    const bot = new SlackBotProvider('xoxb-test-token', '#staging');

    await bot.send({ title: 'BotTest', message: 'Hello Bot', severity: 'info' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    const headers = (opts as any).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer xoxb-test-token');
    const body = JSON.parse((opts as any).body as string);
    expect(body.channel).toBe('#staging');
    expect(body.text).toContain('BotTest');
  });

  it('sends email via Resend', async () => {
    const mockFetch = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const resend = new ResendProvider('re_testkey', 'noreply@example.com');

    await resend.send({ title: 'Alert', message: 'Something happened', severity: 'critical', metadata: { to: 'ops@example.com' } });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = (opts as any).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_testkey');
    const body = JSON.parse((opts as any).body as string);
    expect(body.to).toBe('ops@example.com');
    expect(body.from).toBe('noreply@example.com');
  });
});

describe('AlertingService', () => {
  it('deduplicates alerts within dedupe window', async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const provider = { name: 'mock', send: sendMock };
    const env = { ALERT_DEDUPE_WINDOW_MS: '60000' } as unknown as Record<string, string>;
    const svc = new AlertingService(env as any, [provider as any]);

    await svc.alert({ title: 'Dup', message: '1', severity: 'warning', dedupeKey: 'k1' });
    await svc.alert({ title: 'Dup', message: '2', severity: 'warning', dedupeKey: 'k1' });

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('triggers alert handler on detected anomalies (non-blocking)', async () => {
    const mockCollector = {
      recordRequest: vi.fn(),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      recordCircuitBreakerStateChange: vi.fn(),
      getProviderMetrics: vi.fn().mockResolvedValue(null),
      getAggregatedMetrics: vi.fn().mockResolvedValue({
        totalRequests: 0,
        overallSuccessRate: 1.0,
        averageLatency: 100,
        failoversTriggered: 0,
        circuitBreakerEvents: 0,
        providers: {},
        collectionIntervalMs: 60000,
      }),
      reset: vi.fn().mockResolvedValue(undefined),
    } as unknown as any;

    const alertHandler = vi.fn().mockResolvedValue(undefined);
    const AnalyticsService = (await import('../src/platform/monitoring/AnalyticsService')).default;
    const analytics = new AnalyticsService(mockCollector, undefined, alertHandler);

    // Seed timeSeriesData with >10 entries and a final low success rate to force an anomaly
    const asAny = analytics as unknown as Record<string, any>;
    asAny.timeSeriesData = new Map<number, any>();
    for (let i = 0; i < 10; i++) {
      asAny.timeSeriesData.set(Date.now() - (i + 2) * 60000, {
        overallSuccessRate: 1.0,
        averageLatency: 100,
        totalRequests: 100,
      });
    }
    // Ensure the final (latest) point is low to trigger anomaly detection
    asAny.timeSeriesData.set(Date.now(), {
      overallSuccessRate: 0.6,
      averageLatency: 5000,
      totalRequests: 100,
    });

    const anomalies = analytics.detectAnomalies();
    expect(anomalies.length).toBeGreaterThan(0);

    // Wait a tick for non-blocking handlers to run
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(alertHandler).toHaveBeenCalled();
  });
});
