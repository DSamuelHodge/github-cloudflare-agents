# Phase 2 Research: Container-Based Worktree Integration

**Date**: January 2025  
**Status**: Research Complete  
**Decision**: Proceed with Cloudflare Containers + git-worktree-runner hybrid approach

---

## Executive Summary

This research validates the feasibility of integrating **git-worktree-runner (gtr)** with **Cloudflare Containers** to enable isolated, parallel test environments for the GitHub AI Agent. Key findings:

✅ **git-worktree-runner** is production-ready (v2.0.0), bash-based, requires git 2.5+ and bash 3.2+  
✅ **Cloudflare Containers** supports stateful routing, R2 FUSE mounts, WebSocket, and scaling  
⚠️ **Constraints**: 15-minute container shutdown grace period, ephemeral disk, 2-3s cold starts  
✅ **Recommendation**: Implement in phases with cost/risk mitigation

---

## Part 1: Git Worktree Runner Deep Dive

### What is gtr?

A **cross-platform CLI wrapper around git worktrees** that solves the DX problem of manual branch management. Unlike raw `git worktree` commands, gtr provides:

- **Simple commands** for common workflows (create, open, run, clean)
- **Editor integration** (Cursor, VS Code, Zed, Neovim)
- **AI tool integration** (Aider, Claude Code, Copilot, Cursor, Gemini)
- **Automatic setup** (file copying, post-create hooks, config management)
- **Parallel agent support** (multiple worktrees on same branch with custom names)

### Core Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `git gtr new <branch>` | Create worktree | `git gtr new my-feature` |
| `git gtr new <branch> -e -a` | Create + open editor + start AI | `git gtr new my-feature -e -a` |
| `git gtr run <branch> <cmd>` | Execute command in worktree | `git gtr run my-feature npm test` |
| `git gtr go <branch>` | Get worktree path (for navigation) | `cd "$(git gtr go my-feature)"` |
| `git gtr list [--porcelain]` | List all worktrees | `git gtr list` (machine-readable with --porcelain) |
| `git gtr rm <branch>` | Delete worktree | `git gtr rm my-feature` |
| `git gtr copy <target> -- <patterns>` | Sync config files | `git gtr copy my-feature -- ".env*"` |
| `git gtr clean [--merged]` | Clean empty/merged worktrees | `git gtr clean --merged` (requires GitHub CLI) |
| `git gtr doctor` | Health check | `git gtr doctor` |

### Configuration

**Team Configuration** (`.gtrconfig` - commit to repo):
```bash
[copy]
    include = **/.env.example
    exclude = **/.env
    includeDirs = node_modules

[hooks]
    postCreate = npm install

[defaults]
    editor = cursor
    ai = claude
```

**User Configuration** (via `git config`):
```bash
git gtr config set gtr.editor.default cursor
git gtr config set gtr.ai.default claude --global
```

**Precedence**: git config --local > .gtrconfig > git config --global

### Architecture Details

- **Language**: 100% Bash (portable, cross-platform)
- **Core**: Wraps `git worktree add/remove` commands
- **Adapters**: Pluggable system for editor/AI tool integrations
- **Hooks**: `postCreate`, `preRemove` lifecycle hooks
- **Status**: Stable v2.0.0 (Nov 2024), 1.1k GitHub stars, 13 contributors
- **License**: Apache 2.0

### Integration Pattern for Containers

```bash
# 1. Container entrypoint installs gtr
# 2. Container receives branch name + target worktree via env var
# 3. gtr initializes worktree: git gtr new <branch> --no-copy
# 4. Container runs tests: git gtr run <branch> npm test
# 5. Container outputs results to stdout (captured by Durable Object logs)
# 6. Container cleanup: git gtr rm <branch>
```

---

## Part 2: Cloudflare Containers Deep Dive

### What are Cloudflare Containers?

**Serverless containers** running on Cloudflare's global edge network. Each container instance is backed by a **Durable Object** (stateful isolate) and runs in its own **VM** (strong isolation).

### Key Capabilities

| Feature | Capability | Use Case |
|---------|-----------|----------|
| **Stateful Routing** | Route requests to specific container instances by ID | Session-based test environments |
| **Multi-instance** | Deploy 2-300+ container instances concurrently | Parallel test execution |
| **WebSocket Support** | Full WebSocket from Worker to Container | Real-time test streaming |
| **R2 FUSE Mounts** | Mount R2 buckets as filesystems | Persistent artifact storage |
| **Environment Variables** | Pass env vars + secrets at startup | Configuration injection |
| **Lifecycle Hooks** | `onStart`, `onStop`, `onError` | Observability |
| **Scaling** | Auto-scale based on demand | Cost-efficient parallel testing |
| **Global Distribution** | Pre-fetch images across network | 2-3s cold starts |

### Architecture

```
Client Request
    ↓
Worker (latency-optimized location)
    ↓
Durable Object (stateful controller, may differ from Worker location)
    ↓
Container Instance (VM, linux/amd64, near Durable Object)
```

### Instance Configuration

```typescript
export class MyContainer extends Container {
  defaultPort = 4000;              // Port container listens on
  sleepAfter = '10m';              // Stop if idle for 10 minutes
  envVars = { NODE_ENV: 'prod' };  // Environment variables
  
  override onStart() { console.log('Container started'); }
  override onStop() { console.log('Container stopped'); }
  override onError(error) { console.log('Error:', error); }
}
```

### Durable Object Routing

```typescript
// Get specific container instance (stateful)
const container = env.MY_CONTAINER.get('session-123');
return container.fetch(request);

// Load-balance across random instances
const container = await getRandom(env.MY_CONTAINER, 3);
return container.fetch(request);
```

### Limits

**Resource Constraints:**
- **CPU**: 1-8 cores (dependent on instance type)
- **Memory**: Variable (standard: 128MB-1GB available)
- **Disk**: Ephemeral, fresh on restart (~10GB working space)
- **Cold Start**: 2-3 seconds typical
- **Shutdown Grace Period**: 15 minutes (SIGTERM → SIGKILL)
- **Max Instances**: Bounded by account quota (~300 concurrent)
- **Architecture**: Must be `linux/amd64`

**Network Constraints:**
- **Inbound**: HTTP/HTTPS only (no raw TCP/UDP)
- **Outbound**: Egress allowed, automatic logging/metrics
- **WebSocket**: Supported (Worker → Container)

**Persistent Storage:**
- ❌ **Persistent Disk**: Not available (ephemeral only)
- ✅ **R2 FUSE**: Mount R2 buckets as filesystems (workaround)

### Deployment

1. **Configure** in `wrangler.toml`:
```toml
[[containers]]
max_instances = 10
class_name = "MyContainer"
image = "./Dockerfile"
```

2. **Deploy**:
```bash
wrangler deploy
```

3. **Rolling Deploy**: Graceful shutdown during updates

### Cost Model

- **Pay for**: Active running instances
- **Free**: Pre-warmed images (no charge)
- **Pricing**: [Available on dashboard]

---

## Part 3: Integration Strategy

### Architecture: Container-Backed Testing

```
GitHub Webhook
    ↓
Worker (index.ts)
    ↓
AgentRegistry → IssueResponderAgent (existing)
    ↓
NEW: ContainerTestAgent (Phase 2)
    ↓
Durable Object Container Manager
    ↓
Container Instance #1 (gtr + test suite)
Container Instance #2 (gtr + test suite)
Container Instance #3 (gtr + test suite)
    ↓
Results → R2 (artifacts)
Results → GitHub Comments (PR feedback)
```

### Phase-by-Phase Breakdown

**Phase 2.1: Basic Container Setup**
- Create Dockerfile with gtr + git + bash + node
- Add Container class in TypeScript
- Configure wrangler.toml with max_instances=5
- Test basic container startup

**Phase 2.2: Isolated Testing Environment**
- Implement ContainerTestAgent
- Integrate git-worktree-runner CLI
- Capture test output, handle failures

**Phase 2.3: R2 Persistent Storage**
- Mount R2 buckets via FUSE
- Store test artifacts (logs, coverage reports, diffs)
- Handle ephemeral disk limitation

**Phase 2.4: Real-Time Streaming**
- Implement WebSocket from Container to Worker
- Stream test output in real-time
- Add progress indicators

**Phase 2.5: Parallel Multi-Solution Testing**
- Create load-balanced routing
- Spawn 3-5 containers for parallel test execution
- Aggregate results

**Phase 2.6: Automated PR Workflow**
- Create PRAgent
- Generate GitHub PR comments with test summaries
- Integrate branch cleanup

### Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Cold start delays (2-3s)** | Pre-warm containers, set reasonable sleepAfter timers |
| **Ephemeral disk loss** | Use R2 FUSE for persistent storage |
| **High container costs** | Set max_instances cap, implement throttling |
| **15-min shutdown grace** | Implement graceful shutdown handlers |
| **Failed worktree creation** | Retry logic, health checks, error logs |
| **Docker build complexity** | Keep image minimal, cache layers |

---

## Part 4: Implementation Dependencies

### Required Tools

- **Docker**: For building container images locally
- **Wrangler 4.58.0+**: Already in project
- **git-worktree-runner**: Install in container via .gtrconfig
- **git 2.5+**: Standard on most systems
- **bash 4.0+**: For advanced gtr features

### Container Image Requirements

```dockerfile
FROM ubuntu:24.04

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    bash \
    git \
    curl \
    node npm \
    && rm -rf /var/lib/apt/lists/*

# Install gtr (clone or wget)
RUN git clone https://github.com/coderabbitai/git-worktree-runner.git /gtr && \
    chmod +x /gtr/bin/git-gtr

# Set PATH
ENV PATH="/gtr/bin:$PATH"

# Default command
CMD ["bash"]
```

### TypeScript Types for Container Integration

Already have: `Agent`, `AgentContext`, `AgentConfig`  
Need to add:
- `ContainerInstance` - Stateful container reference
- `TestResult` - Test execution output
- `TestJob` - Job routing definition
- `StreamingResponse` - WebSocket message format

---

## Part 5: Validation Checklist

✅ **Research validates feasibility**
- git-worktree-runner is production-grade
- Cloudflare Containers supports required features
- Cost-conscious defaults available

⚠️ **Proceed with caution**
- Ephemeral disk requires R2 FUSE for persistence
- 15-minute shutdown grace period is workable
- Docker build locally required (not in cloud)

📋 **Before each phase completion**
- `npm run type-check` (zero errors)
- `npm run lint` (zero errors)
- `npm run test` (if added)
- VS Code "Problems" panel (zero issues)

---

## References

- [git-worktree-runner GitHub](https://github.com/coderabbitai/git-worktree-runner) (v2.0.0)
- [Cloudflare Containers Docs](https://developers.cloudflare.com/containers/)
- [Cloudflare Containers Examples](https://developers.cloudflare.com/containers/examples/)
- [Container Architecture & Limits](https://developers.cloudflare.com/containers/platform-details/)
- [R2 FUSE Mount Example](https://developers.cloudflare.com/containers/examples/r2-fuse-mount/)
- [WebSocket Example](https://developers.cloudflare.com/containers/examples/websocket/)
