# Phase 4.1: Provider Key Rotation & Management Guide

**Purpose:** Manage provider API keys securely in Cloudflare AI Gateway  
**Status:** Reference documentation for Stage 1+

---

## OVERVIEW

With Cloudflare AI Gateway (BYOK), provider keys are stored securely in the **Cloudflare Secrets Store**. This guide explains how to rotate keys without downtime.

---

## ROTATING A PROVIDER KEY

### Scenario: Update OpenAI API Key (Scheduled Rotation)

#### Step 1: Generate New Key

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy new key
4. **Keep old key active** (don't delete yet)

---

#### Step 2: Add New Key to Cloudflare

**Via Dashboard:**
1. Go to Cloudflare Dashboard → AI > AI Gateway > github-ai-agent
2. Click **Provider Keys**
3. Find **OpenAI**
4. Click **Edit**
5. Paste new key
6. Click **Save**
7. Status should change to "Active"

**Via API:**
```bash
curl -X PUT https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/secrets/{SECRET_ID} \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "value": "sk-proj-xxx-new-key-here"
  }'
```

**Result:** New key is now active (old key automatically revoked)

---

#### Step 3: Verify New Key Works

```bash
curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions \
  -H "cf-aig-authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4",
    "messages": [{"role": "user", "content": "test"}]
  }'
```

**Expected:** 200 OK response

---

#### Step 4: Revoke Old Key

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Find old key
3. Click **Delete**
4. Confirm deletion

**Result:** Old key no longer valid

**Downtime:** 0 seconds (new key active before old key revoked)

---

## EMERGENCY KEY ROTATION (Compromised Key)

### If a key is leaked/compromised:

#### Immediate (Next 5 minutes):

1. **Generate new key** at provider (Gemini, OpenAI, Anthropic)
2. **Update Cloudflare immediately:**
   ```bash
   curl -X PUT https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/secrets/{SECRET_ID} \
     -H "Authorization: Bearer {CF_API_TOKEN}" \
     -d '{"value": "new-key-here"}'
   ```
3. **Test new key** (verify it works)

#### Within 1 hour:

4. **Revoke compromised key** at provider
5. **Monitor gateway logs** for suspicious activity
6. **Check provider usage** for unauthorized calls

**Downtime:** 0 seconds (automatic failover to new key)

---

## MANAGING MULTIPLE KEYS PER PROVIDER

### Scenario: Maintain staging + production keys separately

**Not recommended** for github-ai-agent (single production environment).

However, if needed:

1. Create separate gateways:
   - `github-ai-agent-prod` (main)
   - `github-ai-agent-staging` (test)

2. Store different keys in each gateway

3. Route by environment:
   - `NODE_ENV=production` → prod gateway
   - `NODE_ENV=staging` → staging gateway

**See:** `docs/PHASE4_RESEARCH.md` - Dynamic Routing section

---

## KEY AUDIT & MONITORING

### View Provider Key Usage

```bash
curl -X GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json"
```

**Response includes:**
- `provider`: Which provider was used
- `request_tokens`: Input tokens used
- `response_tokens`: Output tokens used
- `total_tokens`: Total tokens
- `cost_usd`: Estimated cost (if unified billing)

---

### Generate Usage Report by Provider

```bash
# Gemini usage
curl -s "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs" \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  | grep -c '"provider":"google"'

# OpenAI usage
curl -s "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs" \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  | grep -c '"provider":"openai"'

# Anthropic usage
curl -s "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs" \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  | grep -c '"provider":"anthropic"'
```

---

## BEST PRACTICES

### ✅ DO

- ✅ Rotate keys quarterly (even if not compromised)
- ✅ Store keys in `.dev.vars` (never hardcode)
- ✅ Verify new key works before revoking old key
- ✅ Monitor gateway logs for unusual activity
- ✅ Use Cloudflare Secrets Store (don't store in KV or R2)
- ✅ Keep API token (`CLOUDFLARE_API_TOKEN`) separate from provider keys

### ❌ DON'T

- ❌ Commit `.dev.vars` to git
- ❌ Share keys via Slack/email
- ❌ Reuse keys across services
- ❌ Store keys in comments or docs
- ❌ Keep compromised keys active
- ❌ Rely on a single provider without fallback (Stage 3)

---

## TROUBLESHOOTING

### Key shows "Invalid" in dashboard

**Problem:** Provider key rejected by Cloudflare

**Solution:**
1. Verify key format (should be `sk-proj-...` for OpenAI, `AIza...` for Gemini, etc.)
2. Check key has correct permissions in provider account
3. Try generating new key from provider
4. Re-paste in Cloudflare

---

### Requests fail after key rotation

**Problem:** New key doesn't work

**Solution:**
1. Verify key was saved (dashboard shows "Active")
2. Test key directly with provider
3. Check key has usage quota available
4. Wait 30 seconds for Secrets Store to propagate
5. Retry test request

---

### Old key still working after update

**Problem:** Cloudflare still accepting old key

**Solution:**
1. Old key in Secrets Store is cached
2. Wait 5-10 minutes for cache invalidation
3. Or manually trigger cache clear via API:
   ```bash
   curl -X POST https://api.cloudflare.com/client/v4/cache/purge \
     -H "Authorization: Bearer {CF_API_TOKEN}" \
     -d '{"files": ["{GATEWAY_ID}/secrets"]}'
   ```

---

## PROVIDER-SPECIFIC NOTES

### Google AI Studio (Gemini)

- Key format: `AIza...` (API key)
- Rotation: Generate new key in console, update Cloudflare
- Quota: Per-minute rate limit set in Google Cloud Console
- No expiry (keys valid indefinitely unless revoked)

---

### OpenAI

- Key format: `sk-proj-...` (project key)
- Rotation: Create new secret key in OpenAI dashboard
- Quota: Set via billing limits in OpenAI account
- Keys are long-lived (no auto-expiry)

---

### Anthropic

- Key format: `sk-ant-...` (Anthropic secret key)
- Rotation: Generate new key in Anthropic console
- Quota: Set via usage limits in Anthropic account
- Keys are valid indefinitely

---

## MONITORING & ALERTING (Future: Phase 4.3)

When Phase 4.3 Analytics Dashboard is built, you'll be able to:
- ✅ Alert if token usage spikes (compromised key?)
- ✅ Alert if rate limit is approached
- ✅ Alert if cost threshold exceeded
- ✅ View per-provider cost breakdown
- ✅ Automatically scale keys if needed

For now, manually check logs via API (see Usage Report section above).

---

## REFERENCE

- [Cloudflare Secrets Store Docs](https://developers.cloudflare.com/secrets-store/)
- [AI Gateway BYOK Documentation](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- [Provider-Specific Setup](https://developers.cloudflare.com/ai-gateway/usage/providers/)

