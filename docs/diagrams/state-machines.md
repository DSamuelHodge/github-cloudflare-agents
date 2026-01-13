# State Machine Diagrams

This page documents state machines for key components in the project.

---

## 1) CircuitBreaker

```mermaid
stateDiagram-v2
  [*] --> CLOSED
  CLOSED --> CLOSED: success
  CLOSED --> CLOSED: failure (failureCount < threshold)
  CLOSED --> OPEN: failureCount >= threshold
  OPEN --> HALF_OPEN: openTimeout elapsed
  HALF_OPEN --> CLOSED: successCount >= successThreshold
  HALF_OPEN --> OPEN: failure
  OPEN --> OPEN: manualKeepOpen/metrics
  CLOSED --> CLOSED: manualReset (resetFailureCount)
```

Notes:
- `failureCount` increments on provider errors; when it reaches `failureThreshold` the breaker transitions to `OPEN`.
- `OPEN` transitions to `HALF_OPEN` after a configured timeout; `HALF_OPEN` allows limited calls for recovery.

---

## 2) FallbackAIClient — Provider Selection Flow

This state machine represents how the fallback client iterates providers and reacts to circuit states and results.

```mermaid
stateDiagram-v2
  [*] --> IDLE
  IDLE --> START: createChatCompletion()
  START --> CHECK_PROVIDER: for provider in chain

  state CHECK_PROVIDER {
    [*] --> READ_CB_STATE
    READ_CB_STATE --> SKIP_IF_OPEN: state == OPEN and not allOpen
    READ_CB_STATE --> ATTEMPT_PROVIDER: state != OPEN or allOpen

    SKIP_IF_OPEN --> NEXT_PROVIDER: skip (do not attempt)
    ATTEMPT_PROVIDER --> ATTEMPTING: call provider
    ATTEMPTING --> SUCCEEDED: returned choice(s)
    ATTEMPTING --> FAILED: error or invalid response
    FAILED --> RECORD_FAILURE: increment circuit failure
    RECORD_FAILURE --> NEXT_PROVIDER: continue to next provider
  }

  NEXT_PROVIDER --> CHECK_PROVIDER: iterate
  SUCCEEDED --> COMPLETE: return success
  CHECK_PROVIDER --> ALL_FAILED: no providers left
  ALL_FAILED --> [*]
  COMPLETE --> [*]
```

Notes:
- If *all* providers are `OPEN`, FallbackAIClient will attempt providers anyway (force attempts to allow recovery).
- On a provider `FAILED` result, FallbackAIClient records failures via the provider's circuit breaker.

---

## 3) Agent Lifecycle

```mermaid
stateDiagram-v2
  [*] --> REGISTERED
  REGISTERED --> ACTIVATING: register
  ACTIVATING --> ACTIVE: init successful
  ACTIVATING --> ERROR: init failed
  ACTIVE --> PAUSED: admin pause or rate limiting
  PAUSED --> ACTIVE: resume
  ACTIVE --> DECOMMISSIONED: remove
  ERROR --> RETRYING: retry init
  RETRYING --> ACTIVE: success
  RETRYING --> DECOMMISSIONED: repeated failure
```

Notes:
- Agents follow a clear lifecycle from registration to active service; operational tooling can pause/resume or decommission agents.

---

## 4) StreamingService (WebSocket) Connection State

```mermaid
stateDiagram-v2
  [*] --> DISCONNECTED
  DISCONNECTED --> CONNECTING: open socket
  CONNECTING --> OPEN: handshake success
  OPEN --> SUBSCRIBED: subscribe to job
  OPEN --> DISCONNECTED: close / error
  SUBSCRIBED --> OPEN: unsubscribe
  DISCONNECTED --> RECONNECTING: reconnect scheduler
  RECONNECTING --> CONNECTING
```

Notes:
- Reconnection/backoff policies are implemented externally (reconnect scheduler). Subscribed state is a child state while socket is open.

---

## 5) MetricsCollector

```mermaid
stateDiagram-v2
  [*] --> INITIALIZING
  INITIALIZING --> RUNNING: initialized successfully
  INITIALIZING --> ERROR: KV or binding missing
  RUNNING --> ERROR: runtime error writing to KV
  ERROR --> RECOVERING: manual or automatic retry
  RECOVERING --> RUNNING: recovered
  RUNNING --> ARCHIVING: on schedule -> trigger ArchivalService
```

Notes:
- MetricsCollector writes to KV and relies on the ArchivalService for long-term storage.

---

## 6) ArchivalService

```mermaid
stateDiagram-v2
  [*] --> IDLE
  IDLE --> ARCHIVING: scheduled or manual
  ARCHIVING --> WRITING_TO_R2: serialize & write
  WRITING_TO_R2 --> COMPLETED: success
  WRITING_TO_R2 --> ERROR: write failed
  ERROR --> RETRYING: retry with backoff
  RETRYING --> WRITING_TO_R2
  COMPLETED --> IDLE
```

Notes:
- ArchivalService snapshots metrics from KV to R2 and manages lifecycle (purge/retention).

---

### Files / Usage
- This document contains Mermaid diagrams. Use a renderer (Mermaid Live Editor, Markdown viewer supporting Mermaid, or `mmdc` CLI) to export to SVG/PNG for presentations.
- If you want, I can export these diagrams to SVG and add them to `docs/diagrams/` as standalone assets.

---

If you'd like additional components visualized (Gateway request lifecycle, Alerting flow, Dashboard update flow), tell me which and I'll add them.