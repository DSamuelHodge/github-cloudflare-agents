# R2 Storage Configuration Guide

## Overview

Cloudflare R2 provides S3-compatible object storage **without egress fees** and includes a generous **free tier** that does NOT require the Workers Paid Plan.

## Key Facts About R2 Pricing

### ✅ What's FREE
- **10 GB storage** per month
- **1 million Class A operations** per month (writes, lists, uploads)
- **10 million Class B operations** per month (reads, downloads)
- **Unlimited egress bandwidth** (no data transfer fees to Internet)
- **Workers integration** (no additional cost for authentication/routing)

### 💰 What's Paid (Beyond Free Tier)
- **Storage**: $0.015/GB-month (after 10 GB)
- **Class A Operations**: $4.50/million requests (after 1M)
- **Class B Operations**: $0.36/million requests (after 10M)

## R2 vs Workers Paid Plan

| Feature | Free Workers | Workers Paid ($5/mo) | R2 Storage |
|---------|--------------|----------------------|------------|
| R2 Storage (10 GB) | ✅ FREE | ✅ FREE | ✅ Included |
| R2 Operations (1M/10M) | ✅ FREE | ✅ FREE | ✅ Included |
| KV Namespace | ❌ Limited | ✅ Unlimited | N/A |
| CPU Time | 10ms/request | 50ms/request | N/A |
| Workers Requests | 100K/day | Unlimited | N/A |

**Bottom Line:** You can use R2 storage for this project **WITHOUT** the Workers Paid Plan. The paid plan is only needed for KV namespace (documentation embeddings).

## Setup Instructions

### Step 1: Enable R2 in Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the left sidebar
3. Click **Get Started** (no payment required for free tier)
4. Accept terms and conditions

### Step 2: Create R2 Bucket

```bash
# Create bucket for documentation chunks and test artifacts
wrangler r2 bucket create github-ai-agent-artifacts

# Verify bucket exists
wrangler r2 bucket list
```

**Expected Output:**
```json
{
  "name": "github-ai-agent-artifacts",
  "creation_date": "2026-01-12T12:00:00.000Z"
}
```

### Step 3: Verify wrangler.toml Configuration

The R2 bucket binding should already be configured in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "TEST_ARTIFACTS"
bucket_name = "github-ai-agent-artifacts"
```

✅ **No changes needed** - this configuration works with the free tier.

### Step 4: Test R2 Access Locally

```bash
# Start local development server
npm run dev

# In another terminal, test artifact storage
curl -X POST http://localhost:8787/test-r2
```

## Usage Estimates for This Project

### Phase 1.5: Documentation RAG

**Typical Repository (50 doc files, 500KB total):**
- Storage: ~5 MB (documentation chunks)
- Class A Operations: ~500 writes (chunking + indexing)
- Class B Operations: ~1,000 reads/month (retrieval queries)

**Free Tier Coverage:** ✅ 100% covered (5 MB < 10 GB, 500 writes < 1M, 1K reads < 10M)

### Phase 2: Test Artifacts

**Typical Usage (100 test runs/month):**
- Storage: ~2 GB (test logs, coverage reports)
- Class A Operations: ~5,000 writes (artifact uploads)
- Class B Operations: ~10,000 reads (artifact downloads)

**Free Tier Coverage:** ✅ 100% covered (2 GB < 10 GB, 5K writes < 1M, 10K reads < 10M)

### Combined Monthly Cost Estimate

| Component | Usage | Free Tier | Overage | Cost |
|-----------|-------|-----------|---------|------|
| Storage | 7 GB | 10 GB | 0 GB | **$0.00** |
| Class A Ops | 5,500 | 1M | 0 | **$0.00** |
| Class B Ops | 11,000 | 10M | 0 | **$0.00** |
| **TOTAL** | | | | **$0.00/month** |

## What Actually Requires Workers Paid Plan?

Only **KV Namespace** for documentation embeddings requires the $5/month plan:

```bash
# This requires Workers Paid Plan
wrangler kv:namespace create DOC_EMBEDDINGS
```

**Why KV Needs Paid Plan:**
- Free Workers: Limited to 1 KV namespace (used for other purposes)
- Paid Workers: Unlimited KV namespaces
- Embeddings storage requires dedicated KV namespace

**Without Paid Plan:**
- ✅ R2 storage works (documentation chunks)
- ✅ Basic file context works
- ❌ Vector embeddings won't persist (semantic search disabled)
- ✅ All Phase 2 features work (test artifacts in R2)

## Troubleshooting

### Error: "R2 bucket not found"

**Cause:** Bucket not created or wrong name

**Solution:**
```bash
# List all buckets
wrangler r2 bucket list

# If missing, create it
wrangler r2 bucket create github-ai-agent-artifacts
```

### Error: "R2 operations limit exceeded"

**Cause:** Exceeded free tier limits (rare for this project)

**Solution:**
1. Check usage in Dashboard: R2 → Usage
2. Optimize chunking (increase chunk size to reduce operations)
3. Add caching layer to reduce repeated reads

### Error: "KV namespace not found"

**Cause:** KV namespace requires Workers Paid Plan

**Options:**
1. **Disable embeddings** (free tier):
   ```typescript
   enableRAG: false // Disable in agent config
   ```
2. **Upgrade to paid plan** ($5/month):
   ```bash
   # Enable paid plan in Cloudflare Dashboard
   wrangler kv:namespace create DOC_EMBEDDINGS
   ```

## Migration Path

### Current State (Free Tier)
- ✅ R2 storage for test artifacts
- ✅ File context injection
- ❌ RAG/semantic search (needs KV)

### With Workers Paid Plan ($5/month)
- ✅ All above features
- ✅ RAG with vector embeddings
- ✅ Conversation history in KV
- ✅ Unlimited workers requests

## Cost Optimization Tips

### Reduce Storage Costs
```typescript
// Increase chunk size to reduce total chunks
chunkingConfig: {
  maxTokens: 1200,  // Larger chunks = fewer objects
  overlapTokens: 50 // Less overlap = less duplication
}
```

### Reduce Class A Operations
```typescript
// Batch indexing instead of incremental
await indexer.indexDocumentation({
  owner, repo,
  maxFiles: 50  // Index fewer files
});
```

### Reduce Class B Operations
```typescript
// Cache search results
const cache = new Map();
if (cache.has(query)) {
  return cache.get(query);
}
```

## Monitoring R2 Usage

### Dashboard Monitoring
1. Go to Cloudflare Dashboard → R2
2. Click on your bucket
3. View **Metrics** tab for:
   - Storage usage (GB)
   - Request counts (Class A/B)
   - Egress bandwidth

### CLI Monitoring
```bash
# Get bucket info
wrangler r2 bucket info github-ai-agent-artifacts

# List objects (counts towards Class A operations)
wrangler r2 object list github-ai-agent-artifacts
```

### Application Monitoring
```bash
# Check metrics endpoint
curl https://your-worker.workers.dev/metrics | jq '.storage'
```

## References

- [R2 Pricing Documentation](https://developers.cloudflare.com/r2/pricing/)
- [R2 Getting Started Guide](https://developers.cloudflare.com/r2/get-started/)
- [R2 Workers Integration](https://developers.cloudflare.com/r2/api/workers/)
- [R2 Pricing Calculator](https://r2-calculator.cloudflare.com/)

---

**Key Takeaway:** R2 storage is **FREE** for this project's typical usage. The Workers Paid Plan is only needed if you want to enable RAG/semantic search with vector embeddings stored in KV.
