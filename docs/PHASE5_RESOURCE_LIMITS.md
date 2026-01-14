# Phase 5 Resource Limits Enforcement

This document describes the enforcement of time, memory, and CPU limits in the Phase 5 sandbox runtime and Durable Object orchestrator.

## Overview
- SandboxRuntime enforces configurable timeout, memory, and CPU limits
- Limits are checked before plugin execution; failures are logged and execution is rejected
- Default limits: timeout 2000ms, memory 128MB, CPU 50%
- All enforcement actions are recorded in the audit trail

## CI Smoke Tests
- [tests/sandbox-runtime.spec.ts](tests/sandbox-runtime.spec.ts) includes smoke tests for memory and CPU limit enforcement
- Tests verify rejection and audit logging for out-of-range limits

## Limitations
- Actual resource enforcement is simulated; real enforcement requires container/DO runtime configuration
- Limits are configurable via SandboxOptions

## Usage
- Set limits in SandboxOptions when instantiating SandboxRuntime
- Review audit trail for enforcement actions
