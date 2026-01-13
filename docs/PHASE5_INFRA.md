# Phase 5 Infrastructure & Safety Foundations

This document describes the Stage 1 infrastructure and safety foundation for Phase 5 (Advanced Agent Capabilities).

Goals:
- Provide a conservative sandbox specification and minimal runtime interface.
- Define a plugin manifest format and validation utilities.
- Add audit hooks and redaction helpers for plugin execution logs.
- Introduce a feature flag `PHASE5_ENABLE` (default OFF) to gate Phase 5 behavior.
- Add Durable Object scaffolding as a reversible placeholder for later migration.
- Add CI gating and security tests to prevent accidental enabling in production.

Security model:
- Sandbox denies network and secret access by default.
- Plugins declare capabilities; runtime enforces least privilege.
- All plugin output must be audited and sanitized before emission.

Testing & CI:
- New unit tests validate manifest parsing, sandbox policies, and audit redaction.
- A new CI job `phase5-infra.yml` will run checks on all PRs touching Phase 5 areas.

Feature gating:
- `PHASE5_ENABLE` defaults to OFF; enabling requires PR and security sign-off.

Stage 2 - Runtime Sandbox Implementation (this PR):
- Objective: Implement a conservative runtime sandbox with policy enforcement, and a Durable Object orchestrator for sandbox lifecycle.
- Scope: Minimal runtime that executes plugin entry functions with a restricted `RuntimeApi`, runtime and manifest policy enforcement, in-memory DO orchestration scaffold, and unit/integration tests.
- Safety: Execution denies network access by default; all runs are audited and redacted via `AuditService`.
- Validation: Unit tests for runtime policy, DO orchestration tests, lint/type checks, and CI job to run Stage 2 tests.


Future work (Stage 7):
- Durable Object migration for rate limiting & task coordination.
- Production-grade sandbox runtime in containers or DOs with enforced resource limits.
- Packaging & marketplace mechanisms with signature verification.
