- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements: Requirements defined for a GitHub AI Agent using Cloudflare Workers and Gemini 3 Flash.
- [x] Scaffold the Project: Created project structure with src/index.ts, src/worflow.ts, wrangler.toml, and package.json.
- [x] Customize the Project: Implemented GitHub webhook signature verification, Gemini 3 Flash integration via OpenAI-compatible endpoint, and direct workflow invocation.
- [x] Install Required Extensions: No specific extensions required for this project type.
- [x] Compile the Project: Resolved all TypeScript errors and verified build with npm run deploy.
- [x] Create and Run Task: Configured npm run deploy and npm test as primary tasks.
- [x] Launch the Project: Project successfully deployed to Cloudflare Workers. 
- [x] Ensure Documentation is Complete: README.md updated with feature list, setup instructions, and a Future Roadmap. copilot-instructions.md finalized.

## Code Style & Standards

### TypeScript Type Safety (CRITICAL - STRICTLY ENFORCED)
- **NEVER use `any` type** - This is strictly forbidden per ESLint configuration (enforced as ERROR)
- Use `unknown` for truly unknown types, then narrow with type guards
- Use specific interface types for all function parameters and return values
- When dealing with external data (APIs, webhooks), create proper interfaces
- Use type guards (`typeof`, `instanceof`, custom guards) to narrow `unknown` types
- For generic catch blocks, use `unknown` and check error type before accessing properties

### Example: Proper Type Handling
```typescript
// ❌ FORBIDDEN - Will cause ESLint error
function handleWebhook(data: any) {
  return data.action;
}

// ✅ CORRECT - Use interface
interface WebhookPayload {
  action: string;
  repository: {
    name: string;
    owner: { login: string };
  };
}

function handleWebhook(data: WebhookPayload) {
  return data.action;
}

// ✅ CORRECT - Use unknown with type guard
function parseWebhook(raw: unknown): WebhookPayload {
  if (!isWebhookPayload(raw)) {
    throw new Error('Invalid webhook payload');
  }
  return raw;
}

function isWebhookPayload(value: unknown): value is WebhookPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'action' in value &&
    typeof value.action === 'string'
  );
}
```

### Error Handling
```typescript
// ❌ FORBIDDEN - Will cause ESLint error
catch (e: any) {
  console.error(e.message);
}

// ✅ CORRECT
catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Project Context

### Architecture
- **Multi-Agent System**: Agents inherit from `BaseAgent` and register with `AgentRegistry`
- **Platform Services**: Reusable services for GitHub API, AI clients, storage, streaming
- **Middleware Pipeline**: Request processing with auth, rate limiting, error handling
- **Container-Based Testing**: Cloudflare Containers + git-worktree-runner for isolated test execution
- **Parallel Testing**: Multiple solutions tested concurrently with comparative analysis

### Key Technologies
- **Runtime**: Cloudflare Workers (V8 isolate, not Node.js)
- **Storage**: R2 (S3-compatible), KV (key-value), Durable Objects
- **Containers**: Cloudflare Containers (OCI-compatible, limited lifecycle)
- **AI**: Gemini 3 Flash via OpenAI-compatible API
- **Testing**: Vitest for unit tests, 178 tests across all Phase 2 features

### Important Patterns
- All agents follow naming: `{Name}Agent` (e.g., `IssueResponderAgent`, `PRAgent`)
- Services use dependency injection via constructor
- Error handling with custom error classes (`AgentError`, `ValidationError`, etc.)
- Logging with structured context: `logger.info(message, context, metadata)`
- Metrics tracking via `createMetrics()` utility

## File Organization

### Source Structure
```
src/
  agents/          - Agent implementations (issue-responder, pr-agent, container-test)
  platform/        - Reusable platform services (github, ai, storage, streaming)
  middleware/      - Request processing pipeline
  types/           - TypeScript interfaces and types
  utils/           - Logging, metrics, error utilities
  containers/      - Container orchestration for test execution
```

### Configuration Files
- `wrangler.toml` - Cloudflare Worker configuration
- `eslint.config.mjs` - ESLint with strict `any` prohibition (ERROR level)
- `tsconfig.json` - TypeScript compiler configuration
- `vitest.config.ts` - Test framework configuration

## Current Focus: Phase 2.7 Type Safety Hardening

### Active Refactoring Plan
We are removing ALL `any` types from the codebase. See README.md Phase 2.7 for complete refactoring plan.

**14 instances require refactoring:**
1. `src/agents/container-test/agent.ts` (4 instances)
2. `src/agents/pr-agent/agent.ts` (2 instances)
3. `src/agents/registry.ts` (1 instance)
4. `src/index.new.ts` (1 instance)
5. `src/platform/pr/PRService.ts` (2 instances)
6. `src/platform/streaming/StreamingService.ts` (1 instance)
7. `src/types/agents.ts` (1 instance)
8. `src/types/env.ts` (2 instances)

### When Working on These Files
- Replace `any` with proper interfaces or `unknown`
- Add runtime validation for external data
- Use type guards for discriminated unions
- Import Cloudflare types for environment bindings
- Use `@octokit/webhooks-types` for GitHub payloads

## Development Workflow

### Before Writing Code
1. Check existing types in `src/types/` - don't duplicate
2. Review similar agents/services for patterns
3. **Verify no `any` types used** (enforced by ESLint)
4. Consider error cases and validation needs
5. Plan observability (logging, metrics)

### Testing Requirements
- All new features must have tests
- Tests go in `tests/` directory
- Use descriptive test names: `should {expected behavior} when {condition}`
- Mock external dependencies (GitHub API, AI API, R2)
- Test error cases, not just happy paths

### Linting (MANDATORY)
- Run `npm run lint` before committing (allows warnings)
- Run `npm run lint:strict` for zero-tolerance mode
- Use `npm run lint:fix` for auto-fixable issues
- **Zero tolerance for `any` types** (enforced as ERROR)

## Code Review Checklist

When reviewing or generating code, verify:
- [ ] No `any` types used anywhere (ESLint will error)
- [ ] All functions have explicit parameter types
- [ ] Return types are explicit (not inferred from `any`)
- [ ] External data is validated with type guards
- [ ] Error handling uses `unknown` and narrows properly
- [ ] Logging includes proper context
- [ ] Tests cover new functionality
- [ ] ESLint passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run type-check`)

## Common Pitfalls to Avoid

1. **Environment bindings**: Use `Env` interface from `src/types/env.ts`, not `any`
2. **GitHub webhooks**: Import types from `@octokit/webhooks-types`
3. **JSON parsing**: Always validate parsed data, don't trust `JSON.parse()` type
4. **Cloudflare APIs**: Use `@cloudflare/workers-types` for proper bindings
5. **Container responses**: Create interfaces for container API responses
6. **Agent config**: Use `AgentConfig` interface, not generic objects

## Resources

- Architecture: `docs/ARCHITECTURE.md`
- Phase 2 Research: `docs/PHASE2_RESEARCH.md`
- Roadmap: `README.md` (See Phase 2.7 for type safety plan)
- Type definitions: `src/types/` directory
- Agent examples: `src/agents/*/agent.ts`

## Execution Guidelines
PROGRESS TRACKING:
- After completing each step, mark it complete and add a summary.
- Read current todo list status before starting each new step.

COMMUNICATION RULES:
- Avoid verbose explanations or printing full command outputs.
- If a step is skipped, state that briefly (e.g. "No extensions needed").
- Do not explain project structure unless asked.
- Keep explanations concise and focused.

DEVELOPMENT RULES:
- Use '.' as the working directory unless user specifies otherwise.
- Avoid adding media or external links unless explicitly requested.
- Use placeholders only with a note that they should be replaced.
- Use VS Code API tool only for VS Code extension projects.
- Once the project is created, it is already opened in Visual Studio Codedo not suggest commands to open this project in Visual Studio again.

FOLDER CREATION RULES:
- Always use the current directory as the project root.
- If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
- Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
- If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
- Only install extension specified by the get_project_setup_info tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
- If the user has not specified project details, assume they want a "Hello World" project as a starting point.
- Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
- Avoid generating images, videos, or any other media files unless explicitly requested.
- If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
- Ensure all generated components serve a clear purpose within the user's requested workflow.
- If a feature is assumed but not confirmed, prompt the user for clarification before including it.
- If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
- Your task is complete when:
  - Project is successfully scaffolded and compiled without errors
  - copilot-instructions.md file in the .github directory exists in the project
  - README.md file exists and is up to date
  - User is provided with clear instructions to debug/launch the project
