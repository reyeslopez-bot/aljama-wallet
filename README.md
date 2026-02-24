# Aljama Wallet

Aljama Wallet is a Next.js 16 application for encrypted custody and wallet operations, with production-focused EVM flows and an initial XRPL integration layer.

This README reflects the repository state as of February 17, 2026.

## Product Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| EVM custody | Implemented | Wallet creation, encrypted storage, and server-side send pipeline |
| Auth and access control | Implemented | NextAuth credentials + invite-gated registration |
| Security controls | Implemented | Origin checks, rate limits, idempotency, risk scoring, key fingerprinting |
| Telemetry and tracking | Implemented | API-backed telemetry + wallet connection tracking |
| XRPL network and account visibility | Implemented | Network selector, endpoint inspector, dev-account snapshot |
| XRPL/RWA/RWT assets | Not implemented yet | No trustline or issued asset portfolio flow yet |
| XRPL NFT operations | Not implemented yet | No mint/list/buy/sell flow yet |
| XRPL trading | Not implemented yet | No OfferCreate/NFToken offer execution flow yet |

## What Is In This Repo Today

- Landing and wallet UX with locale support (`en`, `ar`, `he`) via `next-intl`.
- Invite-gated credentials auth with `next-auth`.
- Wallet creation flow that returns an encrypted session payload and optionally persists custody records.
- EVM connection flow (injected wallet and WalletConnect, depending on env config).
- Server-side transaction send route with:
  - session auth
  - origin allowlist checks
  - per-route rate limiting
  - idempotency key reservation
  - ownership checks
  - transfer risk scoring and decision logging
- Token read route backed by Alchemy (`/api/tokens-wallet`).
- XRPL panel for:
  - selecting XRPL network presets
  - copying RPC/WSS/explorer endpoints
  - pulling a dev-account XRP balance snapshot from `/api/xrpl/dev-account`
- XRPL market panel with 30-day normalized snapshots from `/api/market-snapshot`.
- Dual database model:
  - CockroachDB for custody wallet and transaction records
  - Postgres for auth, telemetry, summaries, transfer logs, risk decisions, and signup records

## Current XRPL Scope

Implemented now:
- `lib/xrpl-networks.ts`: XRPL network catalog (mainnet, testnet, devnet, xahau-testnet, batch-devnet, lending-devnet).
- `infra/xrpl/client.ts`: shared XRPL client factory and seed wallet derivation.
- `lib/xrpl.ts`: dev-account balance lookup with account-not-found handling.
- `app/api/xrpl/dev-account/route.ts`: network-validated API route with optional internal-token gate in strict mode.
- `components/home/XrplPanel.client.tsx`: network selector + account snapshot UI.
- `components/home/XrplMarketPanel.client.tsx`: market visualization (not on-ledger execution).

Not implemented yet:
- XRPL trustline management (`TrustSet`).
- XRPL issued asset portfolio retrieval for RWA/RWT assets (`account_lines` based holdings).
- XRPL NFT lifecycle (`NFTokenMint`, `NFTokenCreateOffer`, `NFTokenAcceptOffer`, `NFTokenBurn`).
- XRPL order-book trade flow (`OfferCreate`/`OfferCancel`) with execution tracking.

## Next 5 XRPL Tasks (RWT Assets, NFTs, Trading)

1. Build XRPL issued-asset portfolio foundation (RWA/RWT ready).
   - Add `/api/xrpl/account-assets` that merges XRP balance plus `account_lines` trustline balances.
   - Normalize assets as `{ currency, issuer, value, limit, qualityIn, qualityOut }`.
   - Add issuer allowlist config (`XRPL_ALLOWED_ISSUERS`) and strict validation rules.
   - Create `XrplAssetsPanel` UI beside the existing XRPL panel.

2. Add trustline lifecycle and issuer onboarding.
   - Add signed `TrustSet` route (`/api/xrpl/trustline/set`) with session auth, origin checks, rate limits, and idempotency.
   - Reuse risk controls from `app/api/wallet/send/route.ts` for pre-broadcast policy checks.
   - Add UI flow to set/remove trust limits for RWT issuers.
   - Persist trustline actions in a dedicated XRPL transfer/log model for auditability.

3. Add XRPL NFT read and mint flows.
   - Add `/api/xrpl/nfts` (read holdings via `account_nfts`) and `/api/xrpl/nft/mint` (`NFTokenMint`).
   - Add metadata fetch with allowlisted URI schemes and safe fallback rendering.
   - Add a wallet NFT gallery component with pagination and basic filters.
   - Add API and component tests for invalid payloads, auth failure, and network mismatch behavior.

4. Add trading execution primitives for tokens and NFTs.
   - Token trading: implement quote + execution for `OfferCreate`/`OfferCancel`.
   - NFT trading: implement list/buy/cancel using `NFTokenCreateOffer`, `NFTokenAcceptOffer`, and `NFTokenCancelOffer`.
   - Add a unified `xrpTxSubmit` service abstraction with idempotency, tx hash tracking, and retry policy.
   - Store lifecycle states (`submitted`, `validated`, `failed`) with ledger index and metadata.

5. Ship a single XRPL Trade Desk UI for RWT assets and NFTs.
   - Build one panel showing:
     - RWT holdings
     - live order-book context
     - NFT listings/offers
     - signed action history
   - Add region/compliance policy hooks so risky issuers or disallowed markets are blocked early.
   - Emit telemetry and analytics events for create-offer, cancel-offer, accept-offer, and trustline changes.

## Architecture

### Frontend

- Next.js App Router with localized routes under `app/[locale]`.
- Primary page composition in `components/home/*`.
- Auth-aware action gating via `next-auth` session state.
- State management with Zustand (example: XRPL network persistence in `infra/state/xrplNetworkStore.ts`).

### API Layer

- Route handlers under `app/api/*`.
- Validation and error shaping via Zod and shared security helpers.
- Security utilities in `lib/security/*`:
  - runtime strict mode checks
  - origin validation
  - internal token verification
  - response helpers
  - in-memory rate limiting

### Data Layer

- `prisma/crdb/schema.prisma` for custody wallet and transaction records.
- `prisma/pg/schema.prisma` for auth/session plus telemetry and risk-related records.
- Clients:
  - `lib/prisma-crdb.ts`
  - `lib/prisma-pg.ts`

### Service Layer

- Wallet custody and tx recording: `services/wallet.service.ts`
- Risk and transfer logs: `services/transfer-risk.service.ts`, `services/transfer-log.service.ts`
- Telemetry and wallet tracking: `services/telemetry.service.ts`, `services/track-wallet.service.ts`

## API Surface

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/auth/register` | `POST` | No session, invite token required | Register credentials user |
| `/api/auth/[...nextauth]` | `GET/POST` | NextAuth flow | Credentials sign-in/session |
| `/api/auth/config` | `GET` | Public | Returns auth UI flags |
| `/api/create-wallet` | `POST` | Session required | Create wallet + encrypted payload, optional custody persistence |
| `/api/wallets` | `GET` | Session required | List admin/all or user-owned wallets |
| `/api/wallet/send` | `POST` | Session required | Policy/risk-gated EVM send flow |
| `/api/tokens-wallet` | `GET` | Public | Fetch ERC-20 token balances via Alchemy |
| `/api/xrpl/dev-account` | `GET` | Internal token in strict mode | XRPL dev-account balance snapshot |
| `/api/market-snapshot` | `GET` | Public | XRPL and reference asset market snapshot |
| `/api/telemetry` | `POST` | Public | Persist telemetry events |
| `/api/track-wallet` | `POST` | Public | Persist wallet connection tracking events |
| `/api/security/signals` | `POST` | Internal token | Ingest security signals (single or batch) via queue-backed pipeline |
| `/api/security/anomalies` | `GET` | Internal token | View recent security signals, anomalies, and alert outcomes |
| `/api/signup` | `POST` | Public | Save region/signup metadata |
| `/api/_debug/env` | `GET` | Internal token in strict mode | Debug env availability flags |
| `/api/test-db` | `GET` | Disabled in prod | Development DB connectivity check |

## Security Model

Important behavior:
- `SECURITY_STRICT_MODE=true` enables strict origin and rate-limit behavior (also forced in production).
- Sensitive routes enforce origin allowlist through `SECURITY_ALLOWED_ORIGINS`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_SITE_URL`.
- Internal routes can require `INTERNAL_API_TOKEN`.
- Wallet key material is encrypted with versioned keys and optional fingerprint enforcement.
- Transfer routes include policy approval and configurable risk scoring before broadcast.

See:
- `docs/security-hardening.md`
- `docs/security-assessment-2026-02-17.md`

## Prerequisites

- Node.js `>=24.x` (project engine requirement)
- pnpm `10.x`
- Optional but recommended: Podman or Docker for consistent local runtime
- Optional local DBs: Postgres + CockroachDB (helper script included)

## Local Setup

1. Install dependencies.

```bash
pnpm install
```

2. Copy env template and fill required values.

```bash
cp .env.example .env
```

3. (Optional) Start local databases.

```bash
./db.sh up
```

4. Run Prisma client generation.

```bash
pnpm prisma:generate
```

5. Start app.

```bash
pnpm dev
```

Default local URL:
- `http://localhost:2998`

## Containerized Development

- `./dev.sh` starts the app in a Podman/Docker container.
- `./prod.sh` builds and runs the production target image.
- `just` wraps common workflows (`just dev`, `just db-up`, `just test`, `just build`).

Examples:

```bash
./dev.sh --port 3200
just dev port=3200
./prod.sh --port 8080
```

## Environment Reference

Use `.env.example` as baseline. Important keys:

### Core app/auth

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_INVITE_TOKEN`
- `AUTH_ADMIN_EMAILS`
- `SECURITY_STRICT_MODE`
- `SECURITY_DISABLE_RATE_LIMIT`
- `SECURITY_ALLOWED_ORIGINS`
- `ALLOW_UNAUTH_DEBUG_ROUTES`

### Wallet custody and transfer

- `WALLET_KEY_PROVIDER` (`env` or `file`)
- `WALLET_KEY_FILE_V1` (when using file provider)
- `WALLET_ENCRYPTION_KEY_ACTIVE_VERSION`
- `WALLET_ENCRYPTION_KEY_V1`
- `WALLET_ENCRYPTION_KEY_FINGERPRINT_V1`
- `WALLET_CRYPTO_ALLOW_LEGACY`
- `EVM_RPC_URL`
- `WALLET_ALLOWED_CHAIN_IDS`
- `WALLET_DAILY_LIMIT_WEI`

### Risk engine

- `RISK_VELOCITY_WINDOW_MS`
- `RISK_VELOCITY_MAX_TX`
- `RISK_REVIEW_SCORE`
- `RISK_DENY_SCORE`
- `RISK_HIGH_AMOUNT_PCT`
- `RISK_HIGH_AMOUNT_SCORE`
- `RISK_ABSOLUTE_WEI`
- `RISK_ABSOLUTE_SCORE`
- `RISK_NEW_DESTINATION_SCORE`
- `RISK_NEW_CHAIN_SCORE`
- `RISK_VELOCITY_SCORE`
- `RISK_AI_ENDPOINT`
- `RISK_AI_TOKEN`
- `RISK_AI_REQUIRED`
- `RISK_AI_TIMEOUT_MS`

### Security anomaly and alert pipeline

- `SECURITY_ALERTS_API_TOKEN`
- `SECURITY_SIGNAL_INGEST_TOKEN`
- `SECURITY_ALERT_WEBHOOK_URL`
- `SECURITY_ALERT_WEBHOOK_MIN_SEVERITY`
- `SECURITY_ALERT_DEDUP_WINDOW_MS`
- `SECURITY_ALERT_DEDUP_TTL_MS`
- `SECURITY_ALERT_DEDUP_BACKEND` (`memory` or `redis`)
- `SECURITY_ALERT_REDIS_URL`
- `SECURITY_ALERT_REDIS_PREFIX`
- `SECURITY_ALERT_DUPLICATE_ESCALATE_AFTER`
- `SECURITY_ALERT_DUPLICATE_ESCALATE_EVERY`
- `SECURITY_ALERT_MAX_BUFFER`
- `SECURITY_ALERT_WEBHOOK_TIMEOUT_MS`
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
- `SECURITY_SIGNAL_QUEUE_BACKEND` (`in_memory` or `redis`)
- `SECURITY_SIGNAL_QUEUE_MAX_DEPTH`
- `SECURITY_SIGNAL_QUEUE_DRAIN_BATCH`
- `SECURITY_SIGNAL_QUEUE_DEQUEUE_BATCH`
- `SECURITY_SIGNAL_QUEUE_ACK_TIMEOUT_MS`
- `SECURITY_SIGNAL_QUEUE_MAX_RETRIES`
- `SECURITY_SIGNAL_QUEUE_RETRY_BASE_MS`
- `SECURITY_SIGNAL_QUEUE_RETRY_MAX_MS`
- `SECURITY_SIGNAL_QUEUE_OVERFLOW_STRATEGY` (`drop_oldest` or `reject_new`)
- `SECURITY_SIGNAL_QUEUE_HIGH_WATER`
- `SECURITY_SIGNAL_QUEUE_LOW_WATER`
- `SECURITY_SIGNAL_REDIS_URL`
- `SECURITY_SIGNAL_REDIS_STREAM`
- `SECURITY_SIGNAL_REDIS_GROUP`
- `SECURITY_SIGNAL_REDIS_CONSUMER`
- `SECURITY_SIGNAL_REDIS_BLOCK_MS`
- `SECURITY_SIGNAL_REDIS_MIN_IDLE_MS`

### XRPL

- `XRPL_DEV_SEED` (required for `/api/xrpl/dev-account`)

### Token and Web3 UX

- `ALCHEMY_API_KEY`
- `ALCHEMY_NETWORK`
- `ALCHEMY_ALLOWED_NETWORKS`
- `NEXT_PUBLIC_ALCHEMY_API_KEY`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_ONRAMP_URL_TEMPLATE`

### Internal/debug endpoints

- `INTERNAL_API_TOKEN`
- `MCP_INTERNAL_TOKEN`
- `MCP_WALLET_SIGNER_TOKEN`

### Database

Runtime accepts either pair:
- `CRDB_DATABASE_URL` or `COCKROACH_URL`
- `PG_DATABASE_URL` or `POSTGRES_URL`

Note:
- Prisma CLI configs use `CRDB_DATABASE_URL` and `PG_DATABASE_URL`.
- If you only set fallback URLs (`COCKROACH_URL`, `POSTGRES_URL`), mirror them into the Prisma variables for migrations.

## Testing and Quality

Run the main checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Frontend-focused checks:

```bash
pnpm test:frontend:components
pnpm test:e2e
pnpm test:frontend
```

Test stack:
- Vitest + Testing Library
- Playwright (functional browser checks, screenshots, load-time assertions)
- Route tests for critical APIs (`wallet/send`, `wallets`, `auth/register`, `tokens-wallet`, `xrpl/dev-account`, and others)
- CI matrix runs frontend checks concurrently across Linux, macOS, and Windows with Playwright sharding

## Project Layout

```text
.
|- app/                    # App Router pages and API routes
|- components/             # UI components and feature panels
|- docs/                   # Security and payment docs
|- hooks/                  # Client hooks
|- infra/                  # Infra adapters (XRPL, telemetry, wagmi, state, kafka)
|- lib/                    # Shared utilities, auth, security, db clients
|- prisma/                 # Dual schemas (crdb and pg)
|- services/               # Server-side service layer
|- tests/                  # Vitest + Playwright suites
|- dev.sh                  # Containerized dev runner
|- db.sh                   # Local Postgres/Cockroach helper
|- prod.sh                 # Containerized prod runner
|- justfile                # Command shortcuts
`- README.md
```

## Known Limitations

- XRPL integration currently focuses on network/account visibility, not trading execution.
- Market snapshot panel is charting-oriented and uses CoinGecko reference feeds, not on-ledger orderbook execution.
- Card on-ramp flow is a redirect handoff; there is no webhook reconciliation or fiat ledger in-app yet.

## Additional Docs

- `docs/security-hardening.md`
- `docs/security-assessment-2026-02-17.md`
- `docs/payment-structure.md`
- `docs/cleanup-notes.md`
