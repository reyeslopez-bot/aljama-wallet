# Payment Structure

This app currently has two payment-related flows:

1. Card on-ramp handoff (client-side redirect)
2. On-chain transfer send (server-side signed transaction)

## 1) Card On-Ramp Handoff

### Purpose
Let a user fund their newly created wallet address using an external card provider.

### Where it lives
- UI: `components/home/CreateWalletPanel.tsx`
- URL builder: `lib/payment/onramp.ts`

### How it works
1. User creates a wallet in `CreateWalletPanel`.
2. UI renders `Buy with card`.
3. Link is built with `buildOnRampUrl(address, NEXT_PUBLIC_ONRAMP_URL_TEMPLATE)`.
4. User is redirected to external provider with wallet address prefilled.

### Config
- `NEXT_PUBLIC_ONRAMP_URL_TEMPLATE`:
  - Supports `{address}` placeholder.
  - If placeholder is missing, `walletAddress=<encoded address>` is appended.
  - If unset, defaults to `https://global.transak.com?walletAddress={address}`.

### Responsibility boundary
- App does not process cards directly.
- App only constructs redirect URL and passes wallet address.
- KYC/checkout/payment execution is handled by provider.

## 2) On-Chain Transfer Send

### Purpose
Send native-chain funds from a custody wallet using server-side controls.

### Where it lives
- API: `app/api/wallet/send/route.ts`

### How it works
1. Client sends POST `/api/wallet/send` with:
   - `walletId`, `to`, `amountWei`, `chainId`, `idempotencyKey`, optional fee overrides.
2. API enforces:
   - Auth/session (`requireSession`)
   - Origin checks (`isAllowedOrigin`)
   - Rate limit
   - Ownership/admin checks
   - Allowed chains + RPC chain match
   - Daily spend/risk policy checks
   - Idempotency key reservation
3. API signs transaction with server-side decrypted wallet key.
4. API broadcasts tx with RPC provider and records transfer metadata.

### Key config
- `EVM_RPC_URL` for single-chain setups
- `EVM_RPC_URLS` for multi-chain setups using `chainId:https://rpc-url` pairs
- `WALLET_ALLOWED_CHAIN_IDS`
- `WALLET_DAILY_LIMIT_WEI`
- Risk config keys from `README.md` table (`RISK_*`).

## Test Strategy

Payment behavior is tested at two levels:

1. Function/unit tests (pure logic)
   - `tests/lib/payment/onramp.test.ts`
   - Covers template resolution, URL generation, placeholder replacement, encoding, and fallback behavior.

2. Functional/component tests (user-visible behavior)
   - `tests/components/home/CreateWalletPanel.test.tsx`
   - Covers wallet creation + session persistence + card link generation.
   - Covers custom on-ramp template behavior and default-provider notice behavior.

## Current Limitations

- Card checkout status is not tracked in-app after redirect.
- No webhook reconciliation for external on-ramp completion.
- No in-app fiat payment ledger; only on-chain custody/send records.
