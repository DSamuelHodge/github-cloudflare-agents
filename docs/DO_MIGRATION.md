# Durable Objects Migration Plan (Stage 7 placeholder)

This is a spec document describing a planned Durable Object migration for Phase 5. It is intentionally high level and non-executable in Stage 1.

Goals:
- Migrate in-memory rate limiting and coordinator state to Durable Objects for distributed consistency.
- Ensure migrations are reversible and have zero-data-loss paths.

Constraints:
- Migrations will be feature-gated and reversible.
- DO bindings will only be added after Stage 7 approval and security review.

Steps (future):
1. Add DO class definitions and binding in `wrangler.toml` under a feature flag.
2. Add DO-backed persistence adapters for MetricsCollector and CircuitBreaker.
3. Run dual-write tests and consistency checks in staging.
4. Promote to full DO read after passing validation.
5. Remove in-memory fallback if stable.
