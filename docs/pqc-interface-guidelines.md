# Post-Quantum Interface Guidelines

Date: March 3, 2026

## Purpose

This repo supports post-quantum wallet identity and binding, not native post-quantum transaction authorization on EVM or XRPL.

That distinction is the main design rule:

- Classical transaction primitives stay fixed-size and chain-native.
- Post-quantum material is handled as a separate variable-length subsystem.
- On-chain PQ state is hash commitment only.

## Strategic Boundary

This codebase is in the deployable wallet layer:

- EVM transaction signing: classical today
- XRPL transaction signing: classical today
- Vault identity and migration binding: `ML-DSA-65`
- On-chain PQ publication: commitment hashes only

This repo is not a `rippled` fork and does not implement:

- XRPL `KeyType` changes
- XRPL address derivation changes
- XRPL binary serialization changes
- native on-ledger `ML-DSA` signatures
- protocol fee or multisig redesign

## Core Rule

Do not globally replace fixed-size classical key assumptions with dynamic byte buffers.

Use variable-length buffers only in the PQ subsystem.

Bad direction:

- replacing every `32` / `33` byte classical assumption with generic variable-length key blobs
- widening classical transaction interfaces to accept arbitrary PQ public keys or signatures
- storing full PQ public keys or signatures in XRPL transaction payloads

Correct direction:

- keep classical transaction paths unchanged
- introduce separate PQ types and storage paths
- publish only PQ commitment hashes on-chain

## Fixed-Size Interfaces To Preserve

These interfaces are intentionally classical and should remain fixed-shape.

### 1. Transaction Signing Interfaces

Keep classical-only semantics in:

- [lib/signing/types.ts](/Users/rafael/projects/aljama-wallet/lib/signing/types.ts)
- [services/signer.service.ts](/Users/rafael/projects/aljama-wallet/services/signer.service.ts)
- [services/evm-tx.service.ts](/Users/rafael/projects/aljama-wallet/services/evm-tx.service.ts)
- [lib/xrpl-signer.ts](/Users/rafael/projects/aljama-wallet/lib/xrpl-signer.ts)

Rules:

- `SigningCurve` remains `secp256k1 | ed25519`
- `SigningScheme` may describe policy or metadata, but actual chain transaction signing remains classical
- EVM signed payload generation stays on `secp256k1`
- XRPL signed transaction generation stays on `secp256k1` or `ed25519`
- do not add `ml-dsa` as a transaction signing curve in the current app execution path

### 2. Address Derivation And Account Identity

Keep classical address semantics in:

- [lib/crypto/deterministic-key-engine.ts](/Users/rafael/projects/aljama-wallet/lib/crypto/deterministic-key-engine.ts)
- [lib/wallet.ts](/Users/rafael/projects/aljama-wallet/lib/wallet.ts)
- [services/wallet.service.ts](/Users/rafael/projects/aljama-wallet/services/wallet.service.ts)

Rules:

- account addresses come only from classical public keys
- `buildAccountRef(...)` remains based on classical chain + classical key type + classical stable identity
- no PQ address format is introduced
- no PQ public key is used as wallet address or signer address

### 3. Route Payloads For Live Chain Actions

Keep request and response schemas for transaction routes classical and compact:

- [app/api/wallet/send/route.ts](/Users/rafael/projects/aljama-wallet/app/api/wallet/send/route.ts)
- XRPL action routes under [app/api/xrpl](/Users/rafael/projects/aljama-wallet/app/api/xrpl)

Rules:

- no full PQ signatures in API payloads for live chain actions
- no full PQ public keys in XRPL memo payloads
- no route should require ML-DSA material to submit an EVM or XRPL transaction

## Variable-Length Interfaces Allowed

These are the correct places for dynamic PQ material.

### 1. PQ Key Material And Binding Types

Use variable-length fields in:

- [lib/pqc/types.ts](/Users/rafael/projects/aljama-wallet/lib/pqc/types.ts)
- [lib/pqc/provider.ts](/Users/rafael/projects/aljama-wallet/lib/pqc/provider.ts)
- [lib/pqc/deterministic.ts](/Users/rafael/projects/aljama-wallet/lib/pqc/deterministic.ts)

Rules:

- `WalletPqcKeyPair` may contain large encoded keys
- `WalletPqcBinding` may contain large PQ public keys and signatures
- `WalletPqcEncryptedMaterial` may contain the full PQ private key
- these types are off-chain application data, not chain transaction primitives

### 2. Deterministic PQ Derivation

Use separate PQ derivation APIs in:

- [lib/crypto/deterministic-key-engine.ts](/Users/rafael/projects/aljama-wallet/lib/crypto/deterministic-key-engine.ts)

Rules:

- PQ derivation is additive beside classical derivation
- classical path/address derivation must not change
- PQ derivation is per vault/path and uses deterministic seeded `ML-DSA-65`
- do not overload classical `derive(...)` return types with PQ blobs

### 3. Commitment And Anchor Layers

Use compact hashes at the chain boundary in:

- [lib/pqc/commitment.ts](/Users/rafael/projects/aljama-wallet/lib/pqc/commitment.ts)
- [app/api/wallet/[id]/pqc/anchor/route.ts](/Users/rafael/projects/aljama-wallet/app/api/wallet/[id]/pqc/anchor/route.ts)
- [app/api/xrpl/pqc/anchor/route.ts](/Users/rafael/projects/aljama-wallet/app/api/xrpl/pqc/anchor/route.ts)
- [contracts/src/PqcBindingRegistry.sol](/Users/rafael/projects/aljama-wallet/contracts/src/PqcBindingRegistry.sol)

Rules:

- EVM stores commitment hashes and URI metadata only
- XRPL memo payloads carry compact hashes only
- full PQ signatures and public keys stay off-chain

### 4. Persistence Of PQ Metadata

Use DB JSON or dedicated rows for PQ metadata in:

- [services/wallet.service.ts](/Users/rafael/projects/aljama-wallet/services/wallet.service.ts)
- [services/wallet-pqc-anchor.service.ts](/Users/rafael/projects/aljama-wallet/services/wallet-pqc-anchor.service.ts)
- [prisma/crdb/schema.prisma](/Users/rafael/projects/aljama-wallet/prisma/crdb/schema.prisma)
- [prisma/pg/schema.prisma](/Users/rafael/projects/aljama-wallet/prisma/pg/schema.prisma)

Rules:

- public binding documents may be stored and indexed
- `pqcBindingHash` is the stable public identifier
- encrypted wallet payloads may hold full PQ private material
- no database schema should assume PQ keys fit in classical fixed-width columns

## Allowed Conversions At Boundaries

Use these boundary conversions only:

1. Classical wallet -> PQ binding subject
2. Deterministic vault path -> deterministic PQ keypair
3. PQ binding -> canonical commitment hashes
4. Commitment hashes -> EVM registry calldata
5. Commitment hashes -> XRPL memo payload

Do not add these conversions:

1. PQ public key -> wallet address
2. PQ private key -> transaction signer for live EVM/XRPL execution
3. PQ signature -> XRPL transaction signature field
4. Full PQ signature/public key -> XRPL memo payload

## Coding Rules

### Rule A: Separate Type Domains

Never reuse classical key fields for PQ payloads.

Good:

- `pubKey` stays classical
- `pqcBinding.publicKey` stores ML-DSA material separately

Bad:

- making `pubKey` mean either compressed secp, prefixed Ed25519, or raw ML-DSA bytes

### Rule B: Do Not Widen Classical Enums Prematurely

Do not widen current live-signing enums to imply native PQ transaction support.

Examples:

- do not add `ml-dsa-65` to `SigningCurve`
- do not add XRPL-native PQ transaction branches in the signer until the protocol actually supports them

### Rule C: Hash At The Chain Boundary

If data leaves the app and is intended for chain publication, prefer commitment hashes unless the target protocol natively requires the full object.

For this repo:

- EVM anchor: hash + URI
- XRPL anchor: hash-only memo payload

### Rule D: Zeroization And Lifetime

Treat PQ private material as larger sensitive memory.

Rules:

- keep full PQ private material inside encrypted wallet payloads or ephemeral derivation scope
- do not log PQ private keys
- do not copy PQ private key blobs unnecessarily
- lock/wipe deterministic vault state after PQ derivation work completes

### Rule E: Keep Public Binding Documents Sanitized

Public routes may expose:

- PQ public key
- signed binding statement
- signature
- derivation metadata if intentionally public
- commitment hashes

Public routes must not expose:

- PQ private key
- encrypted wallet payload internals beyond intended public binding data

## Review Checklist For Future Changes

Before merging any PQ-related change, check:

1. Does this change alter classical transaction signing behavior?
2. Does it try to use PQ material as a chain-native address or signer identity?
3. Does it push full PQ blobs onto XRPL or into generic transaction routes?
4. Does it blur the boundary between classical `pubKey` and PQ public key material?
5. Could the same goal be achieved with commitment hashes instead?

If the answer to `1`, `2`, `3`, or `4` is yes, the change is probably wrong for this repo.

## If We Ever Build A Rippled Fork

That is a separate architecture track.

Do it with isolated PQ-native types and protocol changes, not a global buffer rewrite.

Required work would include:

- new XRPL `KeyType`
- new address and serialization rules
- verification pipeline changes
- fee and size recalibration
- multisig redesign review
- node memory and DoS audit
- amendment/testnet rollout plan

Until that happens, the wallet layer should stay hybrid:

- classical signing for live transactions
- `ML-DSA-65` for vault identity and migration binding
- hash commitments for on-chain publication
