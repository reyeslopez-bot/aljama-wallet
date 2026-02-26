# Security Hardening Guide

This document covers key management, vault re-encryption, and the anomaly/risk pipeline.

## Key Management

Recommended baseline:
- Use a KMS/HSM to protect the master wallet key.
- Decrypt the master key at boot and place it in a tmpfs/secret file.
- Configure the app to read from the file provider.

Required environment variables:
- `WALLET_KEY_PROVIDER=file`
- `WALLET_KEY_FILE_V1=/run/secrets/aljama-wallet-key-v1`
- `WALLET_ENCRYPTION_KEY_ACTIVE_VERSION=1`
- `WALLET_ENCRYPTION_KEY_FINGERPRINT_V1=<sha256-hex>`

If you must use environment variables:
- `WALLET_KEY_PROVIDER=env`
- `WALLET_ENCRYPTION_KEY_V1=<hex-or-base64>`

## Vault Re-Encryption

The migration script re-encrypts existing wallets with the active key and new AAD/HKDF context.

Example (Cockroach only):
```bash
WALLET_CRYPTO_ALLOW_LEGACY=true \
WALLET_ENCRYPTION_KEY_ACTIVE_VERSION=2 \
WALLET_ENCRYPTION_KEY_V2=<new-hex> \
WALLET_ENCRYPTION_KEY_FINGERPRINT_V2=<sha256-hex> \
MIGRATE_TARGET=crdb \
pnpm security:migrate-wallet-keys
```

Dry run:
```bash
DRY_RUN=true MIGRATE_TARGET=crdb pnpm security:migrate-wallet-keys
```

After migration:
- Set `WALLET_CRYPTO_ALLOW_LEGACY=false`.
- Rotate old keys out of runtime.

## Risk and Anomaly Scoring

The transfer pipeline now scores every send and can deny or require review based on:
- Transfer velocity in a rolling window.
- New destination addresses.
- New chain usage.
- High amount relative to daily limit.
- Optional absolute wei thresholds.

Configure thresholds with:
- `RISK_VELOCITY_WINDOW_MS`
- `RISK_VELOCITY_MAX_TX`
- `RISK_REVIEW_SCORE`
- `RISK_DENY_SCORE`
- `RISK_HIGH_AMOUNT_PCT`
- `RISK_ABSOLUTE_WEI`

Optional AI scorer:
- `RISK_AI_ENDPOINT`
- `RISK_AI_TOKEN`
- `RISK_AI_REQUIRED=true` to fail closed in strict mode.

## Breach-Assumed Detection and Alerting

The app now records security signals across auth, telemetry, wallet tracking, internal debug access, and wallet send routes.

## Distributed Rate Limit Enforcement

Rate limiting supports memory and Redis-backed distributed counters.

Backend selection:
- `SECURITY_RATE_LIMIT_BACKEND=memory|redis`
- `SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED=true|false`

Redis settings:
- `SECURITY_RATE_LIMIT_REDIS_URL` (falls back to `REDIS_URL`)
- `SECURITY_RATE_LIMIT_PREFIX` (default: `security:rate-limit`)

Behavior:
- If `SECURITY_RATE_LIMIT_BACKEND=redis` and Redis is unavailable:
  - with `SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED=true`: rate limiting fails closed (requests are blocked).
  - with `SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED=false`: the app degrades to in-memory limits and marks degraded backend health.
- Backend health is exposed in `GET /api/security/anomalies` under `rateLimit`.

Signal input interfaces:
- Direct function path: `recordSecuritySignal(...)` for in-process route instrumentation.
- Queue-backed service path: `ingestSecuritySignal(...)` / `ingestSecuritySignalsBatch(...)`.
- Internal API path: `POST /api/security/signals` (token required) for external producers/event-bus forwarders.

Queue adapter architecture:
- Adapter contract:
  - `enqueue(signal)`
  - `dequeue(batchSize)`
  - `ack(message)`
  - `getStats()`
- Concrete adapters:
  - `InMemoryQueueAdapter` for local/dev and test flows
  - `RedisQueueAdapter` (Redis Streams) for durable ingestion across process restarts
- Backend selection:
  - `SECURITY_SIGNAL_QUEUE_BACKEND=in_memory|redis`
  - `SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE=true|false`
- Startup behavior:
  - Redis backend performs a health check on boot.
  - If Redis client/module is unavailable:
    - with `SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE=true`, queue initialization fails closed.
    - with `SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE=false`, adapter falls back to in-memory and emits degraded health metadata.

Ingestion resilience:
- Optional normalization layer maps raw payloads (`status`, `ip`, `path`, `timestamp`) to canonical signal fields.
- Backpressure controls with bounded queue depth and overflow strategy:
  - `SECURITY_SIGNAL_QUEUE_OVERFLOW_STRATEGY=drop_oldest|reject_new`
  - high/low watermark throttling:
    - `SECURITY_SIGNAL_QUEUE_HIGH_WATER`
    - `SECURITY_SIGNAL_QUEUE_LOW_WATER`
- Retry controls for transient failures:
  - `SECURITY_SIGNAL_QUEUE_MAX_RETRIES`
  - `SECURITY_SIGNAL_QUEUE_RETRY_BASE_MS`
  - `SECURITY_SIGNAL_QUEUE_RETRY_MAX_MS`

Redis streams model:
- stream key namespace: `security:signals` (configurable via `SECURITY_SIGNAL_REDIS_STREAM`)
- producer: `XADD`
- consumer group: `XGROUP CREATE ... detectionGroup`
- workers: `XREADGROUP GROUP ...`
- pending recovery: `XAUTOCLAIM` + `XPENDING`
- queue visibility: `XLEN`, `XPENDING`, `XINFO GROUPS`

Implemented anomaly classes:
- Repetitive anomalies:
  - velocity spikes per IP/source
  - failure bursts
  - multi-principal probing from a single IP (credential stuffing pattern)
- Non-repetitive anomalies:
  - impossible-travel geo jumps for the same session/device
  - one-off probes of internal-only routes
  - sensitive actions from a previously unseen country

Rule-engine semantics:
- Repetitive anomaly: repeated events crossing threshold in sliding windows.
  - Example: `failure.burst` from one IP/source in configured window.
- Non-repetitive anomaly: single event with intrinsically high risk score.
  - Example: `probe.internal_route` unauthorized internal route hit.
- Rule evaluation is stateful (window counters, identity geo history).
- Rules are pluggable and runtime-configurable:
  - enable list: `SECURITY_ANOMALY_RULES_ENABLED`
  - disable list: `SECURITY_ANOMALY_RULES_DISABLED`
- Scores map to alert severities (`low` → `critical`) and every repetitive rule includes time-series bucket details.

Alert behavior:
- Every anomaly is logged to server logs.
- Duplicate definition: same `ruleId` + same `source` + same `fingerprint` in the dedup window.
- Dedup key TTL prevents stale suppression and is configurable.
- Duplicate escalation can re-page operators after repeated suppressed events.
- Optional durable dedup state can be stored in Redis TTL keys to survive process restarts.
- Alerts are enriched with SOC metadata:
  - priority (`p1`-`p4`) derived from severity
  - runbook mapping (`ruleId` -> runbook id/title/url)
  - containment recommendation/actions
- Delivery sinks:
  - webhook sink for generic notifications
  - SIEM sink with JSON or CEF payload formatting
  - SOAR sink for incident workflow ingestion and optional auto-containment requests
- Duplicate dispatch policy defaults to first + escalation checkpoints; can be overridden.

Security anomaly configuration:
- `SECURITY_ANOMALY_ALERT_MIN_SEVERITY`
- `SECURITY_ANOMALY_SIGNAL_BUFFER`
- `SECURITY_ANOMALY_EVENT_BUFFER`
- `SECURITY_ANOMALY_RULES_ENABLED`
- `SECURITY_ANOMALY_RULES_DISABLED`
- `SECURITY_ANOMALY_VELOCITY_WINDOW_MS`
- `SECURITY_ANOMALY_VELOCITY_THRESHOLD`
- `SECURITY_ANOMALY_FAILURE_BURST_THRESHOLD`
- `SECURITY_ANOMALY_PRINCIPAL_PROBE_THRESHOLD`
- `SECURITY_ANOMALY_IMPOSSIBLE_TRAVEL_WINDOW_MS`
- `SECURITY_ANOMALY_IMPOSSIBLE_TRAVEL_DISTANCE_KM`
- `SECURITY_SIGNAL_QUEUE_MAX_DEPTH`
- `SECURITY_SIGNAL_QUEUE_DRAIN_BATCH`
- `SECURITY_SIGNAL_QUEUE_DEQUEUE_BATCH`
- `SECURITY_SIGNAL_QUEUE_ACK_TIMEOUT_MS`
- `SECURITY_SIGNAL_QUEUE_MAX_RETRIES`
- `SECURITY_SIGNAL_QUEUE_RETRY_BASE_MS`
- `SECURITY_SIGNAL_QUEUE_RETRY_MAX_MS`
- `SECURITY_SIGNAL_QUEUE_OVERFLOW_STRATEGY`
- `SECURITY_SIGNAL_QUEUE_HIGH_WATER`
- `SECURITY_SIGNAL_QUEUE_LOW_WATER`
- `SECURITY_SIGNAL_QUEUE_BACKEND`
- `SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE`
- `SECURITY_SIGNAL_REDIS_URL`
- `SECURITY_SIGNAL_REDIS_STREAM`
- `SECURITY_SIGNAL_REDIS_GROUP`
- `SECURITY_SIGNAL_REDIS_CONSUMER`
- `SECURITY_SIGNAL_REDIS_BLOCK_MS`
- `SECURITY_SIGNAL_REDIS_MIN_IDLE_MS`

Alert delivery configuration:
- `SECURITY_ALERTS_API_TOKEN` (internal API read access)
- `SECURITY_SIGNAL_INGEST_TOKEN` (internal API write access for signal ingestion)
- `SECURITY_INTERNAL_ALLOWED_IPS` (optional comma-separated IP allowlist for internal-token APIs)
- `SECURITY_ALERT_WEBHOOK_URL`
- `SECURITY_ALERT_WEBHOOK_MIN_SEVERITY`
- `SECURITY_ALERT_SIEM_URL`
- `SECURITY_ALERT_SIEM_FORMAT` (`json` or `cef`)
- `SECURITY_ALERT_SIEM_MIN_SEVERITY`
- `SECURITY_ALERT_SIEM_TIMEOUT_MS`
- `SECURITY_ALERT_SOAR_URL`
- `SECURITY_ALERT_SOAR_MIN_SEVERITY`
- `SECURITY_ALERT_SOAR_TIMEOUT_MS`
- `SECURITY_ALERT_DISPATCH_ALL_DUPLICATES`
- `SECURITY_ALERT_RUNBOOK_BASE_URL`
- `SECURITY_ALERT_RUNBOOK_MAP` (JSON map override by rule id)
- `SECURITY_ALERT_AUTO_CONTAIN_ENABLED`
- `SECURITY_ALERT_AUTO_CONTAIN_REPETITIVE_ONLY`
- `SECURITY_ALERT_AUTO_CONTAIN_RULES` (CSV rule ids)
- `SECURITY_ALERT_CONTAINMENT_MIN_SEVERITY`
- `SECURITY_ALERT_CONTAINMENT_TIMEOUT_MS`
- `SECURITY_ALERT_CONTAINMENT_ACTION_MAP` (JSON map override by rule id)
- `SECURITY_ALERT_DEDUP_WINDOW_MS`
- `SECURITY_ALERT_DEDUP_TTL_MS`
- `SECURITY_ALERT_DEDUP_BACKEND`
- `SECURITY_ALERT_REDIS_URL`
- `SECURITY_ALERT_REDIS_PREFIX`
- `SECURITY_ALERT_DUPLICATE_ESCALATE_AFTER`
- `SECURITY_ALERT_DUPLICATE_ESCALATE_EVERY`
- `SECURITY_ALERT_MAX_BUFFER`
- `SECURITY_ALERT_WEBHOOK_TIMEOUT_MS`

Operational read endpoint:
- `GET /api/security/anomalies` (internal token required)
Operational write endpoint:
- `POST /api/security/signals` (internal token required)

## Persistent Forensic State

Security forensics now writes durable records to Postgres when configured (`PG_DATABASE_URL` or `POSTGRES_URL`):
- `SecuritySignalEvent` for ingested/processed security signals.
- `SecurityAnomalyEvent` for detected anomalies linked to source signal IDs.
- `SecurityAlertEvent` for emitted alerts and delivery metadata.
- `XrplAction` for canonical XRPL action state.
- `XrplActionEvent` as append-only XRPL action ledger entries (`created`/`updated`).

Read behavior:
- `GET /api/security/anomalies` reads from durable forensic tables when available, with in-memory fallback.
- `GET /api/xrpl/action-history` reads from durable `XrplAction` state when available, with in-memory fallback.

Retention and archival policy:
- `SECURITY_FORENSIC_SIGNAL_RETENTION_DAYS`
- `SECURITY_FORENSIC_ANOMALY_RETENTION_DAYS`
- `SECURITY_FORENSIC_ALERT_RETENTION_DAYS`
- `SECURITY_FORENSIC_XRPL_EVENT_RETENTION_DAYS`
- `SECURITY_FORENSIC_XRPL_ACTION_RETENTION_DAYS`
- `SECURITY_FORENSIC_CLEANUP_INTERVAL_MS`
- `SECURITY_FORENSIC_ARCHIVE_BATCH_SIZE`
- `SECURITY_FORENSIC_ARCHIVE_DIR` (optional NDJSON archival before deletion)

Maintenance runs opportunistically during forensic writes and is throttled by cleanup interval.

Production baseline example:
```bash
SECURITY_FORENSIC_SIGNAL_RETENTION_DAYS=90
SECURITY_FORENSIC_ANOMALY_RETENTION_DAYS=180
SECURITY_FORENSIC_ALERT_RETENTION_DAYS=365
SECURITY_FORENSIC_XRPL_EVENT_RETENTION_DAYS=365
SECURITY_FORENSIC_XRPL_ACTION_RETENTION_DAYS=365
SECURITY_FORENSIC_CLEANUP_INTERVAL_MS=3600000
SECURITY_FORENSIC_ARCHIVE_BATCH_SIZE=1000
SECURITY_FORENSIC_ARCHIVE_DIR=/var/log/aljama/forensics-archive
```

## Notes on Quantum Threats

Current Ethereum ECDSA is not quantum-safe. This app can harden custody and policy controls, but cannot make on-chain signatures quantum-secure. A quantum-safe upgrade requires chain-level protocol changes.
