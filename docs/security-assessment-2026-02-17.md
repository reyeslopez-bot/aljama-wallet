# Security Assessment (February 17, 2026)

## Scope

Assessed API security controls and test coverage for:

- `app/api/wallet/send/route.ts`
- `app/api/wallets/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/tokens-wallet/route.ts`
- Supporting behavior in `create-wallet`, `telemetry`, `track-wallet`, `signup`, `_debug/env`, and `test-db` routes.

## Method

- Static review of route logic and shared security utilities.
- Validation of controls through automated tests:
  - `tests/app/api/wallet/send/route.test.ts`
  - `tests/app/api/wallets/route.test.ts`
  - `tests/app/api/auth/register/route.test.ts`
  - `tests/app/api/tokens-wallet/route.test.ts`
- Existing route tests were also considered (`create-wallet`, `telemetry`, `signup`, `market-snapshot`, `xrpl/dev-account`, `test-db`).

## Control Coverage Summary

### `wallet/send`
- Session auth required.
- Origin validation required.
- Rate limiting enforced.
- Wallet ownership check for non-admin users.
- Chain allowlist and RPC chain mismatch checks.
- Idempotency replay handling (409).
- Risk engine gate before broadcast.

### `wallets`
- Session auth required.
- Role-aware data scoping (admin vs owned wallets).
- Rate limiting enforced.

### `auth/register`
- Origin validation required.
- Rate limiting enforced.
- Invite token gate.
- Duplicate-user protection.
- Password complexity validation via schema.

### `tokens-wallet`
- Request rate limiting enforced.
- Address validation required.
- Controlled error mapping for network/allowlist failures.

## Findings

1. `LOW`: `app/api/test-db/route.ts` is unauthenticated in non-production.
- Risk: if non-prod environments are internet-accessible, wallet/summaries metadata can be exposed.
- Current mitigation: route is disabled in production and CI unless explicitly enabled.
- Recommendation: add optional internal token auth for all non-local environments.

2. `LOW`: `app/api/wallets/route.ts` does not currently enforce origin checks.
- Risk: low direct impact due same-origin browser response protections and read-only behavior, but weaker consistency with high-sensitivity routes.
- Recommendation: add `isAllowedOrigin` parity with `create-wallet` and `wallet/send` for defense-in-depth.

3. `MEDIUM` (configuration-dependent): rate-limiting is bypassed when `SECURITY_STRICT_MODE=false`.
- Risk: if deployed with strict mode disabled, abusive traffic protection is effectively off.
- Recommendation: enforce `SECURITY_STRICT_MODE=true` in all deployed environments and add startup validation.

## Overall Assessment

- No critical vulnerabilities were identified in the reviewed routes.
- High-sensitivity payment/custody path (`wallet/send`) has strong guardrails and now has dedicated API security tests.
- Remaining risks are mostly configuration and non-production exposure concerns.

## Recommended Next Steps

1. Add origin validation to `wallets` route.
2. Gate `test-db` route with internal token outside local development.
3. Enforce strict mode at deployment time (or fail startup when disabled in non-dev).
4. Add CI rule requiring tests in this assessment to pass before merge.
