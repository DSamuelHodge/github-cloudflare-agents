# Phase 4.1: Stage 1 Execution Contract
## Cloudflare AI Gateway Infrastructure Setup

**Date Created:** January 12, 2026  
**Status:** Ready for Approval  
**Protocol Version:** Meta-Prompt v2.0

---

## OBJECTIVE

Create and configure a production-ready Cloudflare AI Gateway that abstracts multi-provider authentication (Gemini, OpenAI, Anthropic) and provides a unified endpoint for all agents to consume, enabling provider failover logic, cost tracking, and rate limiting without code changes.

---

## IMMUTABLE ASSUMPTIONS

These must NOT change during or after this stage:

1. **Existing agent interfaces remain unchanged** — `src/platform/ai/client.ts` exports signature stays the same until Stage 2
2. **Current deployment pipeline (npm run deploy) works** — No wrangler.toml structure changes that break existing CI/CD
3. **GitHub webhook authentication unchanged** — All webhook verification and routing logic untouched
4. **Repository multi-repo config unaffected** — Phase 3 RepositoryConfigService continues to work
5. **TypeScript strictness maintained** — No `any` types introduced, all types explicit
6. **Production agent behavior identical** — Agents do not receive modified requests during Stage 1
7. **No data migrations** — R2 artifacts, KV conversations, or analytics remain untouched
8. **Test suite compatibility** — Existing 191 tests must continue to pass

---

## INPUTS

**Existing Infrastructure:**
- Cloudflare account (DSamuelHodge/github-cloudflare-agents)
- Current AI provider: Gemini 2.5 Flash via OpenRouter
- Environment: `wrangler.toml` with `GEMINI_MODEL="gemini-2.5-flash"`
- Agents: TriagingAgent, PRReviewAgent (both expect OpenAI-compatible endpoint)

**Required Information to Gather:**
- Cloudflare Account ID (from dashboard)
- API Token with AI Gateway permissions
- Current provider API keys:
  - Google AI Studio (Gemini)
  - OpenAI (GPT-4, GPT-4o)
  - Anthropic (Claude 3 Sonnet)

---

## OUTPUTS

**New Infrastructure (End State):**
1. **Cloudflare AI Gateway created**
   - Gateway ID: `{GATEWAY_NAME}` (e.g., `github-ai-agent`)
   - Authenticated gateway enabled (requires `cf-aig-authorization` header)
   - Provider keys stored via BYOK (Bring Your Own Keys)

2. **Provider Configuration in Gateway**
   - Gemini (Google AI Studio) → `model: "google/gemini-2.5-flash"`
   - OpenAI (GPT-4) → `model: "openai/gpt-4"`
   - Anthropic (Claude 3 Sonnet) → `model: "anthropic/claude-3-sonnet"`
   - All keys stored securely in Cloudflare Secrets Store

3. **Gateway Endpoints Verified**
   - ✅ Unified endpoint: `https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions`
   - ✅ Provider-specific: `https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/{provider}`
   - ✅ Log/analytics access: `GET /accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs`

4. **Environment Configuration**
   - New `.dev.vars` entries:
     - `CLOUDFLARE_ACCOUNT_ID`
     - `CLOUDFLARE_GATEWAY_ID`
     - `CLOUDFLARE_API_TOKEN` (with AI Gateway read/write permissions)
   - Updated `wrangler.toml` with gateway bindings (if needed)
   - Documented secrets in `.dev.vars.example`

5. **Documentation**
   - Setup guide: `docs/PHASE4_GATEWAY_SETUP.md`
   - API endpoint reference: `docs/PHASE4_API_ENDPOINTS.md`
   - Provider key rotation process: `docs/PHASE4_KEY_ROTATION.md`

---

## CONSTRAINTS

### Libraries & APIs
- **Cloudflare API:** RESTful, no SDK required (can use native `fetch`)
- **Gateway API Limits:**
  - Rate limit: 1,000 requests/min (standard tier)
  - Key storage: Up to 100 keys per account
  - Log retention: 30 days (free tier)
- **TypeScript:** Must use `@cloudflare/workers-types` for type definitions

### Performance & Compatibility
- Gateway response latency: +50-200ms overhead vs. direct provider (acceptable)
- Request format: OpenAI-compatible (no format changes needed in Stage 2)
- Header requirement: `cf-aig-authorization: Bearer {CF_API_TOKEN}`

### Security
- API tokens must NOT be hardcoded in repo
- BYOK keys managed entirely by Cloudflare (no local storage)
- Authenticated gateway enforces token validation per request

---

## DISALLOWED ACTIONS

**Explicitly forbidden during Stage 1:**

1. ❌ Do NOT modify `src/platform/ai/client.ts` or any agent code
2. ❌ Do NOT create new npm packages or dependencies
3. ❌ Do NOT implement fallback logic (deferred to Stage 3)
4. ❌ Do NOT change `wrangler.toml` in ways that affect deployment
5. ❌ Do NOT access gateway in production yet (only setup/test)
6. ❌ Do NOT modify test suite
7. ❌ Do NOT add cost tracking logic to agents
8. ❌ Do NOT create analytics integrations

**Why:** Stage 1 is infrastructure-only. Code integration happens in Stage 2.

---

## VALIDATION CRITERIA

### How to Verify Stage 1 Success

1. **Gateway Created**
   ```bash
   # Via Cloudflare API
   curl -X GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways \
     -H "Authorization: Bearer {CF_API_TOKEN}" \
     -H "Content-Type: application/json"
   # Expected: Gateway listed with name "github-ai-agent"
   ```

2. **Provider Keys Stored**
   - Dashboard: `AI > AI Gateway > github-ai-agent > Provider Keys`
   - Verify: 3 keys listed (Gemini, OpenAI, Anthropic)
   - Status: All "Active"

3. **Unified Endpoint Responds**
   ```bash
   curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/compat/chat/completions \
     -H "cf-aig-authorization: Bearer {CF_API_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"model": "google/gemini-2.5-flash", "messages": [{"role": "user", "content": "test"}]}'
   # Expected: 200 OK with valid response
   ```

4. **Provider Endpoints Respond**
   ```bash
   # Test each provider
   curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/google/chat/completions ...
   curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/openai/chat/completions ...
   curl -X POST https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/anthropic/messages ...
   # Expected: All return 200 OK or valid error (not 401/403)
   ```

5. **Logs Accessible**
   ```bash
   curl -X GET https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways/{GATEWAY_ID}/logs \
     -H "Authorization: Bearer {CF_API_TOKEN}"
   # Expected: Array of gateway request logs with timestamps and models used
   ```

6. **Environment Variables Documented**
   - `docs/PHASE4_GATEWAY_SETUP.md` includes step-by-step setup
   - `.dev.vars.example` updated with new vars
   - Local `.dev.vars` has values (not committed)

---

## INTEGRATION WITH PHASE 4 ROADMAP

### How Stage 1 Enables Later Stages

| Stage | Dependency on Stage 1 | Benefit |
|-------|----------------------|---------|
| **Stage 2: AI Client Adapter** | Gateway endpoint URL + auth | Provides target endpoint for new gateway-client.ts |
| **Stage 3: Fallback Strategy** | Provider endpoints tested | Circuit breaker can switch providers |
| **Stage 4: Integration Tests** | All endpoints responding | Test each provider fallback chain |
| **Stage 5: Env Migration** | Gateway config documented | Copy env vars to wrangler.toml |
| **Stage 6: Analytics** | Log access working | Fetch per-provider token usage from logs |

### No Conflicts with Existing Features

| Feature | Stage 1 Impact | Why Safe |
|---------|----------------|----------|
| Phase 3 Multi-repo routing | ✅ None | Gateway is transparent layer, repo config unaffected |
| Phase 2 Container tests | ✅ None | Containers don't call AI provider, only store artifacts |
| Phase 1.5 RAG + KV | ✅ None | KV embeddings unchanged, embeddings are served locally |
| Webhook processing | ✅ None | Webhook signature verification unchanged |
| GitHub API calls | ✅ None | GitHub client unmodified |
| Rate limiting | ✅ Complementary | Gateway rate limits are separate from agent rate limits |

---

## IMPLEMENTATION WORKFLOW (Do Not Execute Until Approved)

### Manual Steps (Cloudflare Dashboard)
1. Log in to https://dash.cloudflare.com
2. Navigate: AI > AI Gateway
3. Click "Create Gateway" → Enter name `github-ai-agent`
4. Go to Provider Keys → Add API Key
   - Provider: Google AI Studio → Paste Gemini key
   - Provider: OpenAI → Paste OpenAI key
   - Provider: Anthropic → Paste Anthropic key
5. Enable Authentication → Copy `cf-aig-authorization` token
6. Note Gateway ID

### API-Based Setup (Alternative)
```bash
# Create gateway via API
curl -X POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/gateways \
  -H "Authorization: Bearer {CF_API_TOKEN}" \
  -d '{"name": "github-ai-agent"}'

# Response includes gateway_id
```

### Post-Setup Documentation
1. Create `docs/PHASE4_GATEWAY_SETUP.md` with:
   - Prerequisites (Cloudflare account, API token)
   - Dashboard setup walkthrough
   - API setup script (optional)
   - Credentials storage best practices
   - Endpoint reference table

2. Update `.dev.vars.example`:
   ```
   CLOUDFLARE_ACCOUNT_ID=<your-account-id>
   CLOUDFLARE_GATEWAY_ID=github-ai-agent
   CLOUDFLARE_API_TOKEN=<bearer-token-with-ai-gateway-permissions>
   ```

3. Add to `.gitignore` (if not already):
   ```
   .dev.vars
   .wrangler
   ```

---

## ROLLBACK PLAN

If gateway setup fails:
1. **Delete gateway** via dashboard (AI > AI Gateway > delete)
2. **Revert documentation** (no code changes, so nothing to revert)
3. **Keep local API tokens** in `.dev.vars` (not committed)
4. Status: Agent code unmodified, ready for retry

---

## KNOWN LIMITATIONS & DEFERRED WORK

- ⏭️ **No failover implemented yet** (Stage 3)
- ⏭️ **No cost tracking yet** (Stage 6)
- ⏭️ **No analytics dashboard yet** (Phase 4.3)
- ⏭️ **No A/B testing setup yet** (beyond Phase 4)
- ⏭️ **No rate limiting rules configured yet** (Stage 5)

---

## APPROVAL CHECKLIST

- [ ] Immutable Assumptions understood and agreed
- [ ] Constraints acceptable (latency, API limits)
- [ ] Integration with Phase 4 features validated
- [ ] No conflicts with Phase 1/2/3 identified
- [ ] Validation criteria realistic and testable
- [ ] Ready to execute Stage 1

---

**Contract Status:** ⏳ **AWAITING APPROVAL**

**Next:** Once approved, proceed to manual gateway setup + documentation.

