# Phase 1.5.2: Token Usage Monitoring

## Overview

Comprehensive cost tracking system for all AI operations, including:
- Embedding generation
- Issue response generation  
- Documentation retrieval

## Cost Tracking Architecture

### CostTracker Service
**Location:** `src/platform/monitoring/CostTracker.ts`

**Features:**
- Tracks token usage per operation
- Calculates costs in USD using Gemini pricing
- Aggregates costs by operation type
- Provides summary statistics

### Pricing (January 2026)

**Gemini 2.0 Flash (Chat Completions):**
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

**Text Embedding 004:**
- Input: $0.00001 per 1K tokens
- Output: N/A (no output tokens)

## Integration Points

### 1. Embedding Generation
**File:** `src/platform/documentation/embeddings.ts`

Tracks every embedding generation:
```typescript
costTracker.trackOperation('embedding_generation', model, {
  inputTokens: tokenCount,
  outputTokens: 0,
  totalTokens: tokenCount,
});
```

### 2. Issue Response
**File:** `src/agents/issue-responder/agent.ts`

Tracks AI response generation:
```typescript
costTracker.trackOperation('issue_response', model, {
  inputTokens: Math.floor(aiResponse.tokensUsed * 0.8),
  outputTokens: Math.floor(aiResponse.tokensUsed * 0.2),
  totalTokens: aiResponse.tokensUsed,
});
```

## Metrics Endpoint

### GET `/metrics`

Returns comprehensive cost tracking data.

**Example Request:**
```bash
curl https://github-ai-agent.your-account.workers.dev/metrics
```

**Example Response:**
```json
{
  "timestamp": "2026-01-12T10:30:00.000Z",
  "cost": {
    "totalOperations": 15,
    "totalInputTokens": 125000,
    "totalOutputTokens": 8000,
    "totalCostUSD": 0.0104,
    "breakdownByOperation": {
      "embedding_generation": {
        "count": 10,
        "tokens": 100000,
        "costUSD": 0.001
      },
      "issue_response": {
        "count": 5,
        "tokens": 33000,
        "costUSD": 0.0094
      }
    }
  },
  "recentOperations": [
    {
      "operation": "issue_response",
      "model": "gemini-2.0-flash",
      "inputTokens": 5000,
      "outputTokens": 1200,
      "inputCostUSD": 0.000375,
      "outputCostUSD": 0.00036,
      "totalCostUSD": 0.000735,
      "timestamp": "2026-01-12T10:29:45.123Z"
    }
  ]
}
```

## Cost Estimates

### Typical Usage Patterns

**Small Repository (5-10 doc files):**
- Initial indexing: ~50K tokens = **$0.0005**
- Per issue response (with RAG): ~6K tokens = **$0.0012**
- Monthly (100 issues): **~$0.12**

**Medium Repository (20-50 doc files):**
- Initial indexing: ~200K tokens = **$0.002**
- Per issue response (with RAG): ~8K tokens = **$0.0015**
- Monthly (500 issues): **~$0.75**

**Large Repository (100+ doc files):**
- Initial indexing: ~1M tokens = **$0.01**
- Per issue response (with RAG): ~10K tokens = **$0.0018**
- Monthly (1000 issues): **~$1.80**

## Monitoring Best Practices

### 1. Regular Check-ins
```bash
# Check costs daily during first week
curl https://your-worker.workers.dev/metrics | jq '.cost.totalCostUSD'
```

### 2. Set Budget Alerts
- Monitor `/metrics` endpoint
- Set thresholds based on expected usage
- Future: Implement automatic alerts (Phase 2)

### 3. Cost Optimization Tips
- **Index selectively:** Only index critical documentation
- **Tune context:** Reduce `maxDocChunks` if responses are too long
- **Limit file context:** Set `maxFilesPerIssue` conservatively
- **Batch embeddings:** Indexing generates embeddings in batches of 10

## Logging

Cost information is automatically logged:

```
[INFO] AI operation cost tracked {
  operation: "issue_response",
  model: "gemini-2.0-flash",
  tokens: 6200,
  costUSD: "0.001260"
}
```

## Future Enhancements (Phase 2)

- [ ] **Cost Caps:** Automatic circuit breakers at budget thresholds
- [ ] **Alerting:** Email/Slack notifications for unusual spending
- [ ] **Historical Analytics:** Daily/weekly cost trends
- [ ] **Per-User Tracking:** Cost attribution by GitHub user
- [ ] **Budget Dashboard:** Real-time cost visualization

## Troubleshooting

### Metrics showing $0.00
- Check if operations are being executed
- Verify CostTracker is initialized
- Check logs for "AI operation cost tracked"

### Token counts seem high
- Large file context can inflate token usage
- Documentation chunks are 800 tokens each
- Conversation history adds tokens linearly

### Cost estimates don't match reality
- Token estimation uses 4 characters = 1 token heuristic
- Actual tokenization may differ
- Gemini API doesn't expose exact token counts for embeddings

## API Reference

### CostTracker Class

```typescript
class CostTracker {
  // Track an operation
  trackOperation(
    operation: string,
    model: string,
    usage: TokenUsage
  ): CostBreakdown
  
  // Get cost summary
  getSummary(): CostSummary
  
  // Get recent operations
  getRecentOperations(limit: number = 10): CostBreakdown[]
  
  // Reset tracking
  reset(): void
}
```

### Global Instance

```typescript
import { getGlobalCostTracker } from './platform/monitoring/CostTracker';

const tracker = getGlobalCostTracker();
tracker.trackOperation('custom_operation', 'gemini-2.0-flash', {
  inputTokens: 1000,
  outputTokens: 200,
  totalTokens: 1200,
});
```

---

**Phase 1.5.2 Complete** ✅
