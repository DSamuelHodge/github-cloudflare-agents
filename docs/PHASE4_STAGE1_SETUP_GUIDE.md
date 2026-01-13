# Phase 4.1 Stage 1: Cloudflare AI Gateway Setup Guide

**Status:** ✅ EXECUTION PHASE  
**Estimated Time:** 30-45 minutes  
**Date:** January 12, 2026

---

## QUICK START (TL;DR)

```
1. Go to https://dash.cloudflare.com → AI > AI Gateway
2. Click "Create Gateway" → Name: "github-ai-agent" → Create
3. Add Provider Keys: Gemini, OpenAI, Anthropic
4. Copy Gateway ID and Account ID
5. Update .dev.vars with new variables
6. Test endpoints (curl commands below)
7. Done! ✅
```

---

## PREREQUISITES

- ✅ Cloudflare account (already have one)
- ✅ Cloudflare API token with AI Gateway permissions
- ✅ 3 provider API keys:
  - Google AI Studio (Gemini): https://aistudio.google.com/app/apikey
  - OpenAI: https://platform.openai.com/api-keys
  - Anthropic: https://console.anthropic.com/account/keys

---

## OPTION A: DASHBOARD SETUP (Recommended for First-Time)

### Step 1: Create Gateway

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to: **AI > AI Gateway**
3. Click **Create Gateway**
4. Enter Gateway Name: `github-ai-agent`
5. Click **Create**

**Result:**
- Gateway ID created (e.g., `github-ai-agent`)
- Status: Active
- Note the Account ID from dashboard URL: `https://dash.cloudflare.com/?to=/:account_id/ai/ai-gateway`

---

### Step 2: Store Provider Keys (BYOK)

**For each provider:**

1. In gateway dashboard, click **Provider Keys**
2. Click **Add API Key**
3. Select provider from dropdown:
   - Google AI Studio
   - OpenAI
   - Anthropic
4. Paste API key in field
5. (Optional) Add description: e.g., "Gemini for github-ai-agent"
6. Click **Save**

**Repeat for all 3 providers.**

**Result:**
- Gemini key stored (encrypted)
- OpenAI key stored (encrypted)
- Anthropic key stored (encrypted)

---

### Step 3: Enable Authentication

1. In gateway dashboard, go to **Authentication**
2. Toggle **Require authentication** ON
3. Note the authentication token (use as `cf-aig-authorization`)
4. Click **Generate new token** if needed
5. Save token to `.dev.vars` as `CLOUDFLARE_API_TOKEN`

**Result:**
- Authentication enforced (all requests require `cf-aig-authorization` header)

---

### Step 4: Get Account ID

1. In Cloudflare dashboard, go to **Account Home**
2. Copy **Account ID** (right panel)
3. Save to `.dev.vars` as `CLOUDFLARE_ACCOUNT_ID`

---

## OPTION B: API SETUP (Automation-Friendly)

### Prerequisites
- API token with AI Gateway permissions
- Account ID
- Provider keys on hand

### Step 1: Create Gateway via API

```bash
ACCOUNT_ID="your-account-id"
CF_API_TOKEN="your-api-token"

curl -X POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-gateway/gateways \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github-ai-agent"
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "id": "gateway-id-123",
    "name": "github-ai-agent",
    "account_id": "$ACCOUNT_ID",
    "created_at": "2026-01-12T19:00:00Z"
  }
}
```

**Save result.**

---

### Step 2: Store Provider Keys via Secrets Store

```bash
ACCOUNT_ID="your-account-id"
CF_API_TOKEN="your-api-token"
GEMINI_KEY="your-gemini-api-key"

# Create secret for Gemini
curl -X POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-gateway/secrets \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gemini-key",
    "value": "'$GEMINI_KEY'",
    "provider": "google-ai-studio"
  }'

# Repeat for OpenAI and Anthropic
```

---

## ENVIRONMENT VARIABLES

### Update `.dev.vars`

Create or update `.dev.vars` in project root:

```bash
# Existing variables (keep these)
GITHUB_TOKEN="ghp_xxx..."
GITHUB_WEBHOOK_SECRET="whsec_xxx..."
LOG_LEVEL="info"

# New Phase 4.1 variables (add these)
CLOUDFLARE_ACCOUNT_ID="your-account-id"
CLOUDFLARE_GATEWAY_ID="github-ai-agent"
CLOUDFLARE_API_TOKEN="your-bearer-token"
```

### Update `.dev.vars.example`

Add to `.dev.vars.example` (for documentation):

```bash
# ─────────────────────────────────────────────────
# Phase 4.1: Cloudflare AI Gateway Configuration
# ─────────────────────────────────────────────────
CLOUDFLARE_ACCOUNT_ID=your-account-id-from-dashboard
CLOUDFLARE_GATEWAY_ID=github-ai-agent
CLOUDFLARE_API_TOKEN=your-bearer-token-with-ai-gateway-permissions
```

---

## VALIDATION CHECKLIST

### ✅ Step 1: Gateway Exists

```bash
curl -X GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json"
```

**Expected:** Array with `github-ai-agent` listed

---

### ✅ Step 2: Provider Keys Stored

Dashboard check:
- Navigate to AI > AI Gateway > github-ai-agent > Provider Keys
- Verify: 3 keys listed (Gemini, OpenAI, Anthropic)
- All showing "Active" status

---

### ✅ Step 3: Unified Endpoint Responds (Gemini)

```bash
curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions \
  -H "cf-aig-authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

**Expected:** 200 OK with response like:
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      }
    }
  ]
}
```

---

### ✅ Step 4: OpenAI Endpoint Responds

```bash
curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions \
  -H "cf-aig-authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

**Expected:** 200 OK (or 429 if rate limited, which is fine)

---

### ✅ Step 5: Anthropic Endpoint Responds

```bash
curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions \
  -H "cf-aig-authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3-sonnet",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

**Expected:** 200 OK

---

### ✅ Step 6: Gateway Logs Accessible

```bash
curl -X GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json"
```

**Expected:** Array of log entries with:
- `model`: "google/gemini-2.5-flash", "openai/gpt-4", etc.
- `request_tokens`: number
- `response_tokens`: number
- `total_tokens`: number
- `status`: 200

---

## VERIFICATION SCRIPT (All-in-One)

Save as `verify-gateway.sh`:

```bash
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load variables
source .dev.vars

echo "Verifying Cloudflare AI Gateway Setup..."
echo ""

# Test 1: List gateways
echo "1. Checking gateway exists..."
GATEWAY_CHECK=$(curl -s -X GET https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | grep -c "github-ai-agent")

if [ "$GATEWAY_CHECK" -gt 0 ]; then
  echo -e "${GREEN}✓ Gateway found${NC}"
else
  echo -e "${RED}✗ Gateway not found${NC}"
  exit 1
fi

# Test 2: Gemini endpoint
echo "2. Testing Gemini endpoint..."
GEMINI_RESPONSE=$(curl -s -X POST https://gateway.ai.cloudflare.com/v1/$CLOUDFLARE_ACCOUNT_ID/$CLOUDFLARE_GATEWAY_ID/compat/chat/completions \
  -H "cf-aig-authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "google/gemini-2.5-flash", "messages": [{"role": "user", "content": "hello"}]}' | grep -c "assistant")

if [ "$GEMINI_RESPONSE" -gt 0 ]; then
  echo -e "${GREEN}✓ Gemini endpoint working${NC}"
else
  echo -e "${RED}✗ Gemini endpoint failed${NC}"
fi

# Test 3: OpenAI endpoint
echo "3. Testing OpenAI endpoint..."
OPENAI_RESPONSE=$(curl -s -X POST https://gateway.ai.cloudflare.com/v1/$CLOUDFLARE_ACCOUNT_ID/$CLOUDFLARE_GATEWAY_ID/compat/chat/completions \
  -H "cf-aig-authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4", "messages": [{"role": "user", "content": "hello"}]}' | grep -c "assistant")

if [ "$OPENAI_RESPONSE" -gt 0 ]; then
  echo -e "${GREEN}✓ OpenAI endpoint working${NC}"
else
  echo -e "${RED}✗ OpenAI endpoint failed${NC}"
fi

# Test 4: Anthropic endpoint
echo "4. Testing Anthropic endpoint..."
ANTHROPIC_RESPONSE=$(curl -s -X POST https://gateway.ai.cloudflare.com/v1/$CLOUDFLARE_ACCOUNT_ID/$CLOUDFLARE_GATEWAY_ID/compat/chat/completions \
  -H "cf-aig-authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-3-sonnet", "messages": [{"role": "user", "content": "hello"}]}' | grep -c "assistant")

if [ "$ANTHROPIC_RESPONSE" -gt 0 ]; then
  echo -e "${GREEN}✓ Anthropic endpoint working${NC}"
else
  echo -e "${RED}✗ Anthropic endpoint failed${NC}"
fi

# Test 5: Logs accessible
echo "5. Testing logs endpoint..."
LOGS_CHECK=$(curl -s -X GET https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways/$CLOUDFLARE_GATEWAY_ID/logs \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | grep -c "created_at")

if [ "$LOGS_CHECK" -gt 0 ]; then
  echo -e "${GREEN}✓ Logs accessible${NC}"
else
  echo -e "${RED}✗ Logs not accessible${NC}"
fi

echo ""
echo "✅ Stage 1 validation complete!"
```

---

## TROUBLESHOOTING

### 401 Unauthorized
**Problem:** `"error": "Unauthorized"`

**Solution:**
- Check `CLOUDFLARE_API_TOKEN` is valid
- Verify token has "AI Gateway - Edit" permissions
- Regenerate token if needed

---

### 404 Gateway Not Found
**Problem:** `"error": "gateway not found"`

**Solution:**
- Verify `CLOUDFLARE_GATEWAY_ID` matches dashboard name
- Check `CLOUDFLARE_ACCOUNT_ID` is correct
- Retry after gateway finishes initializing (~5 min)

---

### 401 on Provider Endpoint
**Problem:** `"error": "Unauthorized"` on `/compat/chat/completions`

**Solution:**
- Verify BYOK provider key was stored
- Check key is marked "Active" in dashboard
- Retry key addition if status shows "Invalid"

---

### 429 Too Many Requests
**Problem:** Rate limit hit

**Solution:**
- Wait 60 seconds
- Endpoint rate limiting is working correctly
- In production, implement exponential backoff

---

## NEXT STEPS

Once all validation passes ✅:

1. **Commit** environment variables
2. **Mark Stage 1 COMPLETE** in git
3. **Generate Stage 2 contract** (AI Client Adapter)
4. **Continue to Stage 2** (Week 2)

---

## SUPPORT

If you encounter issues:
1. Check troubleshooting section above
2. Review Cloudflare AI Gateway docs: https://developers.cloudflare.com/ai-gateway/
3. Verify env variables in `.dev.vars`

**All validation tests in this guide mirror the Stage 1 Contract criteria.**

