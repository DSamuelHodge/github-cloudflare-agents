#!/usr/bin/env bash
set -euo pipefail

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler is required. Install with: npm install -g wrangler" >&2
  exit 1
fi

if [ ! -f .dev.vars ] && [ ! -f .env ]; then
  echo "Missing secrets file (.dev.vars or .env)." >&2
  exit 1
fi

echo "Running tests..."
npm test

echo "Deploying to Cloudflare Workers..."
wrangler deploy

echo "Deployment complete. Use 'wrangler tail' to monitor logs."
