# Wallet Multi-Chain Operations

This runbook covers multi-chain EVM wallet rollout, smoke testing, and chain-specific observability for:

- wallet send
- PQC anchor
- signing-intent worker
- broadcaster
- chain transaction sync

## Deployment config

Use `EVM_RPC_URLS` as the primary config for multi-chain environments.

Example:

```env
EVM_RPC_URLS="1:https://eth-mainnet.example,8453:https://base-mainnet.example"
WALLET_ALLOWED_CHAIN_IDS="1,8453"
WALLET_PQC_REGISTRY_ADDRESSES="1:0x...,8453:0x..."
```

Recommended rollout:

1. Set identical `EVM_RPC_URLS` maps in staging and production.
2. Keep `EVM_RPC_URL` only while migrating older single-chain environments.
3. After staging proves clean on every supported chain, remove `EVM_RPC_URL` to avoid fallback ambiguity.

## Smoke test checklist

Run the full path once per configured chain id.

### 1. Wallet send

Expected result:
- `POST /api/wallet/send` returns `202`
- response includes `intentId`, `traceId`, `chainId`
- worker later moves the transfer to `submitted`

Checks:
- route logs include `wallet-send` with the expected `chainId`
- telemetry includes `wallet_chain_rpc_issue` only if there was a chain problem
- no `wallet.evm_rpc.unavailable` or `wallet.evm_rpc.chain_mismatch` alerts fire

### 2. PQC anchor

Expected result:
- `POST /api/wallet/:id/pqc/anchor` returns `200`
- returned `txHash` is for the requested `chainId`
- anchor record and chain transaction record are written with that network id

### 3. Signing-intent worker

Expected result:
- queued intent is signed and submitted on the same chain it was created for
- worker logs include `wallet-signing-intent-worker` with the expected `chainId`

### 4. Broadcaster

Expected result:
- signed Kafka event on chain `X` is broadcast on chain `X`
- emitted broadcast event keeps the same `chainId`

### 5. Chain transaction sync

Expected result:
- submitted transactions move through included/final states on the correct network
- sync logs and telemetry are attributable to the same `chainId` / `networkId`

## Observability

### Structured logs

Filter by these scopes:

- `wallet-send`
- `wallet-pqc-anchor`
- `wallet-signing-intent-worker`
- `broadcaster`
- `chain-tx-sync`
- `security-alert`

Chain-aware error logs now also emit `*:observability` entries with:

- `issue`
- `chainId`
- `networkId`
- `walletId`
- `requestId`
- `traceId`
- `correlationId`
- `count`
- `sampleTxHashes` for sync failures

### Telemetry counters

Use these telemetry events for chain-level counters:

- `wallet_chain_rpc_issue`
  - dimensions: `scope`, `issue`, `chainId`, `networkId`
- `wallet_chain_sync_failure`
  - dimensions: `scope`, `chainId`, `networkId`
  - payload includes `count`, `sampleTxHashes`, and sample error strings
- `chain_transaction_sync_pass`
  - dimensions: `trigger`, `networkId`
  - payload includes `processedCount`, `succeededCount`, `failedCount`

### Alerts

The wallet pipeline now emits these runbook-backed alert rules:

- `wallet.evm_rpc.unavailable`
- `wallet.evm_rpc.chain_mismatch`
- `wallet.chain_transaction.sync_failures`
- `wallet.chain_transaction.stuck_submitted`
- `wallet.chain_transaction.stuck_included`

## Triage guidance

### `wallet.evm_rpc.unavailable`

Check:

- the chain id exists in `EVM_RPC_URLS`
- the mapped URL is reachable from the deployed environment
- rate limiting or provider-side outage is not blocking requests

### `wallet.evm_rpc.chain_mismatch`

Check:

- the `EVM_RPC_URLS` key matches the actual chain served by that RPC
- stale fallback `EVM_RPC_URL` is not being used accidentally
- the deploy did not ship mismatched staging/prod env values

### `wallet.chain_transaction.sync_failures`

Check:

- `sampleTxHashes` in the alert context and the matching `chain-tx-sync:observability` logs
- upstream RPC health for that chain
- Cockroach write failures or row-specific data issues

Recovery:

1. Fix the upstream RPC or config issue.
2. Re-run the sync worker.
3. Confirm `wallet_chain_sync_failure` stops incrementing for the affected chain.
