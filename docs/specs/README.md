Circuit Breaker TLA+ specification

Files:
- `circuit_breaker.tla` - TLA+ specification (Plus-level)
- `circuit_breaker.cfg` - TLC model-checker configuration with small bounds for exhaustive checking

Quick start (local):
1. Install TLA+ Toolbox or the standalone TLC model checker (https://lamport.azurewebsites.net/tla/tla.html)
2. Open `circuit_breaker.tla` in the Toolbox or run TLC via command-line:
   tlc2 circuit_breaker.tla
   or with the config file:
   tlc2 -config circuit_breaker.cfg circuit_breaker.tla

What it models:
- Circuit states: CLOSED, OPEN, HALF_OPEN
- Failure and success actions with thresholds
- Timeout action moving OPEN -> HALF_OPEN

Checks included:
- Safety invariant: OPEN implies failureCount >= FailureThreshold

Notes and limitations:
- Model uses abstract actions; timeouts are modeled nondeterministically and do not include numeric timers.
- This is an initial spec intended as a starting point for increased formality; we can extend it to include concurrency (multiple requests), timers, and fairness as required.

Next steps (optional):
- Add fairness constraints and liveness properties (e.g., ``if failures stop then eventually CLOSED`` under recovery fairness assumptions).
- Model multiple providers and FallbackAIClient interactions to verify that fallback policies preserve availability and avoid consuming fallback resources prematurely.
