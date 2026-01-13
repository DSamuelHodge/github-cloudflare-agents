# Phase 4.1 Stage 8 — Alerting Integration

This document describes the Alerting Integration (Slack + Email) for Phase 4.1 Stage 8.

## Overview
- Provider: Slack (webhook) and Resend (email service)
- Goals: Send alerts for monitoring anomalies, circuit-breaker state changes, and critical system events.
- Non-goals: SMS/PagerDuty (can be added later via provider interface)

## Configuration
1. Set secrets via `wrangler secret put <NAME>`:
   - `RESEND_API_KEY` — Resend API key (required for email alerts)
   - `ALERT_FROM` — From address for emails (required for Resend)
   - `ALERT_SLACK_WEBHOOK` — Slack incoming webhook (optional for Slack alerts)
   - `ALERT_STAGING_CHANNEL` — (Optional) Slack channel for staging messages
   - `ALERT_DEDUPE_WINDOW_MS` — Optional dedupe window in ms (default: 60000)

2. Environment variables (wrangler [vars] / WorkerVars):
   - `GEMINI_MODEL` (existing)
   - `RESEND_API_KEY` (set via secret)
   - `ALERT_SLACK_WEBHOOK` (set via secret)
   - `ALERT_FROM` (set via secret)

## Testing
- Unit tests are in `tests/phase4.1-alerting.test.ts` (mocking `fetch` for Slack/Resend)
- Staging E2E: Deploy to staging, then trigger simulated anomaly (see AnalyticsService) and verify messages arrive in staging Slack and test email recipient.

## Runbook
- For critical alerts, follow escalation path: Ops Slack channel -> PagerDuty (manual in this stage)
- If alert floods are observed, increase `ALERT_DEDUPE_WINDOW_MS` temporarily and investigate the root cause via `/analytics` endpoint

## Staging E2E Runbook ✅
1. Local setup (developer machine):
   - Add required test vars to `.dev.vars` (do NOT commit secrets):
     - `ALERT_FROM` (e.g., `derrick@hodgedomain.com`) — already added for you
     - `ALERT_STAGING_CHANNEL` (e.g., `#staging`) — already added for you
   - **For secrets, prefer Wrangler secrets** (recommended):
     - `wrangler secret put ALERT_SLACK_BOT_TOKEN`  # Bot OAuth token (xoxb-...)
     - `wrangler secret put ALERT_SLACK_APP_TOKEN`  # App socket token (xapp-...)
     - OR `wrangler secret put ALERT_SLACK_WEBHOOK` # Incoming webhook URL (optional)
     - `wrangler secret put RESEND_API_KEY`        # Resend API key
     - `wrangler secret put ALERT_FROM`            # Email "from" address
   - For quick local testing only, you may temporarily add secrets to `.dev.vars` (NOT recommended for production)
   - Confirm test recipient: `dshodge2020@outlook.com` (we will send staging email to this address)

2. Run the staging test script locally (uses `.dev.vars`):

   npm run test:staging-alert

   - This script will:
     - Send a Slack message via `chat.postMessage` to `ALERT_STAGING_CHANNEL` using `ALERT_SLACK_BOT_TOKEN` (or to the webhook if configured)
     - Send an email via Resend from `ALERT_FROM` to `dshodge2020@outlook.com`
   - Check Slack `#staging` channel and the recipient inbox to verify delivery and content.

3. If either delivery fails:
   - Inspect `scripts/send-staging-alert.js` output for HTTP errors and response bodies
   - Re-check `.dev.vars` values and that `RESEND_API_KEY`/`ALERT_SLACK_BOT_TOKEN` are correct
   - If Slack messages return `ok: false`, visit Slack app configuration and ensure bot has `chat:write` scope and is a member of the channel

4. After verification:
   - Remove bot token from `.dev.vars` if you added it locally and prefer to use `wrangler secret put` for deployments
   - Record the verified channel/email in the runbook

## Implementation Notes
- AlertingService uses in-memory dedupe and non-blocking alert dispatch to avoid impacting request handling
- AnalyticsService calls an optional alert handler when anomalies are detected (non-blocking)
- Providers implemented: `SlackProvider`, `SlackBotProvider` and `ResendProvider` (Resend API)

## Next Steps
**Status:** ✅ Implementation complete and verified. PR #1 open for review.

- Add provider adapters for SendGrid/SMS/PagerDuty (optional)
- Add persistent alert state and acknowledgement flow (future stage)
