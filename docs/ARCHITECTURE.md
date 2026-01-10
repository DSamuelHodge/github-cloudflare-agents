# Architecture Refactor - Hybrid Agent System

## Overview

This refactor implements a scalable, production-ready agent architecture that supports 10s-100s of agents with clean separation of concerns, reusable platform services, and comprehensive observability.

## New Architecture

### Directory Structure

```
src/
├── index.new.ts                          # New entry point with middleware pipeline
├── agents/
│   ├── registry.ts                       # Agent discovery & routing
│   ├── base/
│   │   ├── BaseAgent.ts                  # Abstract base class with lifecycle hooks
│   │   ├── AgentContext.ts               # Execution context wrapper
│   │   └── AgentConfig.ts                # Configuration management
│   └── issue-responder/
│       ├── agent.ts                      # Issue Responder Agent (refactored from workflow.ts)
│       ├── config.ts                     # Agent-specific configuration
│       ├── prompts/
│       │   └── system-prompt.ts          # AI prompt templates
│       └── services/
│           ├── ValidationService.ts      # Issue validation logic
│           ├── AIResponseService.ts      # AI response generation
│           └── GitHubCommentService.ts   # GitHub comment posting
├── platform/
│   ├── github/
│   │   ├── client.ts                     # GitHub API wrapper
│   │   └── webhook.ts                    # Webhook verification
│   └── ai/
│       └── client.ts                     # Gemini AI client
├── middleware/
│   ├── pipeline.ts                       # Middleware execution framework
│   ├── auth.ts                           # Webhook signature verification
│   ├── error-handler.ts                  # Global error handling & CORS
│   └── rate-limit.ts                     # Rate limiting (in-memory)
├── types/
│   ├── agents.ts                         # Agent system interfaces
│   ├── env.ts                            # Environment bindings
│   ├── events.ts                         # Event system types
│   ├── github.ts                         # GitHub API types
│   └── openai.ts                         # AI API types
└── utils/
    ├── logger.ts                         # Structured logging
    ├── errors.ts                         # Custom error types
    └── metrics.ts                        # Metrics collection
```

## Key Components

### 1. Agent System

**BaseAgent** (`agents/base/BaseAgent.ts`)
- Abstract class with lifecycle hooks: `beforeExecute`, `execute`, `afterExecute`, `onError`
- Automatic timeout protection
- Metrics and logging integration
- Helper methods for result creation

**AgentRegistry** (`agents/registry.ts`)
- Global agent registration
- Event-based agent routing
- Priority-based execution
- Agent statistics and health checks

**AgentContext** (`agents/base/AgentContext.ts`)
- Encapsulates request context, environment, logger, and metrics
- Metadata storage for inter-agent communication

### 2. Platform Services

**GitHubClient** (`platform/github/client.ts`)
- Centralized GitHub API interactions
- Methods: `createComment`, `getIssue`, `updateIssue`, `addLabels`, `createPullRequest`
- Automatic authentication and error handling

**AIClient** (`platform/ai/client.ts`)
- Gemini API wrapper (OpenAI-compatible)
- Methods: `generateCompletion`, `generateText`
- Token usage tracking

### 3. Middleware Pipeline

**Pipeline System** (`middleware/pipeline.ts`)
- Express-like middleware chain
- Supports request/response transformation
- Short-circuit capability for early returns

**Built-in Middleware:**
- **authMiddleware**: GitHub webhook signature verification
- **errorHandler**: Global exception handling with structured responses
- **rateLimitMiddleware**: In-memory rate limiting (100 req/min default)
- **corsMiddleware**: CORS headers for development

### 4. Utilities

**Logger** (`utils/logger.ts`)
- Structured JSON logging
- Log levels: debug, info, warn, error
- Context propagation via child loggers

**Errors** (`utils/errors.ts`)
- Custom error classes: `AgentError`, `GitHubAPIError`, `AIAPIError`, etc.
- HTTP status code mapping
- Error metadata for debugging

**Metrics** (`utils/metrics.ts`)
- Metrics collection: counters, gauges, timings
- Tag-based filtering
- Console output for Cloudflare observability

## Adding New Agents

### Example: PR Reviewer Agent

```typescript
// src/agents/pr-reviewer/agent.ts
import { BaseAgent } from '../base/BaseAgent';
import type { AgentContext, AgentResult } from '../../types/agents';

export class PRReviewerAgent extends BaseAgent {
  readonly name = 'pr-reviewer';
  readonly version = '1.0.0';
  readonly triggers = ['pull_request'];
  
  constructor() {
    super({
      enabled: true,
      priority: 90,
      timeoutMs: 60000, // 1 minute for code analysis
    });
  }
  
  async shouldHandle(context: AgentContext): Promise<boolean> {
    const baseCheck = await super.shouldHandle(context);
    if (!baseCheck) return false;
    
    const payload = context.payload as any;
    return payload.action === 'opened' || payload.action === 'synchronize';
  }
  
  async execute(context: AgentContext): Promise<AgentResult> {
    // Your PR review logic here
    context.logger.info('Analyzing pull request...');
    
    return this.createSuccessResult('reviewed', {
      filesAnalyzed: 10,
      issuesFound: 2,
    });
  }
}

// Register in src/index.new.ts
import { PRReviewerAgent } from './agents/pr-reviewer/agent';

function initializeAgents() {
  globalRegistry.register(new IssueResponderAgent());
  globalRegistry.register(new PRReviewerAgent());
}
```

## Migration Guide

### Old vs New

| Old (workflow.ts) | New (hybrid architecture) |
|-------------------|---------------------------|
| Single `GitHubIssueWorkflow` class | `IssueResponderAgent` with services |
| Mixed concerns | Separated: validation, AI, GitHub |
| Direct fetch calls | `GitHubClient`, `AIClient` |
| No middleware | Pipeline with auth, errors, rate limits |
| Hardcoded logic | Configurable agent system |

### Breaking Changes

1. **Entry point**: `src/index.ts` → `src/index.new.ts` (update `wrangler.toml`)
2. **Workflow binding removed**: No longer uses Cloudflare Workflows binding
3. **Environment**: Added `LOG_LEVEL` variable

### Backward Compatibility

The old `src/index.ts` and `src/workflow.ts` remain intact on the `main` branch. The `refactor` branch contains the new architecture.

## Testing

```bash
# Type checking
npm run type-check

# Local development
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Performance Characteristics

- **Agent Discovery**: O(n) where n = registered agents
- **Middleware Pipeline**: O(m) where m = middleware count
- **Agent Execution**: Parallel-capable (not yet implemented)
- **Memory**: ~10MB per agent registration

## Future Enhancements

### Phase 2: Container-Based Worktree Testing
- Add `WorktreeAgent` for git worktree management
- Integrate Cloudflare Containers for test execution
- R2 FUSE mounts for persistent storage

### Phase 3: Advanced Features
- **Durable Objects**: Replace in-memory rate limiting
- **Parallel Execution**: Execute multiple agents concurrently
- **Event Bus**: Pub/sub for inter-agent communication
- **Agent Plugins**: Dynamic agent loading from R2

## Observability

### Logging
All agents log structured JSON:
```json
{
  "level": "info",
  "message": "Agent execution completed",
  "timestamp": "2026-01-10T12:34:56.789Z",
  "meta": {
    "agent": "issue-responder",
    "requestId": "uuid",
    "executionTimeMs": 1234
  }
}
```

### Metrics
Automatic metrics collection:
- `agent.execution_time` (timing)
- `agent.executed` (counter)
- `agent.error` (counter)
- `ai.tokens_used` (gauge)

### Health Check
```bash
curl https://your-worker.workers.dev/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-10T12:34:56.789Z",
  "agents": {
    "totalAgents": 1,
    "enabledAgents": 1,
    "disabledAgents": 0,
    "agentsByTrigger": {
      "issues": ["issue-responder"]
    }
  }
}
```

## Contributing

When adding new agents:
1. Extend `BaseAgent` for lifecycle management
2. Implement `shouldHandle` for event filtering
3. Implement `execute` for agent logic
4. Register in `initializeAgents()`
5. Add tests for agent behavior
6. Update this README

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner)
