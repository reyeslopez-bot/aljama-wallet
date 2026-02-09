# Aljama Wallet Codebase Audit

## Items fixed in this pass
- `/api/track-wallet` now supports the POST flow used by the tracking hook and returns consistent validation details for both GET and POST.
- `useUnlockWallet` now forwards the full `UnlockWalletParams` object to `unlockWallet`, eliminating the previous type cast that silently dropped the encrypted payload.
- README directory structure now matches the current repository layout (root-level dev/prod scripts, `infra/`, dual Prisma schemas, placeholder services).

## Outstanding gaps and recommended fixes
- `unlockWallet` now uses PBKDF2 + AES-GCM (WebCrypto), so password-based unlocks are functional.
- Wallet tracking currently only validates address format; no persistence, rate limiting, or analytics hand-off are present.
- `tests/helpers/walletMocks.ts` is empty, forcing tests to reimplement fixtures.
- Service and data layers are stubs (`services/wallet.service.ts`, `lib/getTokensByWallet.ts`), so UI flows will show empty results.
- No XRPL (Ripple) support exists; only EVM tooling (wagmi/ethers) is present.

## XRPL integration hypothesis
- Add an XRPL client layer using `xrpl` (Node) or `xrpl-client` (browser) with network config for livenet/testnet and secure WebSocket origins.
- Provide an adapter in `infra/` for XRPL account connection and balance fetch, mirroring existing wagmi patterns (e.g., `useXRPLAccount`, `useXRPLLedger`), and expose it via `providers.tsx`.
- Extend API routes for XRPL data (`/api/xrpl/account`, `/api/xrpl/transactions`) that proxy ledger RPCs server-side to avoid CORS and leak of secrets.
- Normalize token models to include XRPL issued currencies (currency+issuer) alongside ERC-20 metadata so dashboards can render both.
- Emit Kafka events for XRPL wallet lifecycle changes (creation/import, balance updates) to keep OLAP/PostgreSQL in sync.
