# Security Assessment (March 29, 2026)

## Scope

Assessed retry behavior, fail-closed edge cases, and frontend/backend error-contract parity for:

- `services/xrpl-tx-submit.service.ts`
- `services/signing-intent.service.ts`
- `services/security-signal-queue.adapter.ts`
- `components/home/LoginGate.tsx`
- `components/home/XrplPanel.client.tsx`
- `components/home/XrplMarketPanel.client.tsx`
- `components/home/XrplTradeDesk.client.tsx`
- `components/ui/MapboxMap.client.tsx`
- `hooks/useTrackUserWallet.ts`
- `components/wallet/ui/WalletWorkspace.client.tsx`
- Supporting backend routes already enforcing structured rate-limit responses:
  - `app/api/auth/register/route.ts`
  - `app/api/wallet/send/route.ts`
  - `app/api/xrpl/trade/swap/route.ts`

## Method

- Static review of retry loops, delayed queue semantics, and fail-closed response handling.
- Added and executed targeted automated tests for backend services, UI clients, and API routes.

### Executed Test Coverage

- New or expanded retry-focused tests:
  - `tests/services/xrpl-tx-submit.service.test.ts`
  - `tests/services/signing-intent.claim.test.ts`
  - `tests/services/security-signal-queue.adapter.test.ts`
  - `tests/components/home/LoginGate.test.tsx`
  - `tests/components/home/XrplPanel.test.tsx`
  - `tests/components/home/XrplMarketPanel.test.tsx`
  - `tests/components/home/XrplTradeDesk.test.tsx`
  - `tests/components/ui/MapboxMap.test.tsx`
  - `tests/hooks/useTrackUserWallet.test.tsx`
  - `tests/components/wallet/WalletWorkspace.test.tsx`
- New browser-level parity coverage:
  - `tests/e2e/auth.retry-errors.spec.ts`
- Existing route contract tests re-run for parity confirmation:
  - `tests/app/api/auth/register/route.test.ts`
  - `tests/app/api/wallet/send/route.test.ts`
  - `tests/app/api/xrpl/trade/swap/route.test.ts`

## Verified Controls

### Retry and Queue Semantics

- XRPL submission retries only on transient transport-style failures and stops on non-retryable engine errors.
- XRPL submission result parsing now has direct test coverage for:
  - metadata-derived engine results
  - `engine_result` fallback
  - string-valued sequence and ledger index fields
- Wallet signing-intent claiming now has direct test coverage for optimistic-claim contention and bounded retry exhaustion.
- Signal queue adapters now have explicit coverage for delayed retry visibility, preventing early dequeue of scheduled retry messages.

### Frontend/Backend Parity

- Structured backend error codes are now normalized by the client in reviewed mutation flows instead of surfacing raw backend tokens such as `RATE_LIMITED` or `RATE_LIMIT_BACKEND_UNAVAILABLE`.
- Verified parity in reviewed mutation flows:
  - registration (`LoginGate` <-> `auth/register`)
  - managed wallet send (`WalletWorkspace` <-> `wallet/send`)
  - XRPL trade-desk actions (`XrplTradeDesk` <-> XRPL action routes)
- Reviewed read-only client fetchers now normalize the same backend error contract for:
  - XRPL developer account lookup
  - XRPL market snapshot loading
  - wallet tracking submission state
  - network-location-backed map fallback messaging
- Retry-aware UI behavior is covered for:
  - 429 rate limiting
  - 503 fail-closed rate-limit backend unavailability
  - replaying the last XRPL action with a fresh idempotency key
  - localized registration messaging that includes exact retry windows when provided
  - browser-level confirmation of final user-visible register copy for mocked 429 and 503 responses

## Findings

- No critical, high, or medium-severity findings were identified in the expanded retry and parity review.
- Previously noted low-severity gaps around read-only client normalization and register retry guidance are resolved in the reviewed scope.

## Overall Assessment

- No critical or high-severity vulnerabilities were identified in the reviewed retry and parity scope.
- The main security issue in this area, frontend leakage of raw backend control tokens during degraded/rate-limited paths, has been addressed for the reviewed mutation and read-only client flows.
- Retry behavior is now materially better tested at the service layer, queue layer, route layer, component layer, and browser layer.

## Recommended Next Steps

1. Keep the route tests for `auth/register`, `wallet/send`, and XRPL action routes in CI guardrails when retry/error behavior changes.
2. Reuse `lib/security/client-api-error.ts` for any new client fetchers added outside the reviewed scope so parity does not regress.
