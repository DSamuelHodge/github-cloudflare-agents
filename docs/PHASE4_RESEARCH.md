# Phase 4: Cloudflare AI Gateway Research & API Reference

**Research Date:** January 12, 2026  
**Status:** Complete  
**Sources:** Cloudflare Docs, Official API Reference

---

## EXECUTIVE SUMMARY

Cloudflare AI Gateway is a production-ready multi-provider abstraction layer that:
- ✅ Supports 8+ AI providers (Gemini, OpenAI, Anthropic, Workers AI, Bedrock, Azure, etc.)
- ✅ Provides unified OpenAI-compatible endpoint for all providers
- ✅ Manages provider authentication via BYOK (Bring Your Own Keys)
- ✅ Tracks per-provider costs, tokens, and latency
- ✅ Includes rate limiting, caching, and failover capabilities
- ✅ No provider lock-in (easily switch models by changing request parameter)

**Cost:** Free tier available with 1M requests/month; Pro tier for higher volume.

---

## 1. GATEWAY ENDPOINTS

### Unified Endpoint (Recommended)
**Endpoint:** `https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions`

**Usage:**
- Drop-in OpenAI SDK replacement
- Switch providers by changing `model` parameter
- Single endpoint for all providers

**Example Request:**
```bash
curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions \
  -H "cf-aig-authorization: Bearer {CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Model Format:** `{provider}/{model-name}`

---

### Provider-Specific Endpoints

For direct provider integration (preserves provider-specific schemas):

**Endpoint Format:**
```
https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/{provider}
```

**Supported Providers & Routes:**

| Provider | Endpoint | Models |
|----------|----------|--------|
| Google AI Studio | `/google/chat/completions` | gemini-2.5-flash, gemini-1.5-pro, gemini-1.5-flash |
| OpenAI | `/openai/chat/completions` | gpt-4, gpt-4o, gpt-4-turbo |
| Anthropic | `/anthropic/messages` | claude-3-sonnet, claude-3-opus, claude-3-haiku |
| Workers AI | `/workers-ai/chat/completions` | @cf/meta/llama-2-7b-chat-fp16, others |
| AWS Bedrock | `/bedrock/invoke-model` | Various AWS models |
| Azure OpenAI | `/azure-openai/deployments/{deployment}/chat/completions` | GPT models via Azure |

---

### Gateway Management Endpoints

**List Gateways:**
```
GET /accounts/{ACCOUNT_ID}/ai-gateway/gateways
Authorization: Bearer {CF_API_TOKEN}
```
Returns: Array of gateway objects with IDs, names, creation dates

**Fetch Gateway:**
```
GET /accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}
```
Returns: Gateway configuration, authentication status, settings

**Create Gateway:**
```
POST /accounts/{ACCOUNT_ID}/ai-gateway/gateways
Content-Type: application/json
{
  "name": "github-ai-agent"
}
```
Returns: New gateway object with ID

**Delete Gateway:**
```
DELETE /accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}
```

---

### Analytics & Logs Endpoints

**List Gateway Logs:**
```
GET /accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs
Authorization: Bearer {CF_API_TOKEN}
```

**Response Fields:**
- `id`: Log entry ID
- `cached`: Boolean (was response cached?)
- `created_at`: Timestamp
- `model`: Model used (e.g., "gpt-4")
- `provider`: Provider name
- `request_tokens`: Input tokens
- `response_tokens`: Output tokens
- `total_tokens`: Sum of input + output
- `status`: HTTP status (200, 401, 429, etc.)
- `cost_usd`: Estimated cost (if unified billing enabled)

**Pagination:** V4PagePaginationArray format with `page`, `per_page` parameters

**Get Log Detail:**
```
GET /accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs/{LOG_ID}
```
Returns: Full request/response with timing and error details

---

## 2. AUTHENTICATION METHODS

### Option A: BYOK (Bring Your Own Keys) — Recommended
**Setup:** Store provider API keys in Cloudflare Secrets Store (encrypted)

**Dashboard Flow:**
1. AI > AI Gateway > Select gateway
2. Provider Keys > Add API Key
3. Select provider (Google, OpenAI, Anthropic)
4. Paste API key
5. Cloudflare encrypts and stores

**Request Header:**
```
cf-aig-authorization: Bearer {CF_API_TOKEN}
```
(No provider auth headers needed; Cloudflare injects stored keys)

**Advantages:**
- ✅ Keys never sent in requests
- ✅ Easy key rotation (update in dashboard, automatic)
- ✅ Audit trail in Cloudflare logs
- ✅ Per-provider rate limiting possible

---

### Option B: Unified Billing
**Setup:** Use Cloudflare's own AI model allocation/credits

**Requirements:**
- Cloudflare Workers Paid Plan ($5/month)
- Enable unified billing in gateway settings
- Pay consolidated invoice for all providers

**Advantages:**
- ✅ Single vendor, single invoice
- ✅ Cost aggregation
- ✅ No need to manage multiple provider accounts

---

### Option C: Request Headers (Legacy)
**Setup:** Include provider auth in every request

**Request Header:**
```
Authorization: Bearer {PROVIDER_API_KEY}
```

**Disadvantages:**
- ❌ Keys exposed in request headers
- ❌ Keys in logs/audit trails
- ❌ Difficult key rotation

---

## 3. PROVIDER CONFIGURATION FOR OUR USE CASE

### Gemini (Google AI Studio) — Primary
**Current:** Using via OpenRouter (intermediary)  
**New:** Direct via AI Gateway

**Configuration:**
```json
{
  "provider": "google-ai-studio",
  "model": "gemini-2.5-flash",
  "byok_key": "{GOOGLE_AI_STUDIO_API_KEY}",
  "rate_limit": "100 requests/min",
  "budget_limit": "$10/day"
}
```

**API Key Location:** https://aistudio.google.com/app/apikey

---

### OpenAI (GPT-4/4o) — Fallback 1
**Current:** Not in use  
**New:** Configured as fallback

**Configuration:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "byok_key": "{OPENAI_API_KEY}",
  "rate_limit": "50 requests/min",
  "budget_limit": "$20/day"
}
```

**API Key Location:** https://platform.openai.com/api-keys

---

### Anthropic (Claude 3 Sonnet) — Fallback 2
**Current:** Not in use  
**New:** Configured as fallback

**Configuration:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "byok_key": "{ANTHROPIC_API_KEY}",
  "rate_limit": "50 requests/min",
  "budget_limit": "$20/day"
}
```

**API Key Location:** https://console.anthropic.com/account/keys

---

## 4. COST STRUCTURE

### Per-Provider Pricing (BYOK)
You pay provider rates directly + small Cloudflare fee (~5-10%)

**Example Monthly Cost (1M tokens/month across all):**
- Gemini: ~$0.10 (cheap, use as primary)
- GPT-4: ~$15 (expensive, use as fallback)
- Claude 3: ~$5 (mid-range, use as fallback)
- **Total ~$20-25/month** with gateway overhead

### Unified Billing
Cloudflare manages billing aggregation (costs bundled in Cloudflare invoice)

---

## 5. FEATURE CAPABILITIES

### Caching
**Automatic response caching** by request hash  
**Cost Benefit:** Repeated queries → cache hit → $0 cost

**Enable:** Default (no config needed)  
**TTL:** Configurable per gateway

---

### Rate Limiting
**Per-provider limits** (prevent one provider blowing budget)

**Configuration:**
```json
{
  "rate_limits": [
    { "provider": "gemini", "requests_per_min": 100 },
    { "provider": "openai", "requests_per_min": 50 },
    { "provider": "anthropic", "requests_per_min": 50 }
  ]
}
```

---

### Dynamic Routing (Advanced)
**Conditional routing** based on request properties

**Example Use Cases:**
- Route 80% to Gemini, 20% to OpenAI (A/B test)
- Use OpenAI only if Gemini rate-limited
- Use cheaper model for simple requests, expensive for complex

**Requires:** Dynamic Routes API (advanced feature)

---

### Failover / Fallback
**Built-in support** for provider chains

**Configuration (via API):**
```json
{
  "failover_chain": [
    { "provider": "gemini", "weight": 100 },
    { "provider": "openai", "weight": 0 }  // Active on Gemini failure
  ]
}
```

---

## 6. INTEGRATION WITH OUR ARCHITECTURE

### Current Flow (Phase 3)
```
Agents (TriagingAgent, PRReviewAgent)
  ↓
src/platform/ai/client.ts (OpenAI SDK)
  ↓
OpenRouter (intermediary)
  ↓
Gemini API
```

### Future Flow (Phase 4.1+)
```
Agents (TriagingAgent, PRReviewAgent)
  ↓
src/platform/ai/client.ts (unchanged initially)
  ↓
AI Gateway (Stage 2 adapter)
  ↓
Cloudflare AI Gateway
  ↓
[Gemini] [OpenAI] [Anthropic]
```

### Key Benefits
1. **No intermediary cost** (save OpenRouter markup)
2. **Native provider support** (no translation layer)
3. **Built-in analytics** (token usage, cost per provider)
4. **Unified auth** (BYOK eliminates key sprawl)
5. **Easy fallback** (handled by gateway, not agents)

---

## 7. SECURITY CONSIDERATIONS

### BYOK Security Model
- ✅ Keys encrypted at rest (Cloudflare Secrets Store)
- ✅ Keys encrypted in transit (TLS 1.3)
- ✅ Keys rotated in dashboard (no app restarts)
- ✅ Audit log of key usage
- ❌ Keys NOT visible in request/response logs

### API Token Security
- ✅ Requires explicit AI Gateway permissions (token can't do everything)
- ✅ Token stored in `.dev.vars` (not committed to repo)
- ✅ Token can be revoked per gateway
- ✅ Separate from deployment token

---

## 8. PRICING CALCULATOR

**For github-ai-agent deployment:**

### Scenario: 100 GitHub issues/month

**Assumptions:**
- 50% triaging (Gemini)
- 50% PR reviews (Gemini)
- Average 1,000 input tokens + 500 output tokens per request

**Cost Breakdown:**

| Provider | Requests | Tokens | Cost |
|----------|----------|--------|------|
| Gemini | 100 | 150K | $0.03 |
| Gemini cache hits (est 30%) | 30 | - | $0.00 |
| **Monthly Total** | - | - | **~$0.05** |

**With Fallback Overhead (5% fail-over to OpenAI):**
| Provider | Requests | Tokens | Cost |
|----------|----------|--------|------|
| Gemini | 95 | 142.5K | $0.03 |
| OpenAI | 5 | 7.5K | $0.02 |
| **Monthly Total** | - | - | **~$0.05** |

**Result:** Negligible cost increase; AI Gateway investment breaks even after ~1,000 requests.

---

## 9. MIGRATION TIMELINE

### Phase 4.1 (Week 1): Infrastructure
- Create AI Gateway
- Store provider keys (BYOK)
- Document endpoints

### Phase 4.2 (Week 2): Code Integration
- Build gateway-client adapter
- Implement fallback chain
- Test with all agents

### Phase 4.3 (Week 3): Analytics
- Fetch logs via API
- Calculate per-provider costs
- Display in analytics endpoint

### Phase 4.4+ (Weeks 4+): Optimization
- Enable caching for RAG queries
- Configure rate limits
- A/B test fallback strategies

---

## 10. COMPARISON: Before vs. After

| Aspect | Before (OpenRouter) | After (AI Gateway) |
|--------|-------------------|-------------------|
| Provider lock-in | OpenRouter only | Any provider |
| Cost visibility | Aggregate only | Per-provider |
| Fallback logic | Manual in code | Native in gateway |
| Key management | Environment variables | Cloudflare Secrets Store |
| Rate limiting | Manual middleware | Built-in |
| Caching | None | Automatic |
| Request latency | Direct | +50-200ms (acceptable) |
| Setup complexity | Low | Medium |

---

## REFERENCES

- [Cloudflare AI Gateway Docs](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare API Reference](https://developers.cloudflare.com/api/resources/ai_gateway/)
- [Getting Started Guide](https://developers.cloudflare.com/ai-gateway/get-started/)
- [BYOK Documentation](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- [Dynamic Routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)

