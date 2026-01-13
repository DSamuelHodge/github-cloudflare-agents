# Phase 4.1 Stage 4: Observability & Analytics - Execution Contract

**Approved:** January 12, 2026  
**Phase:** 4.1 (Multi-Provider AI Gateway)  
**Stage:** 4 (Observability & Analytics)  
**Status:** 🟡 IN PROGRESS  

---

## Executive Summary

Stage 4 implements comprehensive observability and analytics for the production AI gateway system. This stage builds on the deployed circuit breaker and fallback client (Stage 3) to provide real-time monitoring, performance tracking, and data-driven decision making.

**Success Criteria:**
- Real-time metrics collection from all three providers
- Circuit breaker state and transition tracking
- Provider success/failure rate analytics
- Performance baseline establishment
- Dashboard-ready metrics API
- ≥90% test coverage for new code

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Observability Layer                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Metrics Factory │  │ Analytics    │  │ Health Check │   │
│  │  (singleton)    │  │ Aggregator   │  │ Endpoint     │   │
│  └────────┬────────┘  └──────┬───────┘  └──────┬───────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Data Collection Points                   │
├─────────────────────────────────────────────────────────────┤
│  Circuit Breaker │  Gateway Client  │  Fallback Client     │
│  ✓ State changes │  ✓ Response times │  ✓ Failover events  │
│  ✓ Transitions   │  ✓ Error rates    │  ✓ Provider success │
│  ✓ Durations     │  ✓ Tokens used    │  ✓ Latency          │
└─────────────────────────────────────────────────────────────┘

                    ↓↓↓

┌─────────────────────────────────────────────────────────────┐
│                 Storage & Retrieval                         │
├─────────────────────────────────────────────────────────────┤
│  KV Store        │  R2 Storage      │  Worker Analytics    │
│  • Real-time     │  • Historical    │  • Built-in          │
│  • State snapshots│  • Archival      │  • 24h retention     │
│  • Time-series   │  • Analysis-ready│  • Query API         │
└─────────────────────────────────────────────────────────────┘

                    ↓↓↓

┌─────────────────────────────────────────────────────────────┐
│                  Monitoring Endpoints                       │
├─────────────────────────────────────────────────────────────┤
│  /metrics        │  /analytics      │  /health             │
│  • Real-time data│  • Time-series   │  • Provider status   │
│  • Counters      │  • Aggregations  │  • Circuit states    │
│  • Gauges        │  • Trends        │  • System health     │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Metrics Foundation (8 hours)

#### 1.1 Create MetricsCollector Class
**File:** `src/platform/monitoring/MetricsCollector.ts`

```typescript
interface ProviderMetrics {
  provider: AIProvider;
  requestsTotal: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
  lastSuccessTime: number;
  lastFailureTime: number;
}

interface CircuitBreakerMetrics {
  provider: AIProvider;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastStateChange: number;
  timeSinceStateChange: number;
}

class MetricsCollector {
  // Track metrics per provider
  // Aggregate over time windows
  // Persist to KV
}
```

**Key Methods:**
- `recordRequest(provider)` - Track incoming request
- `recordSuccess(provider, latency)` - Record successful response
- `recordFailure(provider, latency, reason)` - Record failure
- `recordCircuitBreakerStateChange(provider, from, to)` - Track state transitions
- `getProviderMetrics(provider)` - Retrieve current metrics
- `getAggregatedMetrics(timeWindow)` - Get aggregated data

**Tests:** 12 tests covering all metrics operations

#### 1.2 Create AnalyticsService
**File:** `src/platform/monitoring/AnalyticsService.ts`

```typescript
interface AnalyticsSummary {
  timestamp: number;
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  providers: {
    [key in AIProvider]: {
      successRate: number;
      requestCount: number;
      averageLatency: number;
      circuitState: CircuitState;
    }
  };
  failovers: number;
  circuitBreakerEvents: number;
}

class AnalyticsService {
  // Aggregate metrics across all providers
  // Calculate derived metrics (success rate, etc.)
  // Identify trends and anomalies
}
```

**Key Methods:**
- `getSummary()` - Current snapshot
- `getTimeSeries(hours)` - Historical trend
- `getProviderComparison()` - Provider performance ranking
- `detectAnomalies()` - Find unusual patterns

**Tests:** 15 tests covering aggregation logic

#### 1.3 Update Logger for Metrics Integration
**File:** `src/utils/logger.ts` (enhancement)

Add metrics hooks:
```typescript
// When logging errors, automatically record to metrics
// When logging provider events, track in analytics
// Maintain audit trail for debugging
```

**Tests:** 8 tests for logging-metrics integration

---

### Phase 2: Monitoring Endpoints (6 hours)

#### 2.1 Create /metrics Endpoint
**File:** `src/middleware/metrics-endpoint.ts`

**Response:**
```json
{
  "timestamp": 1705070400,
  "metrics": {
    "gemini": {
      "requests_total": 1250,
      "success_count": 1200,
      "failure_count": 50,
      "success_rate": 0.96,
      "average_latency_ms": 245,
      "circuit_state": "CLOSED",
      "failures_before_open": 0
    },
    "huggingface": {
      "requests_total": 430,
      "success_count": 410,
      "failure_count": 20,
      "success_rate": 0.953,
      "average_latency_ms": 320,
      "circuit_state": "CLOSED",
      "failures_before_open": 0
    },
    "anthropic": {
      "requests_total": 120,
      "success_count": 115,
      "failure_count": 5,
      "success_rate": 0.958,
      "average_latency_ms": 280,
      "circuit_state": "CLOSED",
      "failures_before_open": 0
    }
  }
}
```

#### 2.2 Create /analytics Endpoint
**File:** `src/middleware/analytics-endpoint.ts`

**Response:**
```json
{
  "summary": {
    "timestamp": 1705070400,
    "total_requests": 1800,
    "success_rate": 0.956,
    "average_latency_ms": 270,
    "failovers_triggered": 23,
    "circuit_events": 2
  },
  "time_series": [
    {
      "timestamp": 1705070000,
      "requests": 150,
      "success_rate": 0.96,
      "average_latency": 265
    }
  ],
  "provider_ranking": [
    {
      "provider": "gemini",
      "success_rate": 0.96,
      "average_latency": 245,
      "reliability_score": 0.95
    }
  ]
}
```

#### 2.3 Enhance /health Endpoint
**File:** `src/middleware/health-endpoint.ts` (enhancement)

Add detailed provider status:
```json
{
  "status": "healthy",
  "providers": {
    "gemini": {
      "status": "healthy",
      "circuit_state": "CLOSED",
      "last_check": "2m ago",
      "success_rate": 0.96
    }
  }
}
```

**Tests:** 10 tests for all endpoints

---

### Phase 3: Analytics Dashboard Foundation (4 hours)

#### 3.1 Create Dashboard Data Service
**File:** `src/platform/monitoring/DashboardService.ts`

Prepares data for frontend dashboard:
- Time-series data for charting
- Provider comparison data
- Circuit breaker state timeline
- Performance trends

**Tests:** 8 tests for data formatting

#### 3.2 Create Historical Data Archival
**File:** `src/platform/monitoring/ArchivalService.ts`

**Functionality:**
- Move data from KV to R2 for long-term storage
- Compress historical records
- Maintain hourly snapshots
- Enable historical analysis

**Scheduled Job:**
- Run every hour
- Archive metrics older than 24 hours
- Keep last 7 days in KV for real-time queries

**Tests:** 6 tests for archival logic

---

### Phase 4: Integration & Testing (4 hours)

#### 4.1 Integration with Existing Code
- Hook MetricsCollector into FallbackAIClient
- Hook MetricsCollector into CircuitBreaker
- Connect Logger to metrics
- Register new endpoints in middleware pipeline

#### 4.2 Comprehensive Test Suite
**Files:** `tests/phase4.4-metrics.test.ts` - 60+ tests covering:
- Metrics collection accuracy
- Analytics aggregation
- Endpoint responses
- Time-series data
- Anomaly detection
- Data persistence

#### 4.3 Load Testing
**File:** `tests/phase4.4-load.test.ts` - 15 tests:
- High-volume request handling
- Metrics accuracy under load
- Performance impact validation
- KV throughput limits

---

## Data Model

### KV Schema

**Metrics Snapshot (per provider, per minute):**
```
key: metrics:gemini:2026-01-12T14:30:00Z
value: {
  timestamp: 1705070400,
  requests: 45,
  success: 43,
  failures: 2,
  totalLatency: 11025,
  circuitState: "CLOSED",
  failureCount: 0
}
```

**Circuit State History (per provider):**
```
key: circuit:gemini:2026-01-12
value: [
  { time: 1705070100, from: "CLOSED", to: "OPEN", reason: "failure_threshold" },
  { time: 1705070200, from: "OPEN", to: "HALF_OPEN", reason: "timeout" },
  { time: 1705070250, from: "HALF_OPEN", to: "CLOSED", reason: "success" }
]
```

**Daily Summary (per provider):**
```
key: summary:gemini:2026-01-12
value: {
  date: "2026-01-12",
  totalRequests: 12500,
  successCount: 12000,
  failureCount: 500,
  averageLatency: 245,
  peakLatency: 850,
  minLatency: 120,
  failovers: 45,
  circuitOpenEvents: 3,
  circuitRecoveryTime: 125000 // total time spent in OPEN state
}
```

### R2 Schema

**Archive Structure:**
```
s3://github-ai-agent-analytics/
├── 2026-01/
│   ├── 12/
│   │   ├── gemini-hourly.json.gz
│   │   ├── huggingface-hourly.json.gz
│   │   ├── anthropic-hourly.json.gz
│   │   └── summary-daily.json.gz
│   └── 13/
│       └── ...
└── reports/
    ├── weekly-2026-w02.json
    └── monthly-2026-01.json
```

---

## Endpoints Specification

### GET /metrics

**Purpose:** Real-time provider metrics

**Response (200):**
```json
{
  "timestamp": 1705070400000,
  "collection_interval_ms": 60000,
  "metrics": {
    "gemini": {
      "requests_total": 1250,
      "requests_success": 1200,
      "requests_failure": 50,
      "success_rate": 0.96,
      "error_rate": 0.04,
      "latency_avg_ms": 245,
      "latency_p95_ms": 650,
      "latency_p99_ms": 920,
      "circuit_state": "CLOSED",
      "circuit_failures_before_open": 0,
      "last_success_ms_ago": 12,
      "last_failure_ms_ago": 3400,
      "uptime_percentage": 96.0
    }
  },
  "health_status": "healthy"
}
```

### GET /analytics?hours=24

**Purpose:** Time-series analytics and trends

**Query Parameters:**
- `hours`: 1, 6, 24, 168 (default: 24)
- `provider`: gemini, huggingface, anthropic (default: all)

**Response (200):**
```json
{
  "query": {
    "hours": 24,
    "provider": "all",
    "timestamp": 1705070400000
  },
  "summary": {
    "total_requests": 18000,
    "success_rate": 0.956,
    "average_latency_ms": 270,
    "failovers_triggered": 23,
    "circuit_breaker_events": 2,
    "mean_time_between_failures": 782000
  },
  "time_series": [
    {
      "timestamp": 1705070000000,
      "requests": 750,
      "success_rate": 0.96,
      "average_latency": 265,
      "failovers": 1,
      "circuit_events": 0
    }
  ],
  "provider_stats": {
    "gemini": {
      "success_rate": 0.96,
      "average_latency": 245,
      "request_share": 0.69
    }
  },
  "anomalies": []
}
```

### GET /health

**Purpose:** System health status

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": 1705070400000,
  "providers": {
    "gemini": {
      "status": "healthy",
      "circuit_state": "CLOSED",
      "success_rate": 0.96,
      "latency_ms": 245,
      "last_request_ms_ago": 125,
      "confidence": 0.98
    }
  },
  "system": {
    "kv_available": true,
    "r2_available": true,
    "uptime_hours": 48.5
  }
}
```

---

## Deliverables

### Code (New Files)
1. `src/platform/monitoring/MetricsCollector.ts` - Metrics collection (300+ lines)
2. `src/platform/monitoring/AnalyticsService.ts` - Analytics aggregation (250+ lines)
3. `src/platform/monitoring/DashboardService.ts` - Dashboard data prep (200+ lines)
4. `src/platform/monitoring/ArchivalService.ts` - Historical data archival (180+ lines)
5. `src/types/monitoring.ts` - Type definitions (100+ lines)
6. `src/middleware/metrics-endpoint.ts` - Metrics API (120+ lines)
7. `src/middleware/analytics-endpoint.ts` - Analytics API (150+ lines)
8. `src/middleware/health-endpoint.ts` - Enhanced health check (100+ lines)

### Tests (60+ tests)
1. `tests/phase4.4-metrics.test.ts` - Metrics collection (30 tests)
2. `tests/phase4.4-analytics.test.ts` - Analytics aggregation (20 tests)
3. `tests/phase4.4-endpoints.test.ts` - API endpoints (10 tests)

### Documentation
1. `docs/PHASE4_STAGE4_CONTRACT.md` - This file
2. `docs/PHASE4_STAGE4_IMPLEMENTATION.md` - Implementation guide (during execution)
3. `docs/MONITORING_GUIDE.md` - Operations guide

---

## Success Criteria

### Functional Requirements
- [ ] Real-time metrics collection working
- [ ] Analytics aggregation producing correct results
- [ ] All three endpoints responding correctly
- [ ] Circuit breaker events tracked
- [ ] Failover events logged
- [ ] Performance baselines established

### Quality Requirements
- [ ] ≥90% test coverage for new code
- [ ] 0 TypeScript errors
- [ ] 0 ESLint errors
- [ ] All tests passing

### Performance Requirements
- [ ] Metrics collection <1ms per event
- [ ] Analytics query <500ms response time
- [ ] KV writes <100ms
- [ ] No memory leaks in metric aggregation

### Operational Requirements
- [ ] Historical data archived daily
- [ ] 7-day data retention in KV
- [ ] 90-day data retention in R2
- [ ] Metrics API accessible 24/7

---

## Timeline

| Task | Duration | Status |
|------|----------|--------|
| Metrics Foundation | 8 hours | ⏳ |
| Monitoring Endpoints | 6 hours | ⏳ |
| Dashboard Foundation | 4 hours | ⏳ |
| Integration & Testing | 4 hours | ⏳ |
| **Total** | **22 hours** | ⏳ |

**Estimated Completion:** 1-2 days with focused work

---

## Risks & Mitigations

### Risk 1: KV Throughput Limits
**Impact:** Metrics writes could hit KV rate limits  
**Mitigation:** Batch writes, use in-memory aggregation, archive frequently

### Risk 2: Memory Usage Growth
**Impact:** Metrics storage could consume excessive memory  
**Mitigation:** Fixed-size time windows, aggregation, archival to R2

### Risk 3: Metrics Accuracy
**Impact:** Incorrect analytics could lead to wrong decisions  
**Mitigation:** Comprehensive testing, validation, cross-checks

---

## Dependencies

### From Previous Stages
- ✅ CircuitBreaker (Stage 3)
- ✅ FallbackAIClient (Stage 3)
- ✅ GatewayAIClient (Stage 2)
- ✅ Logger (Phase 3)

### External
- KV Namespace (for real-time metrics)
- R2 Bucket (for historical data)
- Cloudflare Workers Analytics Engine (optional, for advanced queries)

---

## Acceptance Criteria

**Stage 4 is complete when:**

1. ✅ All 60+ tests passing
2. ✅ 0 TypeScript errors
3. ✅ 0 ESLint errors
4. ✅ /metrics endpoint returning valid data
5. ✅ /analytics endpoint showing time-series data
6. ✅ /health endpoint showing provider status
7. ✅ Historical data being archived to R2
8. ✅ Circuit breaker state changes tracked
9. ✅ Performance baselines established
10. ✅ Documentation complete

---

## Next Steps

1. **Immediate:** Create metrics collector foundation
2. **Day 1:** Implement analytics service and endpoints
3. **Day 2:** Integrate with existing code and comprehensive testing
4. **Day 3:** Deploy to production and monitor

---

**Contract Approved:** January 12, 2026  
**Execution Start:** Now  
**Expected Completion:** January 14, 2026
