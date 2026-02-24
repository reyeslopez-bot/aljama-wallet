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
- Alert deduplication + severity escalation + optional webhook delivery.

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
- Idempotency key reservation for transaction submission paths.
- Transfer risk scoring with configurable deny/review thresholds.
- Security anomaly scoring with repetitive and non-repetitive rules.
- Alert dedup semantics with TTL windows and escalation.
- Queue adapter health visibility with optional durable fail-closed mode (`SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE=true`).

Known hardening gaps (priority):
1. Durable-by-default security ingestion still requires stronger failure semantics and explicit runtime guarantees.
2. Distributed enforcement is incomplete where in-memory fallbacks remain (rate limit/idempotency consistency across instances).
3. Forensic state persistence is incomplete for some in-memory buffers/maps.
4. SOC integration needs SIEM/SOAR-grade sinks, runbooks, and automated containment.
5. Frontend assurance should expand to baseline screenshot diffing, broader browser coverage, and production-like performance budgets.
6. XRPL integration confidence should increase with higher-fidelity integration and failure-mode testing.

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

## CI

GitHub Actions runs:
- Core CI: lint, typecheck, tests, build.
- Frontend matrix: component + Playwright tests across:
  - `ubuntu-latest`
  - `macos-latest`
  - `windows-latest`
- Playwright sharding (`1/2`, `2/2`) for concurrent execution.
- Container CI path (Podman + `just` fallback commands).

Workflow: `.github/workflows/ci.yml`

## Environment

Use `.env.example` as source of truth for current variables.

High-impact groups:
- Auth and strict mode: `NEXTAUTH_*`, `SECURITY_*`, `AUTH_*`
- Custody and transfer: `WALLET_*`, `EVM_RPC_URL`
- XRPL: `XRPL_*`
- Security detection/alerts: `SECURITY_SIGNAL_*`, `SECURITY_ALERT_*`, `SECURITY_ANOMALY_*`
- Risk engine: `RISK_*`
- Data stores: `COCKROACH_URL`, `POSTGRES_URL`

## Documentation

- Security hardening guide: `docs/security-hardening.md`
- Security assessment snapshot: `docs/security-assessment-2026-02-17.md`
- Current audit and prioritized gap plan: `docs/audit.md`
- Payment structure and boundaries: `docs/payment-structure.md`
