# Phase 1.5 Validation Test Cases

## Test Environment
- **Worker URL:** `https://github-ai-agent.your-account.workers.dev`
- **Test Repository:** `DSamuelHodge/github-cloudflare-agents`
- **Prerequisites:** Phase 1.5 deployed, documentation indexed

---

## Test 1: Health Check

### Objective
Verify worker is running and agents are registered.

### Steps
```bash
curl https://github-ai-agent.your-account.workers.dev/health
```

### Expected Result
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

### Validation
- ✅ Status is "ok"
- ✅ At least 1 agent registered
- ✅ Response time < 1 second

---

## Test 2: Repository Awareness (File Context)

### Objective
Verify agent can fetch and include file contents in responses.

### Steps
1. Create a new GitHub issue in your test repository
2. Title: "Need help with README.md structure"
3. Body:
   ```
   I'm having trouble understanding the project structure. Can you explain what's in `README.md` and `docs/ARCHITECTURE.md`?
   ```
4. Add label: `help`

### Expected Result
Within 5-10 seconds, the bot should comment with:
- Analysis referencing content from README.md
- Analysis referencing content from docs/ARCHITECTURE.md
- Properly formatted code blocks
- File paths clearly labeled

### Validation
- ✅ Bot comment appears within 10 seconds
- ✅ File contents are included in analysis
- ✅ Files are correctly identified by path
- ✅ Response is relevant to file contents

### Debug
If bot doesn't respond:
- Check GitHub webhook delivery (200 OK)
- Check Worker logs: `wrangler tail`
- Verify issue has `help` label
- Check `enableFileContext` is `true` in config

---

## Test 3: Documentation RAG (Retrieval)

### Objective
Verify agent can retrieve relevant documentation chunks.

### Steps
1. Create a new GitHub issue
2. Title: "How do I add a new agent?"
3. Body:
   ```
   I want to create a custom agent. What's the process?
   ```
4. Add label: `help`

### Expected Result
Bot should comment with:
- Reference to agent development documentation
- Code examples from ARCHITECTURE.md
- Mention of BaseAgent, AgentRegistry, or agent lifecycle
- Source citations showing file paths

### Validation
- ✅ Bot mentions "agent" development process
- ✅ References documentation sources (e.g., "docs/ARCHITECTURE.md")
- ✅ Provides actionable steps
- ✅ Relevance score > 0.5 (check logs if accessible)

### Debug
If documentation not retrieved:
- Verify indexing completed: Check `/index-docs` response
- Verify DOC_EMBEDDINGS KV contains data: `wrangler kv:key list --binding=DOC_EMBEDDINGS --preview`
- Check embedding generation didn't fail (logs)

---

## Test 4: Threaded Conversations (Memory)

### Objective
Verify agent remembers previous conversation context.

### Steps
1. Create a new GitHub issue with label `help`
2. **First Comment (User):**
   ```
   I'm getting an error: "TypeError: Cannot read property 'execute'"
   ```
3. Wait for bot response
4. **Second Comment (User):**
   ```
   I tried your suggestion but now I'm getting a different error. What should I do next?
   ```
5. Wait for bot response

### Expected Result
- First bot response provides troubleshooting steps
- Second bot response references the first suggestion
- Second response shows awareness of conversation history (e.g., "Based on what you tried...")

### Validation
- ✅ Bot responds to both comments
- ✅ Second response references first exchange
- ✅ Conversation context is preserved
- ✅ No repetition of exact same advice

### Debug
If conversation not remembered:
- Check KV storage: `wrangler kv:key get --binding=DOC_EMBEDDINGS "conversation:DSamuelHodge/github-cloudflare-agents/{issueNumber}"`
- Verify DOC_EMBEDDINGS binding is active
- Check logs for ConversationService errors

---

## Test 5: Combined Context (Files + Docs + Conversation)

### Objective
Verify all three context sources work together.

### Steps
1. Create issue with all three triggers:
   - Reference a file: "Check `src/index.new.ts`"
   - Ask about documented topic: "How does the middleware pipeline work?"
   - Follow up after bot's first response

### Expected Result
Bot response includes:
- File content from src/index.new.ts
- Documentation about middleware pipeline
- Awareness of previous conversation (if applicable)

### Validation
- ✅ All three context types present in response
- ✅ Response is coherent and well-integrated
- ✅ No duplicate information
- ✅ Token count reasonable (< 10,000 tokens)

---

## Test 6: Documentation Indexing

### Objective
Verify documentation can be (re)indexed successfully.

### Steps
```bash
curl -X POST "https://github-ai-agent.your-account.workers.dev/index-docs?owner=DSamuelHodge&repo=github-cloudflare-agents"
```

### Expected Result
```json
{
  "success": true,
  "job": {
    "status": "completed",
    "stats": {
      "filesProcessed": 5,
      "chunksCreated": 20,
      "totalTokens": 15000,
      "errors": 0
    }
  }
}
```

### Validation
- ✅ `success: true`
- ✅ `status: "completed"`
- ✅ `filesProcessed > 0`
- ✅ `errors: 0`
- ✅ Completes within 60 seconds

### Debug
If indexing fails:
- Check R2 bucket exists and is accessible
- Verify GEMINI_API_KEY is valid
- Check repo has documentation files
- Review Worker logs for specific errors

---

## Test 7: Error Handling & Graceful Degradation

### Objective
Verify system handles missing context gracefully.

### Steps
1. Create issue without file references or documentation keywords
2. Title: "Random question about API"
3. Body: "What's your favorite color?"
4. Add label: `help`

### Expected Result
- Bot responds without errors
- Response is helpful even without external context
- No "failed to fetch" errors visible to user

### Validation
- ✅ Bot responds successfully
- ✅ No error messages in response
- ✅ Response is professional and helpful
- ✅ Logs show graceful handling of missing context

---

## Test 8: Performance & Token Usage

### Objective
Verify system operates within acceptable cost/performance bounds.

### Steps
1. Create 3-5 issues with various context complexity
2. Monitor response times
3. Check Worker analytics for invocation duration

### Expected Result
- Average response time < 5 seconds
- Token usage per issue < 10,000 tokens
- No timeouts or 500 errors

### Validation
- ✅ All issues receive responses
- ✅ Response times acceptable
- ✅ No Cloudflare Worker timeout errors
- ✅ Token costs are reasonable

---

## Test Summary Checklist

After completing all tests:

- [ ] Health check passes
- [ ] Repository awareness works (file fetching)
- [ ] RAG retrieval returns relevant docs
- [ ] Conversation memory persists
- [ ] Combined context integrates well
- [ ] Documentation indexing completes
- [ ] Error handling is graceful
- [ ] Performance within acceptable bounds

---

## Reporting Issues

If any test fails:
1. Check Worker logs: `wrangler tail`
2. Verify bindings in `wrangler.toml`
3. Check GitHub webhook deliveries
4. Review configuration in agent code
5. File issue with test case number and error details

---

## Next Steps

Once all tests pass:
- **Phase 1.5.2:** Add cost monitoring
- **Phase 1.5.3:** Fine-tune RAG parameters
- **Phase 1.5.4:** Secure `/index-docs` endpoint
- **Phase 1.5.5:** Implement hybrid search
