# Phase 1.5 Deployment Guide

## Prerequisites

### 1. Cloudflare Account Setup
- **Workers Paid Plan** ($5/month minimum) — Required for KV and R2
- Account ID: Available in Cloudflare Dashboard
- Wrangler CLI installed: `npm install -g wrangler`

### 2. Authentication
```bash
# Login to Cloudflare
wrangler login
```

### 3. GitHub Secrets
Ensure these are set (use existing values from Phase 1):
- `GITHUB_TOKEN` - GitHub Personal Access Token with `repo` scope
- `GEMINI_API_KEY` - Gemini API key from Google AI Studio
- `GITHUB_WEBHOOK_SECRET` - Optional: webhook signature verification
- `GITHUB_BOT_USERNAME` - Bot username for attribution

---

## Step 1: Create KV Namespace

```bash
# Create the KV namespace for embeddings and conversations
wrangler kv:namespace create DOC_EMBEDDINGS

# Output will show:
# 🌀 Creating namespace with title "github-ai-agent-DOC_EMBEDDINGS"
# ✨ Success!
# Add the following to your configuration file in your kv_namespaces array:
# { binding = "DOC_EMBEDDINGS", id = "abc123..." }
```

**Action Required:** Copy the namespace ID from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "DOC_EMBEDDINGS"
id = "YOUR_ACTUAL_NAMESPACE_ID"  # Replace placeholder_id
```

---

## Step 2: Verify R2 Bucket

```bash
# Check if bucket exists
wrangler r2 bucket list

# If "github-ai-agent-artifacts" is not listed, create it:
wrangler r2 bucket create github-ai-agent-artifacts
```

---

## Step 3: Update Secrets

Set all required secrets (if not already set):

```bash
# GitHub Token
wrangler secret put GITHUB_TOKEN
# Paste your GitHub Personal Access Token

# Gemini API Key
wrangler secret put GEMINI_API_KEY
# Paste your Gemini API key

# GitHub Webhook Secret (optional but recommended)
wrangler secret put GITHUB_WEBHOOK_SECRET
# Paste your webhook secret

# Bot Username
wrangler secret put GITHUB_BOT_USERNAME
# Enter your bot's GitHub username
```

---

## Step 4: Type Check

```bash
# Ensure all TypeScript compiles correctly
npm run type-check
```

Expected output: No errors

---

## Step 5: Deploy to Production

```bash
# Deploy the worker
npm run deploy
```

Expected output:
```
✨ Compiled Worker successfully
🌍 Uploading... (100%)
✨ Success! Uploaded to https://github-ai-agent.your-account.workers.dev
```

---

## Step 6: Verify Deployment

### Health Check
```bash
curl https://github-ai-agent.your-account.workers.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-12T...",
  "agents": {
    "registered": 1,
    "enabled": 1
  }
}
```

---

## Step 7: Index Documentation (One-Time Setup)

```bash
# Index your repository's documentation
curl -X POST "https://github-ai-agent.your-account.workers.dev/index-docs?owner=DSamuelHodge&repo=github-cloudflare-agents"
```

Expected response:
```json
{
  "success": true,
  "job": {
    "id": "DSamuelHodge/github-cloudflare-agents/1736726400000",
    "status": "completed",
    "stats": {
      "filesProcessed": 5,
      "chunksCreated": 23,
      "totalTokens": 18400,
      "errors": 0
    }
  }
}
```

**Note:** This may take 30-60 seconds for repos with extensive documentation.

---

## Step 8: Configure GitHub Webhook

1. Go to your repository settings: `https://github.com/DSamuelHodge/github-cloudflare-agents/settings/hooks`

2. Click "Add webhook"

3. Configure:
   - **Payload URL:** `https://github-ai-agent.your-account.workers.dev/github`
   - **Content type:** `application/json`
   - **Secret:** Your `GITHUB_WEBHOOK_SECRET` value
   - **Events:** Select "Issues" (check "Let me select individual events")
   - **Active:** ✓ Checked

4. Click "Add webhook"

5. GitHub will send a ping event — check "Recent Deliveries" for 200 OK response

---

## Validation Tests

See [tests/phase1.5-validation.md](../tests/phase1.5-validation.md) for comprehensive test cases.

---

## Troubleshooting

### Error: "TEST_ARTIFACTS R2 binding not configured"
- Verify R2 bucket exists: `wrangler r2 bucket list`
- Check `wrangler.toml` has correct R2 binding

### Error: "DOC_EMBEDDINGS KV namespace not found"
- Verify KV namespace was created: `wrangler kv:namespace list`
- Ensure ID in `wrangler.toml` matches actual namespace ID

### Indexing Timeout
- Large repos may exceed Worker timeout (30s default)
- Index in batches or increase `maxFiles` parameter

### High Embedding Costs
- Monitor usage in Phase 1.5.2 (next sub-phase)
- Consider indexing only critical documentation paths

---

## Rollback Plan

If deployment fails or causes issues:

```bash
# Revert to previous stable version
git checkout main
npm run deploy
```

---

## Next Steps

After successful deployment:
- **Phase 1.5.2:** Add token usage monitoring
- **Phase 1.5.4:** Secure `/index-docs` endpoint
- Create test issues to validate all features
