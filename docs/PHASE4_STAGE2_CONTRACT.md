# Phase 4.1 Stage 2: AI Client Adapter - Execution Contract

**Stage:** 2 - AI Client Adapter Implementation  
**Protocol:** Meta-Prompt v2.0 SDLC  
**Date:** January 12, 2026  
**Status:** 📋 PLANNING

---

## OBJECTIVE

Implement a Cloudflare AI Gateway client adapter that:
1. Routes agent AI requests through the gateway infrastructure
2. Supports multiple providers (Gemini, HuggingFace, Anthropic)
3. Maintains backward compatibility with existing Phase 3 agents
4. Enables provider selection via configuration
5. Provides foundation for Stage 3 fallback logic

---

## IMMUTABLE ASSUMPTIONS (FROM STAGE 1)

These constraints MUST NOT be violated:

1. **Gateway Infrastructure Exists**
   - Gateway ID: `github-cloudflare-agent-gateway`
   - Account ID: `6c2dbbe47de58a74542ad9a5d9dd5b2b`
   - API Token: Valid until 2026-02-11

2. **Provider Keys Configured**
   - Gemini: Stored via BYOK
   - HuggingFace: Stored via BYOK
   - Anthropic: Stored via BYOK

3. **Existing Agent Interfaces**
   - `BaseAgent` interface unchanged
   - Agent execution pattern preserved
   - Context resolution unchanged

4. **Phase 3 Production Stability**
   - 191 tests must continue passing
   - No breaking changes to deployed agents
   - Rollback capability maintained

5. **Type Safety**
   - Zero `any` types (ESLint strict mode)
   - All interfaces explicit
   - No type safety regressions

---

## INPUTS

### From Stage 1
- ✅ Gateway infrastructure validated
- ✅ Provider keys stored (BYOK)
- ✅ Environment variables configured
- ✅ API token validated

### Existing Codebase
- `src/platform/ai/client.ts` - Current AI client (OpenRouter → Gemini)
- `src/agents/*/agent.ts` - All Phase 3 agents
- `src/types/openai.ts` - OpenAI-compatible types
- `src/types/env.ts` - Environment variable types

### Configuration
- `wrangler.toml` - Worker configuration
- `.dev.vars` - Local environment variables
- Phase 3 agent configs

---

## OUTPUTS

### Primary Deliverable
**File:** `src/platform/ai/gateway-client.ts`

**Responsibilities:**
1. Implement Cloudflare AI Gateway API client
2. Provider-specific endpoint routing (Gemini, HuggingFace, Anthropic)
3. Authentication via gateway (BYOK keys)
4. Request/response formatting per provider
5. Error handling and logging

**Interface Compatibility:**
- Must match existing `AIClient` interface from `client.ts`
- Accept OpenAI-compatible chat completion requests
- Return OpenAI-compatible responses
- Support streaming (foundation for Stage 4)

### Secondary Deliverables

**1. Environment Type Updates**
`src/types/env.ts`:
- Add `CLOUDFLARE_ACCOUNT_ID` (already in .dev.vars)
- Add `CLOUDFLARE_GATEWAY_ID` (already in .dev.vars)
- Add `CLOUDFLARE_API_TOKEN` (already in .dev.vars)
- Add `AI_PROVIDER` (new: "gemini" | "huggingface" | "anthropic")

**2. Agent Integration**
No changes to agents yet - they continue using existing client.
Stage 2 creates the adapter, Stage 3 switches agents to use it.

**3. Tests**
`tests/phase4.1-gateway-client.test.ts`:
- Gateway client initialization
- Provider routing (Gemini, HuggingFace, Anthropic)
- Request formatting per provider
- Response parsing per provider
- Error handling
- Backward compatibility

**4. Documentation**
`docs/PHASE4_STAGE2_IMPLEMENTATION.md`:
- Gateway client architecture
- Provider endpoint mappings
- Usage examples
- Migration guide (for Stage 3)

---

## CONSTRAINTS

### Technical Constraints

1. **Provider Endpoints**
   - **Gemini:** `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/google-ai-studio/v1beta/models/gemini-2.0-flash-exp:generateContent?key=AI_KEY`
   - **HuggingFace:** `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openai/v1/chat/completions`
   - **Anthropic:** `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/anthropic/v1/messages`

2. **Authentication Patterns**
   - Gemini: Query parameter `?key=AI_KEY` (not sent, gateway handles)
   - HuggingFace: `Authorization: Bearer {key}` (not sent, gateway handles)
   - Anthropic: `x-api-key: {key}` (not sent, gateway handles)
   - Gateway auth: `cf-aig-authorization: Bearer {token}` (optional if keys stored via BYOK)

3. **Request Format Differences**
   - Gemini uses `contents` (array of parts)
   - HuggingFace uses `messages` (OpenAI-compatible)
   - Anthropic uses `messages` + `max_tokens` required

4. **Response Format Differences**
   - Gemini: `candidates[0].content.parts[0].text`
   - HuggingFace: `choices[0].message.content`
   - Anthropic: `content[0].text`

### Architectural Constraints

1. **Adapter Pattern**
   - Gateway client wraps provider-specific APIs
   - Exposes unified OpenAI-compatible interface
   - Internal routing based on `AI_PROVIDER` env var

2. **No Breaking Changes**
   - Existing `client.ts` unchanged (backward compatibility)
   - Agents continue working with old client
   - Gateway client coexists alongside old client

3. **Type Safety**
   - All provider request/response types defined
   - No `any` types (strict ESLint enforcement)
   - Runtime validation for external data

4. **Error Handling**
   - Provider-specific error messages
   - Gateway errors vs provider errors
   - Structured logging with context

### Integration Constraints

1. **Phase 3 Compatibility**
   - All 191 tests must pass
   - No agent code changes in Stage 2
   - Deployment pipeline unchanged

2. **Environment Variables**
   - New vars added to `Env` interface
   - Backward compatible (old client doesn't need them)
   - Validation on gateway client initialization

3. **Testing Requirements**
   - Unit tests for gateway client
   - Mock gateway responses
   - Test all 3 providers
   - Test error scenarios

---

## VALIDATION CRITERIA

Stage 2 is COMPLETE when ALL criteria are met:

### 1. Gateway Client Exists ✅
- [ ] File `src/platform/ai/gateway-client.ts` created
- [ ] Exports `GatewayAIClient` class
- [ ] Implements OpenAI-compatible interface
- [ ] No TypeScript errors
- [ ] No ESLint errors (zero `any` types)

### 2. Provider Routing Works ✅
- [ ] Gemini endpoint routing implemented
- [ ] HuggingFace endpoint routing implemented
- [ ] Anthropic endpoint routing implemented
- [ ] Provider selection via `AI_PROVIDER` env var
- [ ] Request formatting per provider

### 3. Response Parsing Correct ✅
- [ ] Gemini responses parsed to OpenAI format
- [ ] HuggingFace responses parsed (already OpenAI format)
- [ ] Anthropic responses parsed to OpenAI format
- [ ] Streaming responses handled (placeholder for Stage 4)

### 4. Error Handling Complete ✅
- [ ] Gateway errors caught and logged
- [ ] Provider-specific errors handled
- [ ] Network errors handled with retries
- [ ] Structured error messages

### 5. Tests Passing ✅
- [ ] `tests/phase4.1-gateway-client.test.ts` created
- [ ] All gateway client tests passing
- [ ] Existing 191 tests still passing (no regressions)
- [ ] Test coverage: initialization, routing, parsing, errors

### 6. Environment Types Updated ✅
- [ ] `src/types/env.ts` updated with new vars
- [ ] `AI_PROVIDER` type defined
- [ ] Gateway client validates env vars on init
- [ ] TypeScript compilation successful

### 7. Documentation Complete ✅
- [ ] `PHASE4_STAGE2_IMPLEMENTATION.md` created
- [ ] Gateway client architecture documented
- [ ] Provider endpoint mappings documented
- [ ] Usage examples included
- [ ] Migration guide for Stage 3 prepared

### 8. Backward Compatibility Verified ✅
- [ ] Existing `client.ts` unchanged
- [ ] Phase 3 agents untouched
- [ ] All 191 tests passing
- [ ] No breaking changes to deployed code

---

## IMPLEMENTATION PLAN

### Step 1: Environment Types (10 min)
1. Update `src/types/env.ts` with gateway vars
2. Add `AI_PROVIDER` type
3. TypeScript compilation check

### Step 2: Gateway Client Core (1-2 hours)
1. Create `src/platform/ai/gateway-client.ts`
2. Implement `GatewayAIClient` class
3. Constructor with env validation
4. Base request method with gateway URL construction

### Step 3: Provider Routing (2-3 hours)
1. Implement Gemini endpoint routing
2. Implement HuggingFace endpoint routing
3. Implement Anthropic endpoint routing
4. Request format transformation per provider

### Step 4: Response Parsing (1-2 hours)
1. Parse Gemini responses to OpenAI format
2. Parse HuggingFace responses (pass-through)
3. Parse Anthropic responses to OpenAI format
4. Unified response interface

### Step 5: Error Handling (1 hour)
1. Gateway-level errors
2. Provider-specific errors
3. Network retry logic
4. Structured logging

### Step 6: Testing (2-3 hours)
1. Create test file `tests/phase4.1-gateway-client.test.ts`
2. Test initialization and env validation
3. Test provider routing (all 3)
4. Test response parsing (all 3)
5. Test error scenarios
6. Verify 191 existing tests still pass

### Step 7: Documentation (1 hour)
1. Create `PHASE4_STAGE2_IMPLEMENTATION.md`
2. Document architecture and design decisions
3. Provider endpoint reference
4. Usage examples
5. Migration guide for Stage 3

**Total Estimated Time:** 8-12 hours over 2-3 days

---

## RISK ASSESSMENT

| Risk | Level | Mitigation |
|------|-------|-----------|
| Breaking Phase 3 | LOW | No agent changes, backward compatible |
| Provider API changes | MEDIUM | Use gateway abstraction, easy to update |
| Response format mismatches | MEDIUM | Comprehensive tests per provider |
| Type safety violations | LOW | Strict ESLint, TypeScript checks |
| Performance degradation | LOW | Gateway adds ~50ms (acceptable) |

**Overall Risk:** 🟢 **LOW**

---

## ROLLBACK PROCEDURE

If Stage 2 causes issues:

1. **Immediate (0 minutes):** Gateway client not used by agents yet, no impact
2. **If deployed accidentally (5 minutes):** 
   - Revert commit
   - Redeploy with `npm run deploy`
   - Gateway infrastructure remains (Stage 1 still valid)

**Key Safety:** Stage 2 creates the adapter but doesn't integrate it. Agents continue using old client until Stage 3.

---

## SUCCESS DEFINITION

Stage 2 is successful when:

1. ✅ `gateway-client.ts` implemented and tested
2. ✅ All 3 providers (Gemini, HuggingFace, Anthropic) routed correctly
3. ✅ Response parsing unified to OpenAI format
4. ✅ Error handling comprehensive
5. ✅ 191 existing tests passing (no regressions)
6. ✅ New gateway client tests passing
7. ✅ Documentation complete
8. ✅ Type check clean (0 errors)
9. ✅ Lint clean (0 errors, 0 `any` types)
10. ✅ Ready for Stage 3 integration

**Upon completion:** Stage 3 can integrate gateway client into agents with confidence.

---

## DEPENDENCIES

**Stage 1 (Complete):**
- ✅ Gateway infrastructure created
- ✅ Provider keys stored
- ✅ Environment variables configured

**Stage 2 (This Stage):**
- Create gateway client adapter
- Test with all providers
- Document implementation

**Stage 3 (Next):**
- Integrate gateway client into agents
- Implement fallback strategy
- Deploy to production

---

## APPROVAL

**Contract Status:** 📋 AWAITING APPROVAL

**Approval Required From:** User

**Approval Criteria:**
- [ ] Stage 2 objective clear
- [ ] Implementation plan acceptable
- [ ] Timeline reasonable (2-3 days)
- [ ] Risk level acceptable (LOW)
- [ ] Success criteria explicit

**Once approved, implementation begins immediately.**

---

**Contract Generated:** January 12, 2026  
**Protocol:** Meta-Prompt v2.0 SDLC Phase 3 (Execution Contract)  
**Ready for:** User approval and Stage 2 execution

