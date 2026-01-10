# Quick Start Guide

Get your GitHub AI Agent running in under 10 minutes.

## Prerequisites Checklist

- [ ] Cloudflare account (free tier works)
- [ ] GitHub account with a repository
- [ ] Gemini API key (Google AI Studio)
- [ ] Node.js 18+ installed
- [ ] 10 minutes of time

## Step-by-Step Setup

### 1. Clone and Install (2 minutes)

```bash
# Clone the repository
git clone <your-repo-url>
cd github-ai-agent

# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login
```

### 2. Get API Keys (3 minutes)

#### GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: `GitHub AI Agent`
4. Select scopes: ✅ `repo`
5. Click "Generate token"
6. **Copy the token immediately**

#### Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Click "Create API key"
3. Name: `GitHub Agent`
4. **Copy the key immediately**

### 3. Configure Secrets (2 minutes)

```bash
# Set GitHub token
npx wrangler secret put GITHUB_TOKEN
# Paste your token when prompted

# Set Gemini key
npx wrangler secret put GEMINI_API_KEY
# Paste your key when prompted

# Optional: Set webhook secret
npx wrangler secret put GITHUB_WEBHOOK_SECRET
# Enter a random string (e.g., "my-secret-123")
```

### 4. Deploy (1 minute)

```bash
npm run deploy
```

You'll see output like:
```
✨ Deployment complete!
🌍 https://github-ai-agent.your-subdomain.workers.dev
```

**Copy this URL** - you'll need it next.

### 5. Configure GitHub Webhook (2 minutes)

1. Go to your GitHub repository
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Fill in:
   - **Payload URL**: `https://your-worker-url.workers.dev/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: The webhook secret you set (or leave blank if you skipped it)
   - **Events**: Select "Let me select" → Check only ✅ **Issues**
4. Click **Add webhook**

### 6. Test It! (1 minute)

1. Go to your repository
2. Click **Issues** → **New issue**
3. Title: `Test: Cannot connect to database`
4. Description: 
   ```
   Getting timeout errors when connecting to PostgreSQL.
   Using Node.js with the pg library.
   ```
5. Add label: `help` or `bug`
6. Click **Submit new issue**

**Within 10 seconds**, the AI agent should post a helpful comment! 🎉

## Verify Everything Works

✅ **Check Webhook**: GitHub Settings → Webhooks → Should show ✅ green checkmark  
✅ **Check Logs**: Run `npm run tail` to see real-time logs  
✅ **Check Comment**: Issue should have a comment from your bot account  

## Troubleshooting

### No comment posted?

1. Check webhook recent deliveries (should show 202 response)
2. Run `npm run tail` and submit another test issue
3. Verify secrets are set: `npx wrangler secret list`

### Webhook shows error?

- **401 Unauthorized**: GitHub token invalid or expired
- **500 Error**: Check logs with `npm run tail`

### Still stuck?

- Check the [full README](../README.md) for detailed troubleshooting
- Review [example responses](./example-responses.md)
- Open an issue in this repository

## Next Steps

- ✨ Customize the AI prompt in `src/workflow.ts`
- 🎨 Adjust the response format in `formatGitHubComment()`
- 📊 Add analytics and monitoring
- 🔒 Restrict to specific repositories in `wrangler.toml`

## Cost Estimate

- **Cloudflare**: $0/month (free tier covers most usage)
- **Gemini**: Refer to https://ai.google.dev/gemini-api/pricing for latest rates (Gemini 3 Flash is typically low-cost for short prompts)
- **Total**: Typically a few dollars/month for light usage

---

**Questions?** Open an issue or check the docs!