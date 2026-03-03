# Aljama Wallet

Aljama Wallet is a Next.js 16 application for encrypted custody, EVM transaction controls, XRPL operations, and security signal detection.

This document reflects repository state as of February 24, 2026.

## Current Product Scope

Implemented:
- Encrypted wallet creation and custody persistence.
- Invite-gated credentials auth with NextAuth.
- EVM send pipeline with policy checks, idempotency, ownership checks, and risk scoring.
- XRPL operations:
  - trustline set (`TrustSet`)
  - NFT mint (`NFTokenMint`)
  - NFT offers create/accept/cancel
  - token offers create/cancel
  - account assets, orderbook, NFT read, and action history
- Security ingestion + anomaly detection + alerting pipeline with queue adapters.
- Frontend component and Playwright functional tests in CI across Linux, macOS, and Windows.
- Dedicated multi-browser Playwright lane (Chromium/Firefox/WebKit) and production-like real-backend E2E lane.
- Env-gated live XRPL integration test suite for real network behavior/failure modes.

Removed:
- `TikTokFramerFeed` landing-page section and related tests.

## Architecture

Frontend:
- Next.js App Router (`app/[locale]`) with `next-intl` locale support.
- Home experience composed from `components/home/*`.
- Session-aware UI gating (`next-auth/react`).
- Zustand for client-side state (for example XRPL network selection).

Backend/API:
- Route handlers under `app/api/*`.
- Validation via Zod.
- Security helpers in `lib/security/*`:
  - strict mode/runtime checks
  - origin validation
  - token validation for internal routes
  - rate limiting
  - structured API responses

Data:
- CockroachDB schema (`prisma/crdb/schema.prisma`) for custody wallet + chain transaction records.
- Postgres schema (`prisma/pg/schema.prisma`) for auth, telemetry, signups, idempotency, transfer logs, and risk decisions.

Security Pipeline:
- Signal ingestion: `recordSecuritySignal`, `ingestSecuritySignal(sBatch)`, and `POST /api/security/signals`.
- Queue adapter interface:
  - `InMemoryQueueAdapter`
  - `RedisQueueAdapter` (Redis Streams)
- Rule engine for repetitive and non-repetitive anomalies.
- Alert deduplication + severity escalation + SOC delivery sinks (webhook, SIEM JSON/CEF, SOAR) with runbook mapping and optional automated containment requests.

## API Surface (Key Routes)

Auth and account:
- `POST /api/auth/register`
- `GET|POST /api/auth/[...nextauth]`
- `GET /api/auth/config`

Wallet and transfer:
- `POST /api/create-wallet`
- `GET /api/wallets`
- `POST /api/wallet/send`
- `GET /api/wallet/[id]`

Telemetry and tracking:
- `POST /api/telemetry`
- `POST /api/track-wallet`
- `POST /api/signup`

Security operations:
- `POST /api/security/signals`
- `GET /api/security/anomalies`

XRPL:
- `GET /api/xrpl/dev-account`
- `GET /api/xrpl/account-assets`
- `POST /api/xrpl/trustline/set`
- `GET /api/xrpl/nfts`
- `POST /api/xrpl/nft/mint`
- `POST /api/xrpl/nft/offer/create`
- `POST /api/xrpl/nft/offer/accept`
- `POST /api/xrpl/nft/offer/cancel`
- `GET /api/xrpl/orderbook`
- `POST /api/xrpl/trade/offer/create`
- `POST /api/xrpl/trade/offer/cancel`
- `GET /api/xrpl/action-history`

## Security Posture

Implemented controls:
- Strict mode behavior in production.
- Origin checks on sensitive routes.
- Route-level rate limits.
- Redis-backed distributed rate limiting with explicit fail-closed option (`SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED=true`).
- Idempotency key reservation for transaction submission paths.
- Transfer risk scoring with configurable deny/review thresholds.
- Security anomaly scoring with repetitive and non-repetitive rules.
- Alert dedup semantics with TTL windows and escalation.
- Queue adapter health visibility with optional durable fail-closed mode (`SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE=true`).
- Durable forensic persistence for security signals/anomalies and XRPL action state/event history (Postgres-backed).
- Durable alert-event forensic persistence for SOC/audit replay (`SecurityAlertEvent`).

Known hardening gaps (priority):
1. Durable-by-default security ingestion still requires stronger failure semantics and explicit runtime guarantees.
2. Distributed enforcement is partially complete: rate limits support Redis-backed shared counters, but idempotency and other controls still need centralized consistency across all paths.
3. Forensic persistence is implemented for primary security/XRPL streams, but operational adoption still depends on production Postgres configuration and retention/archival verification.
4. SOC integration is implemented at sink/payload level, but operational adoption still needs runbook ownership, on-call routing, and SOAR playbook validation in production.
5. Frontend visual baselines are implemented but still require baseline governance and periodic refresh policy in CI operations.
6. XRPL live integration is now env-gated in CI; long-running adversarial/fuzz depth can still be expanded.

See `docs/audit.md` for detailed findings and remediation plan.

## Development

Prerequisites:
- Node.js `>=24.x`
- pnpm `10.x`

Setup:
```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm dev
```

Quality checks:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Frontend-focused tests:
```bash
pnpm test:frontend:components
pnpm test:e2e
pnpm test:frontend
```

Expanded assurance tests:
```bash
pnpm test:e2e:install:all
PLAYWRIGHT_ALL_BROWSERS=true pnpm test:e2e:multi-browser
PLAYWRIGHT_REAL_BACKEND=true PLAYWRIGHT_NODE_ENV=production PLAYWRIGHT_SERVER_COMMAND="pnpm build && pnpm start --port 3000" pnpm test:e2e:real-backend
PLAYWRIGHT_VISUAL=true pnpm test:e2e:visual
PLAYWRIGHT_VISUAL=true pnpm test:e2e:visual:update
RUN_XRPL_INTEGRATION_TESTS=true pnpm test:integration:xrpl
```

## CI

GitHub Actions runs:
- Core CI: lint, typecheck, tests, build.
- Frontend matrix: component + Playwright tests across:
  - `ubuntu-latest`
  - `macos-latest`
  - `windows-latest`
- Playwright sharding (`1/2`, `2/2`) for concurrent execution.
- Frontend multi-browser lane on Ubuntu (`chromium`, `firefox`, `webkit`).
- Frontend production-like lane on Ubuntu (`pnpm build && pnpm start`) with real backend E2E (no route mocks).
- Frontend visual baseline diff lane on macOS (Chromium + snapshot assertions).
- Env-gated XRPL live integration lane for testnet behavior checks.
- Container CI path (Podman + `just` fallback commands).

Workflow: `.github/workflows/ci.yml`

## Environment

Use `.env.example` as source of truth for current variables.

High-impact groups:
- Auth and strict mode: `NEXTAUTH_*`, `SECURITY_*`, `AUTH_*`
- Custody and transfer: `WALLET_*`, `EVM_RPC_URL`
- XRPL: `XRPL_*`
- Security detection/alerts: `SECURITY_SIGNAL_*`, `SECURITY_ALERT_*`, `SECURITY_ANOMALY_*`, `SECURITY_RATE_LIMIT_*`
- Risk engine: `RISK_*`
- Data stores: `COCKROACH_URL`, `POSTGRES_URL`

Production security baseline to set explicitly:
- `SECURITY_FORENSIC_ARCHIVE_DIR` (for archival exports before retention deletes)
- `SECURITY_FORENSIC_*_RETENTION_DAYS`
- `SECURITY_ALERT_SIEM_URL` and `SECURITY_ALERT_SIEM_FORMAT`
- `SECURITY_ALERT_SOAR_URL`
- `SECURITY_ALERT_RUNBOOK_BASE_URL` or `SECURITY_ALERT_RUNBOOK_MAP`
- `WALLET_PQC_BACKEND` (`noble` by default for cross-platform parity; optional `native` on Node for ML-DSA-65 keygen/sign/verify)
- `WALLET_PQC_REGISTRY_ADDRESSES` and `PQC_BINDING_PUBLIC_BASE_URL` for EVM PQ binding anchoring

## Documentation

- Security hardening guide: `docs/security-hardening.md`
- Security assessment snapshot: `docs/security-assessment-2026-02-17.md`
- Current audit and prioritized gap plan: `docs/audit.md`
- Branch protection checklist for CI/security-gated auto-merge: `docs/branch-protection-checklist.md`
- Payment structure and boundaries: `docs/payment-structure.md`
- Post-quantum interface boundaries: `docs/pqc-interface-guidelines.md`
