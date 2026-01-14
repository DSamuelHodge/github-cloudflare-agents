# Non-null Assertions Inventory — Summary

Generated: 2026-01-13

- Total findings: 9
- Directories scanned: `src/`

Top hotspots:

- `src/platform/documentation/indexer.ts` — 1 (env binding, high risk)
- `src/platform/streaming/StreamingService.ts` — 1 (map-get, medium)
- `src/platform/parallel/ResultAggregator.ts` — 1 (post-check, low)

Risk breakdown:

- High (riskScore >=4): 1
- Medium (riskScore 2-3): 6
- Low (riskScore 1): 2

Suggested immediate actions (Stage 2 candidates):

- Replace trivial cache/map .get() usages with narrow-local variables after `.has()` checks.
- Add explicit runtime validation for `this.kvNamespace` in `src/platform/documentation/indexer.ts` (fail-fast with clear error).

See `non-null-assertions.json` for full details and `remediation-priorities.csv` for prioritized list.
