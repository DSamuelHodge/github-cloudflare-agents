# Phase 4.9: Agent, Prompt, Role & Tool Governance - Stage Execution Contract

## Purpose
Define governance, security, versioning, and operational requirements for treating agent behavior (roles), prompts, and privileged MCP tools as auditable code artifacts. This stage ensures that prompts, roles, and tool access are managed via code, reviewed, and enforced by policy.

---

## Stage Contract Template (Phase 4.9)

### 1. Stage Name
Agent, Prompt, Role & Tool Governance

### 2. Objectives
- Treat system prompts and role definitions as versioned code and configuration.
- Implement privilege-aware tool access controls per agent and role.
- Add tooling for prompt diff, prompt testing, and secure storage of prompt versions.
- Ensure audit trails for prompt/tool/role changes and usage.
- Enable CI checks (linting, unit tests, integration tests) for prompt/role/tool changes.

### 3. Deliverables
- New directory: `src/agents/prompts/` – prompt files with metadata and versioning guidelines
- Role & permission schemas: `src/agents/roles/roles.schema.ts` and `src/agents/roles/*` definitions
- Tool capability and privilege registry: `src/platform/tools/ToolRegistry.ts`
- Enforcement middleware: `middleware/privilege-check.ts` and agent-level guard utilities
- Prompt test harness & fixture framework: `tests/prompts/*.spec.ts`
- CI jobs: `/.github/workflows/prompt-ci.yml` to lint, unit test, and validate prompt diffs
- Documentation: this contract added to `docs/` and `docs/ARCHITECTURE.md` updated with governance section

### 4. Acceptance Criteria
- Prompts stored as code files with metadata (author, version, changelog, tests)
- Role definitions with explicit allowed tools and permissions present
- `ToolRegistry` implements allowlists, deny-lists, and runtime checks
- Middleware correctly prevents unauthorized tool access during `Agent.run()`
- All new code covered by unit tests and integration tests; CI passes
- Audit logs show who changed prompts/roles/tools and when (commit + metadata)

### 5. Audit & Review Steps
- Pull request must include: prompt diff, tests, and an audit entry message
- Run `npm run lint`, `npm test`, and `npm run type-check` locally before review
- Security review for any new tool integrations (check secrets, tokens, least privilege)
- Approve via two reviewers, one must be a security engineer

### 6. Rollback Plan
- Revert commit branch if CI fails or security tests fail
- For production prompt changes, maintain a canary release path using feature flags and monotonic rollout

### 7. Versioning & Traceability
- Use semantic commit messages: `prompt: bump v1.2.0 - improve role instructions`
- Tag prompt releases where applicable (e.g., `prompts/v1.2.0`)
- Maintain `PROMPTS_CHANGELOG.md` with human-readable entries and links to PRs

---

## Implementation Notes

### Prompt as Code Structure
- File: `src/agents/prompts/<agent-name>/<prompt-id>.json` or `.yaml`
- Metadata:
  - id
  - version
  - author
  - createdAt
  - changelog
  - testCases (list of prompt / expected behavior)
  - securityReview: { status, reviewer, date }

### Role & RBAC
- Roles defined in `src/agents/roles/*.ts` implementing an interface: `AgentRole`:
  - name
  - description
  - allowedTools: string[]
  - allowedScopes: string[] (e.g., repo, org)
  - escalationPolicy?: string

- `ToolRegistry` enforces `allowedTools` at runtime and provides a discovery API

### Tool Privilege Controls
- Every tool must register with `ToolRegistry` including metadata:
  - id, description, requiredSecrets, capabilityTags
- Runtime enforcement middleware ensures agent role allows requested tool & scope
- Tools with high privilege (e.g., write-to-repo, deploy) require 2FA-style approvals or pre-approved whitelists

### Prompt Testing
- Prompt fixtures: positive/negative test cases that run in a sandboxed prompt harness
- Integration tests that validate prompt output meets policy constraints (no secrets exfiltration, no privileged actions)

### CI / Automation
- Add GitHub Action `prompt-ci.yml` that:
  - Lints and type-checks prompt files
  - Runs prompt unit tests
  - Runs role & tool static validation
  - Posts PR check summary and blocks merge on failure

### Observability & Auditing
- Emit audit events when: prompt updated, role updated, tool registered, privileged tool called
- Audit event includes: actor, commit/PR, timestamp, before/after metadata
- Persist audit events to KV or append-only R2 artifact

---

## Timeline & Ownership
- Owner: Platform Security & Agent Core Team
- Phase: 2-3 sprints
- Milestones:
  1. Design & schema approval (Sprint 1)
  2. ToolRegistry & Role schema (Sprint 1)
  3. Prompt-as-code layout + tests (Sprint 2)
  4. Middleware enforcement + CI (Sprint 2)
  5. Documentation & audit pipeline (Sprint 3)

---

## Next Steps
1. Create issue and draft PR with schema and `ToolRegistry` scaffold
2. Implement prompt file format and add examples for `issue-responder` and `pr-agent`
3. Add tests and CI workflow
4. Run security review and iterate

---

*Store this contract in `docs/PHASE4_9_AGENT_PROMPT_ROLE_TOOL_CONTRACT.md` and reference it from `docs/PHASE5_STAGE_EXECUTION_CONTRACT.md`.*
