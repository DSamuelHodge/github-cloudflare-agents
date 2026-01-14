# Phase 5 Sandbox Runtime Implementation

This document describes the implementation of the conservative in-process sandbox runtime for Phase 5 agents.

## Overview
- Enforces manifest policy and capability checks
- Denies network and secret access by default
- Redacts secrets from plugin output logs
- Execution timeout configurable (default: 2000ms)
- All plugin output is audited and sanitized

## Key Files
- `src/platform/sandbox/runtime.ts`: Sandbox runtime implementation
- `src/platform/sandbox/manifest.ts`: Manifest validation utilities
- `src/platform/durable/AgentDo.ts`: Durable Object orchestrator skeleton
- `tests/sandbox-runtime.spec.ts`: Unit/integration tests for sandbox runtime
- `tests/durable/sandbox-do.spec.ts`: DO orchestration tests

## Usage
- Use `SandboxRuntime` to execute plugin entry functions with manifest validation and audit event emission
- Use `validateManifest()` to validate plugin manifests before execution
- Durable Object orchestrator manages agent state and heartbeat

## Safety
- All secrets and sensitive env vars are redacted from logs
- Capability enforcement ensures only allowed operations are performed
- Execution is time-limited and resource-limited by configuration

## Validation
- All new code must pass CI, lint, and tests
- Audit events are emitted for every plugin execution
