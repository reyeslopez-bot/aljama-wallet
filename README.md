# Aljama Wallet

Aljama Wallet is a Next.js application for encrypted custody, EVM transaction controls, XRPL operations, telemetry, and security-signal detection.

## 1. System Topology

- **Frontend**: Next.js App Router under `app/[locale]`, client components under `components/*`, state hooks in `hooks/*`.
- **API layer**: Route handlers under `app/api/*` with validation and standardized error/response helpers in `lib/security/*`.
- **Data**:
  - **CockroachDB (OLTP)** via `prisma/crdb/schema.prisma` for wallet state and chain/XRPL records.
  - **PostgreSQL (OLAP + control plane)** via `prisma/pg/schema.prisma` for auth/sessioning, telemetry, risk decisions, idempotency keys, and security forensic streams.
- **Security pipeline**: Redis Streams for durable security-signal ingestion and alert-delivery fan-out, with PostgreSQL as the control-plane store for forensic receipts and stateful workflows.

## 2. Security Assessment (Current Risks + Mitigations)

### 2.1 Threat Surfaces

1. **Custody and signing**
   - Private key material persistence and signing backend routing.
2. **Transaction orchestration**
   - Replay, duplicate submission, nonce replacement race conditions.
3. **XRPL side effects**
   - Partial-failure state drift between action logs and chain finality.
4. **Telemetry and security-signal endpoints**
   - Abuse, poisoning, or blind spots due to dropped/invalid events.
5. **Cross-service control plane**
   - Weak enforcement if idempotency/rate-limit consistency is not shared across replicas.

### 2.2 High-Probability Issues and Mitigations

#### A) Key custody compromise blast radius

**Issue**

- Wallet rows include encrypted key material and key metadata; compromise of encryption controls can expose signer capability.

**Mitigations**

- Enforce key-provider abstraction with HSM/KMS-backed wrapping keys for production.
- Versioned key rotation + re-encryption migration jobs with auditable checkpoints.
- Strictly separate read paths from signing paths; no plaintext key return in API surface.
- Add periodic canary decrypt/sign verification jobs and anomaly alerts on signer backend drift.

#### B) Duplicate transfer / replay under concurrency

**Issue**

- Idempotency exists but distributed consistency can degrade if not uniformly enforced on all mutating routes.

**Mitigations**

- Use centralized idempotency reservation (single datastore + TTL + unique scope/key) for **all** transfer and XRPL mutation routes.
- Persist and enforce request fingerprint hash (walletId + target + amount + nonce-policy) to detect semantic duplicates.
- Add conflict telemetry counters and SLO alarms on duplicate-denied vs duplicate-accepted ratio.

#### C) Rate-limit bypass across replicas

**Issue**

- In-memory fallback can allow per-instance bypass under horizontal scaling.

**Mitigations**

- Run with distributed limiter as hard requirement in production.
- Fail closed on distributed limiter outages for high-risk mutation routes.
- Segment buckets by route class (auth, wallet mutate, telemetry ingest) and principal dimensions (IP hash, session, wallet, user).

#### D) Event pipeline data loss

**Issue**

- Queue/storage interruptions can produce blind spots in anomaly detection and forensic replay.

**Mitigations**

- Redis Streams required in production for event ingestion/fan-out, with no in-memory fallback.
- Persist forensic receipts before enqueueing outbound alert delivery work.
- Persist ingress receipt before async processing when route is marked forensic-critical.
- Backfill reconciler that compares ingress counts vs anomaly/alert counts per window.

#### E) XRPL finality and action-status divergence

**Issue**

- API action status can differ from eventual ledger result under retries or network issues.

**Mitigations**

- State machine with explicit statuses (`queued`, `submitted`, `validated`, `failed`, `replaced`).
- Reconciliation worker keyed by `txHash`/`actionId` with bounded retry and terminal reason codes.
- Require idempotency keys on every XRPL mutation endpoint.

#### F) Observability gaps

**Issue**

- Missing correlation IDs across frontend -> API -> worker -> DB reduces incident response speed.

**Mitigations**

- Enforce request correlation ID propagation into telemetry/security/risk events.
- Standardize structured logging fields (route, walletId, actionId, idempotencyKey, traceId).
- Add operational dashboards for auth abuse, transfer denial reasons, XRPL failure classes, queue lag.

## 3. Database Schemas (What Exists, Risks, Mitigations)

## 3.1 CockroachDB schema (`prisma/crdb/schema.prisma`)

### Core models

- `Wallet`: canonical custody wallet record with address, policy json, encrypted key fields, PQC binding metadata.
- `WalletAddress`: multi-chain/network address mapping.
- `Policy` + `PolicyEvent`: policy config and policy decision/event audit.
- `ChainTransaction` + `TokenTransfer`: EVM movement records with replacement and confirmation metadata.
- `ChainBlock`, `ChainIndexTransaction`, `ChainLog`: indexer-side chain data for reconciliation.
- `XrplTransaction`, `XrplLedgerEvent`, `XrplTrustLine`, `XrplNftToken`: XRPL transaction and object state.
- `WalletPqcAnchor`: on-chain PQC binding anchor records.
- `InternalOperation`: internal transfer bookkeeping.

### Likely future issues

- Hot indexes around `createdAt` on high-write tables causing write amplification.
- JSON-heavy fields (`policy`, `payloadJson`, raw tx/result blobs) growing row size and query latency.
- Missing partitioning/TTL strategy for indexer/event tables.
- Potential uniqueness contention on tx hash indices during replay/reorg handling.

### Mitigations

- Introduce time partitioning/TTL for immutable event tables (`ChainLog`, `XrplLedgerEvent`, completed tx archives).
- Move large raw payloads to compressed object storage with reference IDs when retention exceeds hot window.
- Add background consistency checks (wallet address uniqueness, tx hash canonicalization, orphaned refs).
- Define explicit reorg/replacement handling contract (upsert semantics + tombstone markers).

## 3.2 PostgreSQL schema (`prisma/pg/schema.prisma`)

### Core models

- Auth/session: `User`, `Account`, `Session`, `VerificationToken`, `UserWallet`.
- Product analytics: `TelemetryEvent`, `TrackWalletEvent`, `Signup`, `DailyTransactionSummary`.
- Control/risk: `IdempotencyKey`, `WalletTransferLog`, `RiskDecision`.
- Security forensics: `SecuritySignalEvent`, `SecurityAnomalyEvent`, `SecurityAlertEvent`.
- XRPL action plane: `XrplAction`, `XrplActionEvent`.

### Likely future issues

- Unbounded growth in telemetry/security tables.
- Query skew from broad JSON filters without computed/indexed facets.
- Idempotency TTL expiry races causing late replay acceptance.
- Divergence risk if OLTP wallet state and OLAP transfer/risk logs are not reconciled.

### Mitigations

- Retention policy + archival pipeline per table class (telemetry vs forensic vs control logs).
- Materialized rollups for dashboard queries; keep raw events append-only.
- Add deterministic replay-protection window aligned with blockchain finality and product SLA.
- Scheduled cross-database reconciliation jobs for wallet transfers, risk outcomes, and XRPL action status.

## 4. UI/UX Flows (Frontend + Backend + Improvement Plan)

## 4.1 Entry/Auth/Consent Flow

### Current flow

1. User lands on localized home route.
2. User enters auth gate/login flow.
3. Consent gate determines access progression.
4. Session-aware UI enables wallet workspace modules.

### Frontend responsibilities

- Route composition, stage gating, locale rendering, wallet-intent CTA orchestration.

### Backend responsibilities

- Registration/auth config/session handling and consent-dependent protected routes.

### Failure modes

- Stage fragmentation (multiple heavy gates) can reduce continuity.
- Duplicated motion/state logic increases regression risk.
- Auth error handling can be inconsistent across gate surfaces.

### Improvements

- Single stage machine (`locked` -> `consent-required` -> `wallet-ready`) shared across gate/workspace.
- Consolidate scene animation orchestration hooks to reduce duplicated logic.
- Unify auth error payload contracts and localized rendering strategy.

## 4.2 Wallet Creation + Retrieval Flow

### Current flow

- Create wallet via API, persist custody record, expose wallet list/detail endpoints.

### Frontend responsibilities

- Trigger create/connect actions, render wallet inventory and stateful status.

### Backend responsibilities

- Validate payload, create wallet, enforce policy constraints, serve wallet summary/detail.

### Failure modes

- Duplicate creation attempts under retries.
- Incomplete post-create metadata hydration.

### Improvements

- Idempotency key required on wallet-creation path.
- Async enrichment status field + polling/subscription for deterministic UI states.

## 4.3 EVM Send Flow

### Current flow

- Initiate send request -> ownership/policy/risk checks -> tx submission -> transfer logs and chain sync.

### Frontend responsibilities

- Parameter capture, confirmation UX, in-flight/replaced/finalized transaction state display.

### Backend responsibilities

- Policy + risk decisioning, idempotency reservation, tx execution, persistence, sync monitoring.

### Failure modes

- Nonce replacement confusion in UI.
- Ambiguous denial reasons from risk/policy engine.

### Improvements

- Expose explicit state transitions (`pending`, `submitted`, `replaced`, `confirmed`, `failed`).
- Return machine-readable denial codes + suggested next action for UI.
- Add per-wallet tx timeline endpoint with replacement chain collapse.

## 4.4 XRPL Operations Flow

### Current flow

- Trustline/NFT/offer/orderbook/action-history operations through XRPL route set.

### Frontend responsibilities

- Compose XRPL forms, validate network context, show ledger-result timeline.

### Backend responsibilities

- Submit XRPL ops, capture action/event history, reconcile final ledger outcomes.

### Failure modes

- Ledger propagation latency represented as hard failure.
- Partial persistence between action table and transaction table.

### Improvements

- Pending-validation UX with auto refresh/backoff.
- Canonical XRPL action DTOs across all endpoints.
- Strong reconciliation worker with terminal-state guarantees.

## 4.5 Security Telemetry Flow

### Current flow

- API receives telemetry/security signals -> Redis Streams ingestion -> anomaly rules -> persisted alert receipt -> alert-delivery queue/worker.

### Frontend responsibilities

- Emit telemetry events with consistent context and consent gates.

### Backend responsibilities

- Validate/normalize events, detect anomalies, dedup/escalate alerts, persist for forensics.
- Use PostgreSQL-backed state machines for signing intents and other control-plane jobs; do not route those workflows through the event queue.

### Failure modes

- Event schema drift between producers.
- Alert fatigue without calibrated severity/priority mapping.

### Improvements

- Versioned telemetry/security event schema + strict validation.
- Feedback loop from SOC triage to rule tuning.
- End-to-end delivery SLOs with lag/error budgets.
- In production, in-memory queueing is development/test only and must not be used for security ingestion or alert delivery.

## 5. API Inventory (Routes, Function, Risk, Improvement)

## 5.1 Utility and diagnostics

- `GET /api/_debug/env` — runtime/env diagnostics (restrict to non-prod); risk: data leakage; improve with hard environment guard + redaction.
- `GET /api/test-db` — database connectivity test; risk: misuse in production; improve with internal token + non-prod enforcement.

## 5.2 Auth and identity

- `GET|POST /api/auth/[...nextauth]` — NextAuth handlers; risk: callback abuse/session fixation; improve with strict callback allowlist and session rotation.
- `GET /api/auth/config` — auth client configuration; risk: overexposed internals; improve minimal response surface.
- `POST /api/auth/register` — credential registration; risk: brute force/disposable email abuse; improve with adaptive rate limits + verification workflow.

## 5.3 Wallet and transfers

- `POST /api/create-wallet` — create custody wallet.
- `GET /api/wallets` — list wallets.
- `GET /api/wallet/[id]` — wallet details.
- `POST /api/wallet/send` — generic wallet send.
- `POST /api/wallet/[id]/send` — wallet-specific send.
- `GET /api/wallet/[id]/transactions` — transaction history.
- `POST /api/wallet/[id]/pqc/anchor` — create PQC anchor for wallet binding.

**Primary risks**: idempotency holes, authorization bypass on wallet-scoped routes, replay/nonce races.

**Improvements**:

- Mandatory idempotency on all mutation routes.
- Uniform ownership check middleware.
- Consistent typed error codes (`WALLET_NOT_OWNED`, `IDEMPOTENCY_REPLAY`, `RISK_DENIED`).

## 5.4 XRPL operations

- `GET /api/xrpl/dev-account`
- `GET /api/xrpl/account-assets`
- `GET /api/xrpl/nfts`
- `GET /api/xrpl/orderbook`
- `GET /api/xrpl/action-history`
- `POST /api/xrpl/trustline/set`
- `POST /api/xrpl/nft/mint`
- `POST /api/xrpl/nft/offer/create`
- `POST /api/xrpl/nft/offer/accept`
- `POST /api/xrpl/nft/offer/cancel`
- `POST /api/xrpl/trade/offer/create`
- `POST /api/xrpl/trade/offer/cancel`
- `POST /api/xrpl/pqc/anchor`

**Primary risks**: network mismatch, stale sequence handling, eventual consistency misreported as hard failure.

**Improvements**:

- Explicit network + sequence preflight endpoints.
- Shared XRPL mutation contract with required idempotency and deterministic status envelopes.
- Ledger finality reconciler metrics exposed for operations dashboards.

## 5.5 Telemetry, analytics, public metadata

- `POST /api/telemetry` — product telemetry ingestion.
- `POST /api/track-wallet` — wallet connection/track event ingestion.
- `POST /api/signup` — signup capture.
- `GET /api/market-snapshot` — market data snapshot.
- `GET /api/network-location` — network geolocation/context utility.
- `GET /api/tokens-wallet` — token-by-wallet lookup.
- `GET /api/public/pqc-bindings/[bindingHash]` — public PQC binding resolution.

**Primary risks**: payload abuse, cardinality explosion, weak schema governance.

**Improvements**:

- Request size limits + strict schema versions.
- Sampling and aggregation strategy for high-cardinality telemetry.
- Cache-control and rate-limits for public metadata endpoints.

## 5.6 Security APIs

- `POST /api/security/signals` — security signal ingestion.
- `GET /api/security/anomalies` — anomaly retrieval.

**Primary risks**: forged signal spam, queue outages, false-positive floods.

**Improvements**:

- Signed producer identity for privileged sources.
- Durable queue requirement in production.
- Rule quality scorecards (precision/recall proxies from triage outcomes).

## 6. Webhooks, Telemetry, and Alert Delivery

## 6.1 Outbound webhooks/SOC sinks

Security alerts support webhook/SIEM/SOAR style downstream delivery via alert sink configuration.

### Risks

- Delivery failure without retry visibility.
- Silent schema incompatibility with external SOC systems.
- Duplicate alerts during transient retries.

### Mitigations

- Idempotency token per outbound alert payload.
- Exponential backoff + dead-letter channel + replay tooling.
- Sink contract tests in CI against example webhook/SIEM fixtures.

## 6.2 Telemetry quality controls

### Risks

- Missing consent context, low data trust.
- PII leakage in free-form payloads.

### Mitigations

- Explicit telemetry schema registry and version pinning.
- Ingress scrubbing/redaction policy before persistence.
- Reject unknown high-risk fields in strict mode.

## 7. Targeted Roadmap (Execution Order)

1. **Security enforcement hardening**
   - Distributed rate-limit/idempotency fail-closed on mutation routes.
2. **Data retention + reconciliation**
   - Retention/archival jobs + cross-DB reconciliation workers.
3. **API contract stabilization**
   - Shared error/status envelopes and versioned event schemas.
4. **UI flow consolidation**
   - Single-stage shell and reduced duplicated motion logic.
5. **Operational observability**
   - Dashboards and SLOs for transfer integrity, XRPL reconciliation, and security alert delivery.

## 8. Development Commands

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm dev
```

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

```bash
pnpm test:e2e
pnpm test:frontend
RUN_XRPL_INTEGRATION_TESTS=true pnpm test:integration:xrpl
```
