# Phase 1.5.4: Endpoint Authentication

## Overview

Secure administrative API endpoints with Bearer token authentication to prevent unauthorized access to sensitive operations like documentation indexing.

## Features

### 1. Bearer Token Authentication
**Location:** `src/middleware/api-auth.ts`

Validates `Authorization: Bearer <token>` headers against a secret token stored in Cloudflare secrets.

**Protected Endpoints:**
- `POST /index-docs` - Documentation indexing (expensive operation)

**Future Endpoints:**
- `POST /reindex` - Trigger re-indexing
- `DELETE /embeddings` - Clear embeddings cache
- `POST /agents/reload` - Hot-reload agent configuration

### 2. Endpoint-Specific Rate Limiting
**Location:** `src/middleware/api-auth.ts`

More aggressive rate limiting for administrative endpoints to prevent abuse.

**Default Limits:**
- `/index-docs`: 5 requests per hour per IP
- Includes `X-RateLimit-*` headers in responses

### 3. Security Headers
All authenticated responses include:
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining in window
- `X-RateLimit-Reset` - Unix timestamp when limit resets

## Setup Guide

### Step 1: Generate API Token

Create a strong random token:

```bash
# Linux/macOS
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Step 2: Store Token in Cloudflare Secrets

```bash
# Set the secret (will prompt for value)
wrangler secret put API_SECRET_TOKEN

# Paste your generated token when prompted
```

**Security Best Practices:**
- ✅ Use minimum 32-character random hex string
- ✅ Never commit token to version control
- ✅ Rotate token every 90 days
- ✅ Use different tokens for dev/staging/production
- ❌ Don't use predictable values (e.g., "secret123")
- ❌ Don't share token via insecure channels

### Step 3: Verify Token is Set

```bash
# List all secrets (values are hidden)
wrangler secret list

# Expected output:
# API_SECRET_TOKEN
# GEMINI_API_KEY
# GITHUB_TOKEN
# GITHUB_WEBHOOK_SECRET
```

## Usage Examples

### Authenticated Request (Success)

```bash
curl -X POST "https://your-worker.workers.dev/index-docs?owner=your-org&repo=your-repo" \
  -H "Authorization: Bearer a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2" \
  -H "Content-Type: application/json"
```

**Response (200 OK):**
```json
{
  "success": true,
  "job": {
    "id": "your-org/your-repo/1736683200000",
    "owner": "your-org",
    "repo": "your-repo",
    "status": "completed",
    "startedAt": "2026-01-12T12:00:00.000Z",
    "completedAt": "2026-01-12T12:00:45.000Z",
    "stats": {
      "filesProcessed": 7,
      "chunksCreated": 42,
      "totalTokens": 33600,
      "errors": 0
    }
  }
}
```

### Missing Authorization Header (401 Unauthorized)

```bash
curl -X POST "https://your-worker.workers.dev/index-docs?owner=your-org&repo=your-repo"
```

**Response:**
```json
{
  "error": "Missing or invalid Authorization header. Expected: Bearer <token>"
}
```

### Invalid Token (401 Unauthorized)

```bash
curl -X POST "https://your-worker.workers.dev/index-docs?owner=your-org&repo=your-repo" \
  -H "Authorization: Bearer wrong-token"
```

**Response:**
```json
{
  "error": "Invalid API token"
}
```

### Rate Limit Exceeded (429 Too Many Requests)

After 5 requests within 1 hour:

```bash
curl -X POST "https://your-worker.workers.dev/index-docs?owner=your-org&repo=your-repo" \
  -H "Authorization: Bearer <valid-token>"
```

**Response:**
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 2847
}
```

**Headers:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 2847
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1736686847
```

## API Reference

### POST /index-docs

**Authentication:** Required (Bearer token)

**Rate Limit:** 5 requests per hour per IP

**Query Parameters:**
- `owner` (required) - GitHub repository owner
- `repo` (required) - GitHub repository name
- `ref` (optional) - Branch or commit SHA (default: default branch)

**Request Headers:**
```
Authorization: Bearer <API_SECRET_TOKEN>
Content-Type: application/json
```

**Response (200 OK):**
```json
{
  "success": true,
  "job": {
    "id": "string",
    "owner": "string",
    "repo": "string",
    "status": "completed",
    "startedAt": "ISO 8601 timestamp",
    "completedAt": "ISO 8601 timestamp",
    "stats": {
      "filesProcessed": 0,
      "chunksCreated": 0,
      "totalTokens": 0,
      "errors": 0
    },
    "errors": []
  }
}
```

**Error Responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Missing required parameters | Missing `owner` or `repo` |
| 401 | Missing/Invalid Authorization header | No token or wrong token |
| 429 | Rate limit exceeded | Too many requests |
| 503 | R2 storage not configured | TEST_ARTIFACTS binding missing |
| 500 | Failed to index documentation | Indexing error |

## Security Considerations

### Token Storage
- **DO:** Store in Cloudflare Secrets (encrypted at rest)
- **DON'T:** Store in wrangler.toml `[vars]` section
- **DON'T:** Store in environment variables (visible in logs)
- **DON'T:** Commit to git

### Token Rotation

Rotate tokens regularly:

```bash
# Generate new token
NEW_TOKEN=$(openssl rand -hex 32)

# Update secret
echo $NEW_TOKEN | wrangler secret put API_SECRET_TOKEN

# Update all clients with new token
# Test new token
# Revoke old token access
```

### IP Allowlisting (Future Enhancement)

For added security, restrict by IP:

```typescript
const ALLOWED_IPS = ['203.0.113.0/24', '198.51.100.42'];

if (!ALLOWED_IPS.includes(clientIP)) {
  return new Response('Forbidden', { status: 403 });
}
```

### Audit Logging (Future Enhancement)

Log all authenticated requests:

```typescript
logger.info('Authenticated API request', {
  endpoint: '/index-docs',
  ip: request.headers.get('cf-connecting-ip'),
  timestamp: new Date().toISOString(),
  userId: 'extracted-from-token', // Future: JWT with user info
});
```

## Monitoring

### Check Rate Limit Status

```bash
# Make authenticated request and check headers
curl -i -X POST "https://your-worker.workers.dev/index-docs?owner=test&repo=test" \
  -H "Authorization: Bearer <token>" | grep X-RateLimit

# Expected output:
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: 3
# X-RateLimit-Reset: 1736686847
```

### Calculate Time Until Reset

```bash
# Get reset timestamp from headers
RESET_TIME=1736686847

# Calculate minutes remaining
echo "$(( ($RESET_TIME - $(date +%s)) / 60 )) minutes until rate limit resets"
```

## Troubleshooting

### 401 Error: "Missing or invalid Authorization header"

**Cause:** Token not included in request

**Solution:**
```bash
# Ensure Bearer prefix is included
curl -H "Authorization: Bearer YOUR_TOKEN" ...

# NOT:
curl -H "Authorization: YOUR_TOKEN" ...  # ❌ Missing "Bearer"
```

### 401 Error: "Invalid API token"

**Cause 1:** Token mismatch

**Solution:** Verify token matches secret:
```bash
# Re-generate and set token
wrangler secret put API_SECRET_TOKEN
```

**Cause 2:** API_SECRET_TOKEN not set in Cloudflare

**Solution:**
```bash
# Check if secret exists
wrangler secret list | grep API_SECRET_TOKEN

# If not listed, set it
wrangler secret put API_SECRET_TOKEN
```

### 429 Error: Rate limit exceeded

**Cause:** More than 5 requests in past hour

**Solutions:**
1. Wait for rate limit to reset (check `Retry-After` header)
2. Request rate limit increase (modify `maxRequests` in code)
3. Use multiple API tokens with different IP addresses

### Token visible in logs/errors

**Risk:** Token exposure could allow unauthorized access

**Mitigation:**
1. Immediately rotate token: `wrangler secret put API_SECRET_TOKEN`
2. Review logs for unauthorized access attempts
3. Implement request logging to detect abuse

## Integration Examples

### GitHub Actions Workflow

```yaml
name: Index Documentation

on:
  push:
    paths:
      - 'docs/**'
      - 'README.md'

jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger indexing
        run: |
          curl -X POST "${{ secrets.WORKER_URL }}/index-docs?owner=${{ github.repository_owner }}&repo=${{ github.event.repository.name }}" \
            -H "Authorization: Bearer ${{ secrets.API_SECRET_TOKEN }}"
```

### Node.js Script

```javascript
const WORKER_URL = 'https://your-worker.workers.dev';
const API_TOKEN = process.env.API_SECRET_TOKEN;

async function indexDocs(owner, repo) {
  const response = await fetch(
    `${WORKER_URL}/index-docs?owner=${owner}&repo=${repo}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Indexing failed: ${error.error}`);
  }
  
  return await response.json();
}

// Usage
indexDocs('your-org', 'your-repo')
  .then(result => console.log('Indexing completed:', result))
  .catch(error => console.error('Error:', error));
```

### Python Script

```python
import os
import requests

WORKER_URL = 'https://your-worker.workers.dev'
API_TOKEN = os.environ['API_SECRET_TOKEN']

def index_docs(owner, repo):
    response = requests.post(
        f'{WORKER_URL}/index-docs',
        params={'owner': owner, 'repo': repo},
        headers={'Authorization': f'Bearer {API_TOKEN}'}
    )
    response.raise_for_status()
    return response.json()

# Usage
result = index_docs('your-org', 'your-repo')
print(f"Indexed {result['job']['stats']['filesProcessed']} files")
```

## Future Enhancements (Phase 2)

- [ ] **JWT Tokens:** Include user metadata (name, email, permissions)
- [ ] **Scope-based Permissions:** Token scopes (read, write, admin)
- [ ] **API Key Management UI:** Web interface for token generation/revocation
- [ ] **Webhook Signatures:** Sign webhook payloads for verification
- [ ] **mTLS Authentication:** Certificate-based authentication for high-security scenarios
- [ ] **OAuth Integration:** GitHub OAuth for user-specific tokens
- [ ] **Audit Logs:** Complete audit trail in KV/Durable Objects
- [ ] **Per-Token Rate Limits:** Different limits per token/user

---

**Phase 1.5.4 Complete** ✅
