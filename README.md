# GitHub AI Agent (Multi-Agent Platform)

A production-ready multi-agent platform implemented as a Cloudflare Worker. The project listens to GitHub webhooks (issues and PRs), applies agent pipelines to triage and respond, and can create automated PRs and comments based on AI-generated suggestions.

Key capabilities

- Multi-Agent Architecture
  - Agent registry and middleware pipeline for modular agents (issue responder, PR reviewer, triage agents, etc.)
  - Agents are easy to add and test via `src/agents/*`

- Multi-Provider AI Gateway
  - Integrations for Gemini (Google), HuggingFace (Mixtral), and Anthropic (Claude)
  - OpenAI-compatible API surface via `GatewayAIClient`
  - Provider-specific request/response transforms

- Resilience & Failover
  - `FallbackAIClient` orchestrates provider failover
  - Circuit breaker implementation with KV-backed persistence and in-memory caching
  - Configurable thresholds and recovery policies

- Observability & Analytics
  - `MetricsCollector` records request-level telemetry (latency, tokens, success/failure)
  - `AnalyticsService` provides time-series analytics and anomaly detection
  - Monitoring endpoints: `/metrics`, `/analytics`, `/health`
  - Dashboard data service for visualization-ready datasets

- Storage & Archival
  - Short-term metrics in KV with efficient caching
  - Long-term archival to R2 with date-based keys and aggregation queries

- Testing & Safe Automation
  - Container-based worktree test execution for isolated runs
  - Parallel multi-solution testing and automated PR workflow
  - Comprehensive unit tests and load tests (CI-friendly)

- Alerting
  - Slack and Email (Resend) alerting integrations for production monitoring and runbooks

Quickstart (local)

1. Clone the repository and install dependencies:

   git clone <repo-url>
   cd github-cloudflare-agent
   npm install

2. Create a local `.dev.vars` from `.dev.vars.example` and add required secrets (GITHUB_WEBHOOK_SECRET, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_API_TOKEN, etc.).

3. Run locally with Wrangler for development:

   npm run dev

4. Run the test suite:

   npm test

5. Type-check and lint:

   npm run type-check
   npm run lint

Deploy

- Configure `wrangler.toml` with your Cloudflare account, KV and R2 bindings, and required secrets.
- Deploy to Cloudflare Workers:

  npm run deploy

Project status & documentation

- Production deployment (if configured): `https://github-ai-agent.dschodge2020.workers.dev` (see `docs/DEPLOYMENT_READY.md` and `docs/DEPLOYMENT_COMPLETE.md`).
- Detailed architecture and design: `docs/ARCHITECTURE.md`.
- Release notes and changelog preserved in `.CHANGELOG`.

Contributing

- Open an issue to discuss design or feature requests.
- Branch from `main`: `git checkout -b feat/short-description`.
- Add tests for new behaviors and ensure `npm test` and `npm run lint` pass.
- Use conventional commits for commit messages (e.g., `fix:`, `feat:`, `chore:`, `docs:`).
- Submit a PR with a clear description and link to related issues.

License

MIT

