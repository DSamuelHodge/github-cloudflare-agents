# GitHub AI Agent

A lightweight Cloudflare Worker that listens to GitHub issue webhooks and posts AI-generated responses as comments.

This repository contains a modular agent platform with adapters for multiple AI providers, a fallback client with circuit breakers, observability endpoints, and test coverage for core behavior.

## Requirements

- Node.js 18+ (for local tooling and tests)
- Cloudflare Wrangler CLI (for deployment)

## Quickstart (local)

1. Clone the repository:
   git clone <repo-url>
   cd github-cloudflare-agent

2. Install dependencies:
   npm install

3. Create a local environment file from the example and fill in required values:
   cp .dev.vars.example .dev.vars
   # set GITHUB_WEBHOOK_SECRET, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_API_TOKEN, etc.

4. Run locally:
   npm run dev

5. Run tests:
   npm test

6. Type-check and lint before committing:
   npm run type-check
   npm run lint

## Deploy

- Configure `wrangler.toml` with your Cloudflare account and bindings.
- Deploy to Cloudflare Workers using:
  npm run deploy

## Contributing

- Open an issue to discuss larger changes.
- Create a feature branch: `git checkout -b feat/short-description`.
- Make changes, add tests, and ensure `npm test` and `npm run lint` pass.
- Submit a pull request against `main` with a clear description of the change and reasoning.

Commit message guidelines: use conventional commits style (e.g., `fix:`, `feat:`, `chore:`, `docs:`).

## Contact

For questions or to request features, open an issue in this repository.

## License

MIT

