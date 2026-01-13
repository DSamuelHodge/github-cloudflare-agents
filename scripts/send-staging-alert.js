/*
  Simple staging script to validate alert delivery.
  - Reads `.dev.vars` from repo root for local testing (do NOT commit secrets)
  - Sends a Slack message (chat.postMessage) using ALERT_SLACK_BOT_TOKEN
  - Sends an email via Resend using RESEND_API_KEY and ALERT_FROM

  Usage: npm run test:staging-alert
*/

const fs = require('fs');
const path = require('path');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    env[key] = value;
  }
  return env;
}

(async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const env = loadDotEnv(path.join(repoRoot, '.dev.vars'));

  // Required values
  const token = env.ALERT_SLACK_BOT_TOKEN;
  let channel = env.ALERT_STAGING_CHANNEL || '#staging';
  // Allow using '#channel' or 'channel' or channel ID
  channel = String(channel).replace(/^#/, '');
  const resendKey = env.RESEND_API_KEY;
  const from = env.ALERT_FROM;

  if (!token && !env.ALERT_SLACK_WEBHOOK) {
    console.error('Slack token or webhook not set. Please set ALERT_SLACK_BOT_TOKEN or ALERT_SLACK_WEBHOOK in .dev.vars');
    process.exit(2);
  }
  if (!resendKey || !from) {
    console.error('Resend key or ALERT_FROM not set. Please set RESEND_API_KEY and ALERT_FROM in .dev.vars');
    process.exit(2);
  }

  const slackResult = await (async () => {
    try {
      const payload = token
        ? { url: 'https://slack.com/api/chat.postMessage', opts: { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` }, body: JSON.stringify({ channel, text: `*STAGING TEST* - GitHub AI Agent alert from ${from}` }) } }
        : { url: env.ALERT_SLACK_WEBHOOK, opts: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `*STAGING TEST* - GitHub AI Agent alert from ${from}` }) } };

      const res = await fetch(payload.url, payload.opts);
      const text = await res.text().catch(() => '<no-body>');
      if (!res.ok) {
        return { ok: false, status: res.status, body: text };
      }

      // For Slack API token calls, check JSON.ok and handle channel not found by trying to join
      if (token) {
        try {
          const data = JSON.parse(text);
          if (data.ok === true) return { ok: true, status: res.status, body: data };

          if (data && data.error === 'channel_not_found') {
            // Try to resolve channel ID and join
            try {
              const listRes = await fetch(`https://slack.com/api/conversations.list?limit=1000`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
              const listJson = await listRes.json();
              const channels = Array.isArray(listJson.channels) ? listJson.channels : [];
              const found = channels.find((c) => c.name === channel || c.id === channel);
              const channelId = found ? found.id : null;

              if (channelId) {
                // Attempt to join
                await fetch('https://slack.com/api/conversations.join', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` }, body: JSON.stringify({ channel: channelId }) });

                // Retry postMessage with channel ID
                const retryRes = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` }, body: JSON.stringify({ channel: channelId, text: `*STAGING TEST* - GitHub AI Agent alert from ${from}` }) });
                const retryJson = await retryRes.json().catch(() => ({}));
                if (retryJson && retryJson.ok === true) return { ok: true, status: retryRes.status, body: retryJson };
                return { ok: false, status: retryRes.status, body: retryJson };
              }
            } catch (err) {
              return { ok: false, error: String(err) };
            }
          }

          // Fallback: return the error payload
          return { ok: false, status: res.status, body: data };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      }

      return { ok: true, status: res.status, body: text };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  })();

  const emailResult = await (async () => {
    try {
      const payload = {
        from,
        to: 'dshodge2020@outlook.com',
        subject: '[STAGING TEST] GitHub AI Agent Alert',
        html: `<p>This is a staging test alert from ${from} to verify Resend delivery.</p>`,
      };
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify(payload),
      });
      const text = await res.text().catch(() => '<no-body>');
      if (!res.ok) return { ok: false, status: res.status, body: text };
      return { ok: true, status: res.status, body: text };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  })();

  console.log('Slack result:', slackResult);
  console.log('Email result:', emailResult);

  if (!slackResult.ok || !emailResult.ok) {
    console.error('Staging test failed. Inspect results above.');
    process.exit(1);
  }

  console.log('Staging test succeeded. Verify Slack channel and inbox (dshodge2020@outlook.com).');
})();
