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

## Notes on Quantum Threats

Current Ethereum ECDSA is not quantum-safe. This app can harden custody and policy controls, but cannot make on-chain signatures quantum-secure. A quantum-safe upgrade requires chain-level protocol changes.
