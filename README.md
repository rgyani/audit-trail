 ## Distributed Audit Trail & Forensic Logging System
 
 ### Summary
 
 This repository provides a production-ready reference implementation for a centralized Audit Trail System.   
 The solution captures every request originating from frontend and mobile clients—ranging from sensitive trades to simple data reads—to support forensic analysis and SOC alerting.
 
 **Key Objective:** High-throughput, immutable logging with minimal impact on user-facing latency
 
 ### Architecture & Strategy (ADR Summary)
 [The design](ADR.md) follows an AWS Cloud-Native Strategy focused on reliability and cost-efficiency:
 * **Ingestion:** A Node.js GraphQL Interceptor extracts metadata (User ID, IP, Device ID, Operation Name, Arguments) and JWT permissions (e.g., FINANCE_ADMIN).
 * **Streaming:** AWS Kinesis Data Streams is used for real-time ingestion, allowing the SOC to write alerting rules for specific claims like MFA_VERIFIED.
 * **Long-term Storage:** Data is archived in AWS S3 for immutable, tamper-proof forensic storage.
 * **Privacy:** Personally Identifiable Information (PII) is handled via field-level masking before ingestion to ensure security compliance.

### ADR Attached: [ADR.md](ADR.md)


### Running the Proof-of-Concept
The environment is fully containerized using Docker Compose to simulate a production ECS Fargate environment.

#### Prerequisites
    * Docker & Docker Compose
    * AWS CLI (for manual verification)
  
#### Launch the Stack
This command spins up LocalStack (Kinesis/SSM), builds the GraphQL Gateway, and executes the k6 load test.

```bash
docker-compose up --build --exit-code-from k6
```

### Manual Verification
Verify that the audit stream is active in the simulated AWS environment:
```bash
aws --endpoint-url=http://localhost:4566 kinesis list-streams
```


### Performance Validation Report
As part deliverables, the system was stress-tested to validate throughput and latency overhead.

#### Test Results (Baseline PoC)
| Metric | Result| 
|---|---|
| Total Requests| 47,128|
| Success Rate | 100.00% (Zero log loss) |
| Throughput | ~391.04 RPS | 
| p95 Latency | 5.78 seconds|

### Technical Analysis & Gap Assessment
The PoC achieved 100% **reliability**, ensuring no logs were lost under heavy load. However, the observed latency (p95 = 5.78s) exceeds the target for a production gateway.

**Root Cause:**   
The current interceptor utilizes a synchronous dispatch pattern, waiting for Kinesis acknowledgement before resolving the GraphQL request. In a local Docker environment, this I/O wait time compounds under high concurrency.


## Implementation Status & Time Trade-offs
This submission prioritizes **architectural clarity over implementation completeness**. Given the 4-hour time box, the following trade-offs were made:

#### Time Allocation
- **Architecture & ADR**: 2 hours (designing cloud-native strategy, cost analysis, security model)
- **Reference Implementation**: 2.5 hours (GraphQL interceptor, Docker setup, k6 script)
- **Performance Testing & Documentation**: 0.5 hours (running tests, capturing results)

#### Deliberately Simplified for Scope
1. **Synchronous Dispatch (MVP)**: The interceptor uses single-record `putRecord()` for clarity, not production-grade batching
2. **No PII Masking Logic**: Field-level masking documented in ADR but not implemented in code
3. **No Event Idempotency**: UUIDs not generated; duplicate detection logic omitted
4. **Mock GraphQL Context**: Uses hardcoded context instead of integrating with actual GraphQL resolver chain
5. **No JWT Validation**: Assumes JWT claims are already extracted; no signature verification

## Production-Grade Improvements (Prioritized Roadmap)

If scaling to 100M requests/day, these enhancements are **critical**:

### Phase 1: Performance (Closes the 1,200 RPS gap)
**Priority: CRITICAL** | **Effort: 4-6 hours** | **Impact: 3-4x throughput improvement**

1. **Async Batching Queue**
   - Replace single `putRecord()` with an in-memory queue that batches events
   - Flush every 100ms or after 50 records, whichever comes first
   - Use `putRecords()` instead of `putRecord()` (cheaper, fewer API calls)
   - Estimated p95 latency reduction: 5.78s → ~50-100ms

2. **Non-blocking Dispatch**
   - Move Kinesis put into background worker thread
   - Immediately resolve GraphQL request without waiting for Kinesis ACK
   
**Estimated Result:** 1200+ RPS with p95 latency < 100ms

### Phase 2: Security & Compliance (Closes the PII gap)
**Priority: HIGH** | **Effort: 3-4 hours** | **Impact: Regulatory compliance**

1. Implement PII Masking Middleware
   ```typescript
   // Pseudocode
   const PII_WHITELIST = ['userId', 'operation', 'timestamp', 'permissions'];
   
   function maskSensitiveFields(auditEvent) {
     return Object.keys(auditEvent).reduce((acc, key) => {
       acc[key] = PII_WHITELIST.includes(key) 
         ? auditEvent[key] 
         : hash(auditEvent[key]);
       return acc;
     }, {});
   }
2. JWT Token Validation
    - Verify token signature using public key from identity provider
    - Decode claims without trust if signature invalid
    - Extract mfa_verified, permissions, roles from verified claims
    - Attach as-is to audit event for SOC alerting *rules*
3. Immutable Event IDs
    - Generate deterministic ID: eg. hash(userId + operationName)
    - Enables duplicate detection in downstream systems
    - Allows audit event deduplication across retries

**Estimated Result:** Achieves compliance requirements for PII handling and forensic accuracy
  
### Phase 3: Reliability & Observability (Closes the operational gap)
**Priority: HIGH | Effort: 2-3 hours | Impact: Production readiness**

1. Circuit Breaker for Kinesis Failures
    - If Kinesis is down, don't fail the user request (audit loss is acceptable, but trading performance is not)
    - Circuit breaker opens after 5 consecutive failures
    - Metrics: audit_dispatch_failures and circuit_breaker_opens to CloudWatch
    - Alerting
2. Dead Letter Queue (DLQ)
    - Failed events written to S3 DLQ bucket for replay
    - Separate process monitors DLQ and retries when Kinesis recovers
3. Metrics & Dashboards
   - Emit latency of audit dispatch as CloudWatch metric (audit_dispatch_latency_ms)
   - Track queue depth (audit_queue_depth)
   - Monitor Kinesis shard iterator validity (avoid "ExpiredIteratorException")
   - Dashboard: p50, p95, p99 latencies; success rate; queue backlog
4. Distributed Tracing
    - Add X-Trace-ID header to correlate GraphQL request with audit events
    - Enables debugging: "user complained about slow trade, let's find the audit trail"

**Estimated Result:** Production observability and failure resilience

### Phase 4: Integration & Testing (Closes the validation gap)
**Priority: MEDIUM | Effort: 3-4 hours | Impact: Confidence in correctness**

1. Real GraphQL Schema Integration
    - Replace mock context with actual Apollo Server integration
    - Parse real operations: query loadPortfolio { ... }, mutation placeOrder { ... }
    - Extract typed arguments from GraphQL AST
2. End-to-End Tests
    - Integration test: GraphQL request → Kinesis → verify event in stream
    - Mutation test: Inject Kinesis failure, verify fallback behavior
    - Idempotency test: Send same event twice, verify deduplication works downstream
3. Load Test Refinement
    - Expand k6 script to test all mutations: placeOrder, readPersonalData, loadPortfolio
    - Vary payload sizes (small reads vs. large position arrays)
    - Test burst traffic (5-minute spike to 2x RPS) to validate backpressure
4. Chaos Testing
    - Simulate Kinesis intermittent failures
    - Simulate network partition (Docker network tc command)
    - Verify audit trail consistency across failure modes


### AI Usage Disclosure
AI tools were utilized to assist in the following areas:
1. Cost estimation calculations
2. Optimizing Docker multi-stage build layers (Debian-slim vs. Alpine).
3. Scaffolding the k6 load test script logic.
4. Refining the Architecture Decision Record (ADR) structure for clarity
5. Polishing the README