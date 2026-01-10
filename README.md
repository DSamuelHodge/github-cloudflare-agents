# GitHub AI Agent (Cloudflare Worker)

Cloudflare Worker that listens to GitHub issue webhooks, drafts AI responses with Gemini 3 Flash (OpenAI-compatible API), and posts comments back to GitHub issues.

## Features
- Verify GitHub webhook signatures
- Validate issue labels before responding
- Generate AI replies via Gemini 3 Flash (OpenAI-compatible chat completions)
- Post formatted comments to GitHub
- Health check endpoint at `/health`

## Prerequisites
- Node.js 18+
- Cloudflare Wrangler CLI (`npm install -g wrangler`)
- GitHub Personal Access Token with `repo` scope
- Gemini API key from Google AI Studio

## Setup
1. Install dependencies: `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and fill in secrets.
3. Update `wrangler.toml` with your `GITHUB_REPO` and secrets.
4. Start local dev server: `npm run dev` (default at `http://localhost:8787`).
5. Send a GitHub webhook payload to the dev server and verify `/health` returns 200.

## Scripts
- `npm run dev` — Run locally with Wrangler.
- `npm test` — Run unit tests with Vitest.
- `npm run type-check` — TypeScript type checking.
- `npm run deploy` — Deploy to Cloudflare Workers.

## Webhook Security
- `src/index.ts` validates `x-hub-signature-256` using the shared secret `GITHUB_WEBHOOK_SECRET`.
- Configure this secret both in GitHub webhook settings and in Wrangler secrets.

## Workflow Overview
1. `src/index.ts` handles requests, verifies signature, and forwards payloads.
2. `src/workflow.ts` validates the issue, builds the prompt, calls Gemini (OpenAI-compatible), and posts comments.
3. `tests/workflow.test.ts` covers validation and formatting logic.

## Deployment
- Use `npm run deploy` or the GitHub Actions workflow at `.github/workflows/deploy.yml` once secrets are configured in the repository settings.

## Documentation
- Quickstart: `docs/quickstart.md`
- Example responses: `docs/example-responses.md`


## Customization Point
- AI Behavior: Edit system prompts in `agents/issue-responder/prompts/system-prompt.ts`
- Response Format: Modify `formatGitHubComment()` in the same file
- Filtering: Adjust validation logic in `agents/issue-responder/services/ValidationService.ts`
- Model Selection: Change `GEMINI_MODEL` in `wrangler.toml`
- Add New Agents: See `docs/ARCHITECTURE.md` for agent development guide

## Roadmap & Future Directions

### Phase 1: Architecture Foundation ✅ COMPLETED
- [x] **Hybrid Agent System**: Implemented scalable agent architecture supporting 10s-100s of agents with clean separation of concerns (refactor branch)
- [x] **Agent Registry**: Built agent discovery, registration, and priority-based routing system
- [x] **Platform Services**: Extracted reusable GitHub and AI clients with comprehensive error handling
- [x] **Middleware Pipeline**: Created request processing pipeline with auth, rate limiting, and error handling
- [x] **Observability**: Added structured logging, metrics collection, and custom error types
- [x] **Type Safety**: Comprehensive TypeScript interfaces for agents, events, and environment
- [x] **Documentation**: Complete architecture guide with migration path and agent development examples

### Phase 1.5: Enhanced Context (In Progress)
- [ ] **Repository Awareness**: Give the agent tools to fetch and read specific files from the repository to provide more accurate, context-aware solutions.
- [ ] **Documentation RAG**: Implement Retrieval Augmented Generation (RAG) by indexing the project's documentation and Wiki to provide referenced answers.
- [ ] **Threaded Conversations**: Enable the agent to respond to follow-up comments within the same issue thread using Agents SDK stateful conversations.

### Phase 2: Container-Based Worktree Integration
- [ ] **Milestone 2.1: Basic Container Setup** (Week 1-2)
  - Deploy Cloudflare Container with git and Node.js pre-installed
  - Integrate `git-worktree-runner` (gtr) CLI into container image
  - Establish secure GitHub authentication for repository cloning
  - Implement basic worktree creation: `git gtr new fix-issue-{number}`
  
- [ ] **Milestone 2.2: Isolated Testing Environment** (Week 3-4)
  - AI-generated fix application to worktree branches
  - Execute test suites within container (npm test, pytest, etc.)
  - Parse test output and capture success/failure metrics
  - Post test results as GitHub issue comments with formatted output
  
- [ ] **Milestone 2.3: R2 Persistent Storage** (Week 5-6)
  - Mount R2 bucket as FUSE filesystem for worktree persistence
  - Implement worktree caching strategy to avoid re-cloning
  - Enable multi-turn agent workflows with persistent branches
  - Add worktree lifecycle management (create, resume, cleanup)
  
- [ ] **Milestone 2.4: Real-Time Streaming** (Week 7-8)
  - WebSocket integration for live test output streaming
  - Stream container logs to GitHub issue comments in real-time
  - Implement status hooks to track container lifecycle events
  - Add progress indicators for long-running test suites
  
- [ ] **Milestone 2.5: Parallel Multi-Solution Testing** (Week 9-10)
  - Spawn multiple containers with different AI-generated solutions
  - Run tests concurrently across isolated worktrees (solution-a, solution-b, solution-c)
  - Benchmark performance, code coverage, and test pass rates
  - Generate comparative analysis and recommend optimal solution
  
- [ ] **Milestone 2.6: Automated PR Workflow** (Week 11-12)
  - Auto-create pull requests when container tests pass
  - Include test results, coverage reports, and AI reasoning in PR description
  - Link PR back to original issue with test validation proof
  - Implement `git gtr clean --merged` for automatic worktree cleanup via Cron Triggers

### Phase 3: Agentic Superpowers
- [ ] **Automated Triaging**: Allow the agent to automatically apply labels like `needs-more-info`, `confirmed-bug`, or assign issues to specific team members based on content.
- [ ] **PR Review Mode**: Extend the agent to review Pull Requests, checking for common pitfalls, style violations, and suggesting optimizations.
- [ ] **Code Fix Suggestions (Enhanced)**: Move beyond suggestions to verified code fixes tested in Container worktrees before PR creation.
- [ ] **Multi-Repository Support**: Enable agent to work across multiple repositories with shared worktree storage in R2.

### Phase 4: Operations & Ecosystem
- [ ] **Multi-Model Fallback**: Implement logic to switch between Gemini models or fallback to OpenAI/Anthropic if one provider is unavailable.
- [ ] **Analytics Dashboard**: A lightweight web interface to monitor token usage, cost, and success rates of AI-generated suggestions.
- [ ] **Custom Plugin System**: Allow developers to write small TypeScript hooks to extend the agent's behavior for specific repository needs.
- [ ] **Agent Marketplace**: Community-contributed agents with standardized packaging and deployment
- [ ] **Durable Objects Migration**: Replace in-memory rate limiting with Durable Objects for distributed state
- [ ] **Parallel Agent Execution**: Execute multiple agents concurrently with configurable parallelism
- [ ] **Agent Health Monitoring**: Automatic agent health checks with alerting and self-healing capabilities

### Phase 5: Advanced Agent Capabilities
- [ ] **Code Generation Agent**: Generate entire features from natural language specifications
- [ ] **Security Scan Agent**: Automated security vulnerability scanning for dependencies and code patterns
- [ ] **Performance Profiling Agent**: Analyze PR performance impact and suggest optimizations
- [ ] **Documentation Generator Agent**: Auto-generate or update documentation based on code changes
- [ ] **Migration Assistant Agent**: Help migrate code between frameworks or language versions
- [ ] **Accessibility Audit Agent**: Check PRs for WCAG compliance and accessibility best practices

## Current Status

**Active Branch:** `refactor` - Hybrid agent architecture implementation
**Main Branch:** Legacy workflow system (stable)

To use the new architecture:
```bash
git checkout refactor
npm install
npm run dev
```

See `docs/ARCHITECTURE.md` for detailed documentation on the new system.
