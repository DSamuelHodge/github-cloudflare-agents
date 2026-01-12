# Phase 1.5.3: RAG Fine-Tuning

## Overview

Configurable RAG (Retrieval-Augmented Generation) system with quality metrics and performance tuning capabilities.

## Features

### 1. Configurable Chunking
**Location:** `src/types/rag-config.ts`

Control how documentation is split into chunks:

```typescript
interface ChunkingConfig {
  maxTokens: number;           // Chunk size (default: 800)
  overlapTokens: number;        // Overlap between chunks (default: 100)
  preserveParagraphs: boolean;  // Keep paragraphs intact (default: true)
}
```

**Impact on Quality:**
- **Smaller chunks (400-600 tokens):** More precise retrieval, higher embedding costs
- **Larger chunks (1000-1200 tokens):** More context, lower precision
- **Higher overlap (150-200 tokens):** Better context continuity, more storage

### 2. Relevance Score Filtering
**Location:** `src/platform/documentation/search.ts`

Filter low-quality matches:

```typescript
interface SearchConfig {
  minRelevanceScore: number;    // Threshold 0-1 (default: 0.7)
  maxResults: number;           // Max results (default: 3)
  includeContext: boolean;      // Add surrounding snippets (default: false)
  priorityFileTypes?: string[]; // Prefer certain file types
}
```

**Relevance Score Scale:**
- **0.9-1.0:** Highly relevant (exact semantic match)
- **0.8-0.9:** Very relevant (strong semantic similarity)
- **0.7-0.8:** Relevant (good match for most queries)
- **0.6-0.7:** Moderately relevant (consider lowering threshold)
- **<0.6:** Low relevance (usually not useful)

### 3. Quality Metrics Tracking
**Location:** `src/platform/monitoring/RAGMetrics.ts`

Monitor retrieval performance:

```typescript
interface RAGQualityMetrics {
  resultsRetrieved: number;        // Total candidates
  resultsAfterFiltering: number;   // After relevance threshold
  averageRelevanceScore: number;   // Mean score
  maxRelevanceScore: number;       // Best match
  minRelevanceScore: number;       // Worst match returned
  retrievalTimeMs: number;         // Latency
  totalEmbeddingsSearched: number; // Search space size
  hasResults: boolean;             // Success indicator
}
```

## Configuration Presets

### PRECISION (High Quality, Fewer Results)
Best for: Critical documentation, API references

```typescript
{
  chunking: {
    maxTokens: 600,
    overlapTokens: 100,
    preserveParagraphs: true
  },
  search: {
    minRelevanceScore: 0.8,
    maxResults: 2,
    priorityFileTypes: ['markdown']
  }
}
```

**Expected Outcomes:**
- 1-2 highly relevant results per query
- Lower recall but higher precision
- Best for well-documented repositories

### RECALL (Comprehensive, More Results)
Best for: Complex issues, troubleshooting

```typescript
{
  chunking: {
    maxTokens: 1000,
    overlapTokens: 150,
    preserveParagraphs: true
  },
  search: {
    minRelevanceScore: 0.6,
    maxResults: 5,
    includeContext: true
  }
}
```

**Expected Outcomes:**
- 3-5 results per query (some may be tangential)
- Higher recall, lower precision
- Better for exploratory queries

### BALANCED (Default)
Best for: General use cases

```typescript
{
  chunking: {
    maxTokens: 800,
    overlapTokens: 100,
    preserveParagraphs: true
  },
  search: {
    minRelevanceScore: 0.7,
    maxResults: 3,
    priorityFileTypes: ['markdown', 'text']
  }
}
```

**Expected Outcomes:**
- 2-3 relevant results per query
- Good trade-off between precision and recall
- Recommended starting point

### FAST (Speed-Optimized)
Best for: Large repositories, rate-limited scenarios

```typescript
{
  chunking: {
    maxTokens: 1200,
    overlapTokens: 50,
    preserveParagraphs: false
  },
  search: {
    minRelevanceScore: 0.75,
    maxResults: 2
  }
}
```

**Expected Outcomes:**
- 50% fewer embeddings to search
- 30-40% faster retrieval
- Slightly lower quality

## Configuration Methods

### Method 1: Environment Variables (Recommended)
Set defaults in wrangler.toml:

```toml
[vars]
RAG_PRESET = "BALANCED"  # PRECISION, RECALL, BALANCED, FAST
```

### Method 2: Agent Configuration
Override in agent config:

```typescript
const agentConfig: IssueResponderConfig = {
  // ... other config
  ragChunkingConfig: {
    maxTokens: 600,
    overlapTokens: 100,
    preserveParagraphs: true,
  },
  ragSearchConfig: {
    minRelevanceScore: 0.8,
    maxResults: 2,
    includeContext: false,
  },
};
```

### Method 3: Per-Request Configuration
Pass config during indexing:

```bash
curl -X POST https://your-worker.workers.dev/index-docs \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-org",
    "repo": "your-repo",
    "chunkingConfig": {
      "maxTokens": 600,
      "overlapTokens": 100
    }
  }'
```

## Quality Metrics Endpoint

### GET `/metrics`

Returns comprehensive RAG performance data.

**Example Response:**
```json
{
  "timestamp": "2026-01-12T12:00:00.000Z",
  "cost": { /* ... cost data ... */ },
  "rag": {
    "totalQueries": 25,
    "averageRelevance": 0.78,
    "averageRetrievalTime": 145,
    "queriesWithResults": 23,
    "queriesWithoutResults": 2,
    "averageResultsPerQuery": 2.8,
    "recentQueries": [
      {
        "queryId": "owner/repo/1736683200000",
        "timestamp": "2026-01-12T11:59:45.000Z",
        "resultsRetrieved": 10,
        "resultsAfterFiltering": 3,
        "averageRelevanceScore": 0.82,
        "maxRelevanceScore": 0.91,
        "minRelevanceScore": 0.73,
        "retrievalTimeMs": 138,
        "totalEmbeddingsSearched": 42,
        "hasResults": true
      }
    ],
    "failedQueries": 2,
    "lowQualityQueries": 3
  }
}
```

## Performance Tuning Guide

### Problem: No Results Returned

**Symptoms:**
- `queriesWithoutResults` > 20%
- `hasResults: false` frequently

**Solutions:**
1. Lower `minRelevanceScore` to 0.6
2. Increase `maxResults` to 5
3. Re-index with smaller `maxTokens` (600)
4. Check if documentation exists for query topics

### Problem: Low Relevance Scores

**Symptoms:**
- `averageRelevanceScore` < 0.7
- Many results in `lowQualityQueries`

**Solutions:**
1. Increase `minRelevanceScore` to 0.75-0.8
2. Use PRECISION preset
3. Review documentation quality
4. Ensure embedding model is up to date

### Problem: Slow Retrieval

**Symptoms:**
- `averageRetrievalTime` > 300ms
- Timeouts on large repos

**Solutions:**
1. Use FAST preset
2. Increase `maxTokens` to 1000-1200
3. Reduce `maxResults` to 2
4. Consider caching embeddings
5. Limit documentation files indexed

### Problem: High Costs

**Symptoms:**
- Embedding costs > $0.01 per indexing job
- Many chunks created

**Solutions:**
1. Increase `maxTokens` to 1000+
2. Decrease `overlapTokens` to 50
3. Index only critical documentation paths
4. Use selective indexing (specific files only)

## Metrics Interpretation

### Good Performance Indicators
- ✅ `averageRelevanceScore` > 0.75
- ✅ `queriesWithResults` / `totalQueries` > 0.85
- ✅ `averageRetrievalTime` < 200ms
- ✅ `averageResultsPerQuery` between 2-4
- ✅ `failedQueries` < 10%

### Poor Performance Indicators
- ❌ `averageRelevanceScore` < 0.65
- ❌ `queriesWithoutResults` > 20%
- ❌ `averageRetrievalTime` > 400ms
- ❌ `lowQualityQueries` > 30%

## Integration Example

### Issue Responder with Custom RAG Config

```typescript
import { IssueResponderAgent } from './agents/issue-responder/agent';
import { RAG_PRESETS } from './types/rag-config';

// Use PRECISION preset for high-quality responses
const agent = new IssueResponderAgent({
  targetLabels: ['help', 'bug'],
  enableRAG: true,
  ragChunkingConfig: RAG_PRESETS.PRECISION.chunking,
  ragSearchConfig: RAG_PRESETS.PRECISION.search,
});
```

### Documentation Indexing with Custom Chunking

```typescript
const indexer = new DocumentationIndexer(
  repositoryService,
  r2Bucket,
  geminiApiKey,
  kvNamespace
);

await indexer.indexDocumentation({
  owner: 'your-org',
  repo: 'your-repo',
  chunkingConfig: {
    maxTokens: 600,
    overlapTokens: 100,
    preserveParagraphs: true,
  },
});
```

## Monitoring Best Practices

### Daily Checks
```bash
# Get RAG performance summary
curl https://your-worker.workers.dev/metrics | jq '.rag'

# Check for failed queries
curl https://your-worker.workers.dev/metrics | jq '.rag.failedQueries'
```

### Weekly Analysis
1. Review `averageRelevanceScore` trend
2. Analyze `lowQualityQueries` for patterns
3. Adjust `minRelevanceScore` based on feedback
4. Optimize chunk size if retrieval time is high

### Monthly Optimization
1. Compare presets (PRECISION vs RECALL)
2. A/B test different `minRelevanceScore` values
3. Measure impact on issue resolution time
4. Update documentation based on failed queries

## Troubleshooting

### TypeError: searchConfig is undefined

**Cause:** SearchConfig not passed to DocumentSearchService

**Solution:**
```typescript
const contextService = new ContextService(
  repositoryService,
  agentConfig,
  geminiApiKey,
  r2Bucket,
  kvNamespace,
  agentConfig.ragSearchConfig  // ✅ Pass search config
);
```

### Relevance scores always 1.0

**Cause:** Embedding dimensions mismatch

**Solution:** Re-index documentation with current embedding model

### No metrics appearing

**Cause:** Metrics tracking disabled

**Solution:** Ensure `enableMetrics: true` in RAG config

## Future Enhancements (Phase 2)

- [ ] **Automatic Threshold Tuning:** Adjust `minRelevanceScore` based on feedback
- [ ] **Hybrid Search:** Combine keyword and semantic search
- [ ] **Query Expansion:** Enhance queries with synonyms
- [ ] **Result Re-ranking:** Post-process results by file type, recency
- [ ] **Context Caching:** Cache frequently accessed chunks
- [ ] **Multi-Model Embeddings:** Support alternative embedding models

---

**Phase 1.5.3 Complete** ✅
