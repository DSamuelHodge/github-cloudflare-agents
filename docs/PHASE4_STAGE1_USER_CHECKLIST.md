# Phase 4.1 Stage 1 - User Action Checklist

## 📋 Pre-Setup (5 minutes)

- [ ] **Gather API Keys**
  - [ ] Cloudflare Account ID (from Settings > Account tab)
  - [ ] Cloudflare API Token (with AI Gateway permissions)
  - [ ] Gemini API Key (from Google AI Studio)
  - [ ] OpenAI API Key (from platform.openai.com)
  - [ ] Anthropic API Key (from console.anthropic.com)

- [ ] **Read Documentation**
  - [ ] Open `docs/PHASE4_STAGE1_SETUP_GUIDE.md`
  - [ ] Review the two setup options (Dashboard vs API)
  - [ ] Note the 6 validation test commands

---

## 🚀 Setup Phase (25 minutes)

### Option A: Dashboard Setup (Recommended) ⭐

- [ ] **Step 1: Create Gateway**
  - [ ] Navigate to Cloudflare Dashboard
  - [ ] Go to AI > AI Gateway
  - [ ] Click "Create Gateway"
  - [ ] Name: `github-ai-agent`
  - [ ] Note the Gateway ID

- [ ] **Step 2: Configure Providers**
  - [ ] Add Gemini provider
    - [ ] Select Google (Google AI Studio)
    - [ ] Paste Gemini API key
    - [ ] Store via BYOK
  - [ ] Add OpenAI provider
    - [ ] Select OpenAI
    - [ ] Paste OpenAI API key
    - [ ] Store via BYOK
  - [ ] Add Anthropic provider
    - [ ] Select Anthropic
    - [ ] Paste Anthropic API key
    - [ ] Store via BYOK

- [ ] **Step 3: Enable Gateway**
  - [ ] Confirm all providers show ✅ Connected
  - [ ] Note the unified endpoint URL
  - [ ] Gateway ready for use

### Option B: API Setup (Advanced)

- [ ] **Use curl commands from setup guide**
  - [ ] Create gateway via API
  - [ ] Store provider keys via API
  - [ ] Verify responses are 200-201

---

## ✅ Validation Phase (10 minutes)

**Run all 6 curl tests from `PHASE4_STAGE1_SETUP_GUIDE.md`**

- [ ] **Test 1: Unified Endpoint**
  ```bash
  curl -X POST https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat/chat/completions \
    -H "Authorization: Bearer {cloudflare_token}" \
    -H "Content-Type: application/json" \
    -d '{"model": "gemini", "messages": [{"role": "user", "content": "Hello"}]}'
  ```
  - Expected: 200 status with response

- [ ] **Test 2: Gemini Provider**
  ```bash
  # Test Gemini-specific endpoint
  ```
  - Expected: 200 status

- [ ] **Test 3: OpenAI Provider**
  ```bash
  # Test OpenAI-specific endpoint
  ```
  - Expected: 200 status

- [ ] **Test 4: Anthropic Provider**
  ```bash
  # Test Anthropic-specific endpoint
  ```
  - Expected: 200 status

- [ ] **Test 5: Gateway Logs (Authenticated)**
  ```bash
  curl -X GET https://api.cloudflare.com/client/v4/accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs \
    -H "Authorization: Bearer {cloudflare_token}"
  ```
  - Expected: 200 status with logs array

- [ ] **Test 6: All-in-One Verification Script**
  - [ ] Run the provided bash script from setup guide
  - [ ] All tests pass

---

## 🔧 Local Configuration (5 minutes)

- [ ] **Update .dev.vars**
  - [ ] Copy `.dev.vars.example` to `.dev.vars`
  - [ ] Add `CLOUDFLARE_ACCOUNT_ID`
  - [ ] Add `CLOUDFLARE_GATEWAY_ID`
  - [ ] Add `CLOUDFLARE_API_TOKEN`

- [ ] **Verify Configuration**
  - [ ] Local development environment ready
  - [ ] Can deploy with new variables

---

## 🎯 Success Criteria (Stage 1 Complete)

✅ **All 6 must be true:**

| # | Criterion | ✓ |
|---|-----------|---|
| 1 | Gateway created (name: `github-ai-agent`) | [ ] |
| 2 | 3 provider keys stored (Gemini, OpenAI, Anthropic) | [ ] |
| 3 | Unified endpoint responds (200 status) | [ ] |
| 4 | All provider endpoints respond (200 status each) | [ ] |
| 5 | Logs endpoint accessible (200 status) | [ ] |
| 6 | Environment variables configured locally | [ ] |

---

## 📤 Completion Report

Once all checks are done, gather:

- [ ] **Screenshot or confirmation:**
  - Cloudflare dashboard showing gateway created
  - All 3 providers connected
  - Unified endpoint responds
  
- [ ] **Test results:**
  - All 6 curl tests passed
  - Or all-in-one script output

- [ ] **Share:**
  - Reply with "Stage 1 complete" or share verification results
  - I'll mark it done and generate Stage 2 contract

---

## ⚠️ If Something Goes Wrong

### Issue: Gateway creation fails
- Check Cloudflare account permissions
- Verify API token has "AI Gateway" scope
- See troubleshooting in `PHASE4_STAGE1_SETUP_GUIDE.md`

### Issue: Provider key storage fails
- Check BYOK section in setup guide
- Verify provider API key format (some need prefix)
- Try API setup option instead of dashboard

### Issue: Endpoint returns 401/403
- Verify `cf-aig-authorization` header (if required)
- Check token hasn't expired
- Confirm provider keys stored correctly

### Issue: Need to start over
- Delete gateway from Cloudflare dashboard
- No code changes affected
- Everything rolls back automatically

**Not in checklist?** → See full troubleshooting in `PHASE4_STAGE1_SETUP_GUIDE.md`

---

## 🎉 Next After Stage 1 Complete

1. ✅ You confirm Stage 1 done
2. 🤖 I generate Stage 2 contract (AI Client Adapter)
3. 📝 Stage 2 planning (you approve)
4. 💻 Stage 2 implementation (I code gateway-client.ts)
5. 🧪 Testing, migration, analytics (Stages 3-6)

---

## Timeline

| Action | Time | Who |
|--------|------|-----|
| Pre-setup | 5 min | You |
| Setup (Dashboard) | 25 min | You |
| Validation | 10 min | You |
| Local config | 5 min | You |
| **Total** | **45 min** | **You** |
| Stage 2 planning | 1 day | Me (after you confirm) |
| Stage 2 implementation | 2-3 days | Me |

---

## Questions?

📖 **Reference:** `docs/PHASE4_STAGE1_SETUP_GUIDE.md`  
🔐 **Security:** `docs/PHASE4_KEY_ROTATION.md`  
📊 **Overview:** `docs/PHASE4_RESEARCH.md`  
✅ **Approval:** `docs/PHASE4_STAGE1_CONTRACT.md`  

All answers are in these documents. 🚀

