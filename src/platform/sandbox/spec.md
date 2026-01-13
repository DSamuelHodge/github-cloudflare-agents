# Sandbox Specification (Stage 1)

This document defines the security model and constraints of the Phase 5 plugin sandbox. This is a spec and will be used to implement a production-grade sandbox in later stages.

Allowed operations (minimal, conservative):
- Read-only access to repository files when `read:repo` capability is present and authorized by policy.
- Controlled metrics emission via the `metrics` capability.

Disallowed operations by default:
- Outbound network access (unless explicitly allowlisted and approved).
- Direct filesystem writes to the worker filesystem.
- Spawning new processes or executing unbounded commands.
- Access to environment secrets (any env variables containing "KEY", "TOKEN", "SECRET", or GITHUB*).

Time & resource limits:
- Execution timeout default: 2000 ms (configurable via `SandboxOptions.timeoutMs`).
- Memory/CPU limits enforced by container runtime (to be configured in Stage 5).

Logging & Redaction:
- All plugin logs MUST be audited; any content matching secret patterns MUST be redacted before emitting to logs or audit stores.

Audit & Monitoring:
- Each execution emits an audit event with: plugin name, manifest checksum, durationMs, result status, and redacted logs.
- Metrics: `agent_sandbox.invocations`, `agent_sandbox.failures`, `agent_sandbox.latency_ms`

Feature gating:
- Sandbox is gated behind `PHASE5_ENABLE` env var and must default to OFF.
