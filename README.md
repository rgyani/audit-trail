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

### Running the Proof-of-Concept
The environment is fully containerized using Docker Compose to simulate a production ECS Fargate environment.

#### Prerequisites
    * Docker & Docker Compose
    * AWS CLI (for manual verification)
    * 
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

**Production Roadmap to 1,200 RPS:**  
To scale to 100M requests/day , the following optimizations are prioritized:
* **Asynchronous Batching:** Transition to a non-blocking background worker using putRecords to group events, reducing I/O overhead.
* **Internal Buffering:** Implement an in-memory queue with backpressure limits to decouple logging ingestion from client response times.
* **Horizontal Scaling:** Deploy across multiple ECS Fargate tasks with a shared Kinesis shard strategy to handle peak bursts.
  
### AI Usage Disclosure
AI tools were utilized to assist in the following areas:
1. Optimizing Docker multi-stage build layers (Debian-slim vs. Alpine).
2. Scaffolding the k6 load test script logic.
3. Refining the Architecture Decision Record (ADR) structure for clarity