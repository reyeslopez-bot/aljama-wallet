# Aljama Wallet

**Aljama Wallet** is a secure, Middle Eastern–themed Web3 wallet built with Next.js, WAGMI, and Ethers.js, containerized with Podman/Docker for consistent development and production environments.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Tech Stack & Architecture](#tech-stack--architecture)
4. [Prerequisites](#prerequisites)
5. [Installation & Setup](#installation--setup)
6. [Development Workflow](#development-workflow)
7. [Configuration & Environment Variables](#configuration--environment-variables)
8. [Scripts & Commands](#scripts--commands)
9. [Directory Structure](#directory-structure)
10. [Newcomer Guide (Codebase Tour)](#newcomer-guide-codebase-tour)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Contributing](#contributing)
14. [License](#license)
15. [Acknowledgements](#acknowledgements)

---

## Project Overview

Aljama Wallet aims to deliver a seamless, culturally resonant wallet experience for users in Middle Eastern and global markets. It integrates best-in-class security practices with an intuitive UI/UX inspired by desert and dune motifs. Key goals:

* **Security First:** Leverage WAGMI & Ethers.js for audited blockchain interactions.
* **Container Consistency:** Use Podman or Docker for deterministic builds across environments.
* **Modular UI:** Tailwind CSS + custom Middle Eastern aesthetic.

## Features

* **Create**, **Unlock**, and **Import** wallets via mnemonic or private key.
* **Secure storage** of encrypted keys in local encrypted storage.
* **Network switching** between Ethereum Mainnet, Testnets, and custom RPCs.
* **Transaction history** display and simple on-chain interactions.
* **Themed UI** components (cards, buttons) aligned with Aladdin-inspired typography.

## Tech Stack & Architecture

* **Next.js (App Router):** Server-side rendering and API routes
* **React 18 + TypeScript:** Strongly-typed components and hooks
* **WAGMI & Ethers.js:** Blockchain connectivity and wallet management
* **Tailwind CSS:** Utility-first styling, custom `aladin` font integration
* **Containerized workflow (Podman/Docker):** Multi-stage image for dev & prod
* **pnpm:** Fast, deterministic package management
* **Playwright:** End-to-end UI testing
* **GitHub Actions:** CI for lint, build, and test

## Prerequisites

* **Podman (v4+)** or **Docker (24+)**
* **Node.js v18+**
* **pnpm** (or npm/yarn if you adjust commands)
* **GNU Make** (optional, for makefile targets)

## Installation & Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/reyeslopez-bot/aljama-wallet.git
   cd aljama-wallet
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Environment Variables**

   Copy `.env.example` to `.env` (or `.env.local`) and fill in the values:

   ```ini
   NEXT_PUBLIC_ALCHEMY_API_KEY=<ALCHEMY_KEY>
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<WALLETCONNECT_PROJECT_ID>
   EVM_RPC_URL=<RPC_URL>
   WALLET_DAILY_LIMIT_WEI=<DAILY_LIMIT_WEI>
   WALLET_ALLOWED_CHAIN_IDS=<CHAIN_ID_LIST>
   WALLET_ENCRYPTION_KEY_ACTIVE_VERSION=1
   WALLET_ENCRYPTION_KEY_V1=<64_HEX_CHARS>
   WALLET_ENCRYPTION_KEY_FINGERPRINT_V1=<SHA256_HEX>
   COCKROACH_URL=postgresql://USER:PASSWORD@HOST:PORT/defaultdb?sslmode=require
   POSTGRES_URL=postgresql://USER:PASSWORD@HOST:PORT/dbname
   ```

## Development Workflow

### Running in Container

```bash
# Auto-detects Podman or Docker, rebuilds as needed, and serves on port 2998
./dev.sh

# Override the exposed port (for both host and container)
./dev.sh --port 3100

# All Justfile recipes forward APP_PORT too
just dev                  # equivalent to ./dev.sh (defaults to 2998)
just dev port=3200        # launches on http://localhost:3200
just preview port=3200    # open the matching browser tab
```

### Local Databases (Podman/Docker)

```bash
# Start Postgres + Cockroach locally
./db.sh up

# Optional: inspect status/logs
./db.sh status
./db.sh logs

# Stop databases
./db.sh down

# Prisma schema sync (first run)
pnpm prisma db push --config prisma.crdb.config.ts
pnpm prisma db push --config prisma.pg.config.ts --accept-data-loss
```

### Running Locally

```bash
pnpm dev   # listens on http://localhost:2998 by default
```

### Linting & Formatting

```bash
pnpm lint      # ESLint
pnpm format    # Prettier
```

## Configuration & Environment Variables

| Key                                   | Description                               | Example |
| ------------------------------------- | ----------------------------------------- | ------- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY`         | Enables faster RPC reads via Alchemy      | `v2_yourAlchemyKey` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`| Enables WalletConnect modal               | `123abc456def789ghi` |
| `EVM_RPC_URL`                         | JSON-RPC endpoint for internal signing    | `https://rpc.example` |
| `WALLET_DAILY_LIMIT_WEI`              | Daily transfer limit (wei)                | `1000000000000000000` |
| `WALLET_ALLOWED_CHAIN_IDS`            | Comma-separated allowed chains            | `1,8453,11155111` |
| `WALLET_ENCRYPTION_KEY_ACTIVE_VERSION`| Active key version for AES-GCM vaults     | `1` |
| `WALLET_ENCRYPTION_KEY_V1`            | 32-byte hex key for AES-GCM               | `64hexchars...` |
| `WALLET_ENCRYPTION_KEY_FINGERPRINT_V1`| SHA-256 hex fingerprint for key check     | `sha256hex...` |
| `COCKROACH_URL`                       | Prisma datasource URL for CockroachDB OLTP| `postgresql://user:pass@host:26257/defaultdb?sslmode=require` |
| `POSTGRES_URL`                        | Prisma datasource URL for Postgres OLAP   | `postgresql://user:pass@host:5432/analytics` |

## Scripts & Commands

* `./dev.sh` - Launch development container + server (supports `--port` and Podman/Docker auto-detect)
* `./prod.sh` - Build and start production image (`--port`, `--runtime`, `--image-name`, ...)
* `just dev` / `just prod` - Convenience wrappers that pass the correct defaults (ports, container names)
* `just logs` - Tail container logs using whichever runtime is available
* `pnpm dev` - Local development
* `pnpm build` - Next.js production build
* `pnpm start` - Serve built app
* `pnpm test` - Run Vitest test suite
* `pnpm lint` - Lint codebase
* `pnpm format` - Format code

## Directory Structure

```
/
├─ app/                 # Next.js app router pages
├─ components/          # Reusable React components
├─ infra/               # Client-side utilities and hooks (wagmi tracking, unlock)
├─ lib/                 # Utilities & API clients
├─ prisma/              # Dual Prisma schemas (crdb/, pg/)
├─ public/              # Static assets (fonts, images)
├─ services/            # Placeholder service layer (wallet summaries)
├─ tests/               # Vitest tests and helpers
├─ dev.sh / prod.sh     # Root-level containerized dev/prod runners
├─ justfile             # Just recipes for dev/prod/logs
├─ .devcontainer/       # Devcontainer configuration for editors
├─ .github/workflows/   # CI definitions
└─ README.md            # This file
```

## Newcomer Guide (Codebase Tour)

### App Entry + Routing

* `app/layout.tsx` is the root layout, wires global styles + providers and wraps every route.  
* `app/(site)` hosts the public marketing/home route (`page.tsx`).  
* `app/(wallet)` hosts wallet UI routes and provides the themed layout shell.  
* `app/Providers.client.tsx` + `app/Web3Providers.client.tsx` configure React Query + Wagmi client-side.  
* `app/ClientOnly.tsx` is a helper to gate UI against hydration quirks.  

### UI + Wallet UX

* `components/home/*` is the primary home page UI surface (wallet actions, XRPL panel, and login gate).  
* `components/wallet/*` and `components/ui/*` host wallet-specific and shared UI atoms.  
* `infra/state/walletStore.ts` holds the in-memory unlocked wallet state.  

### Wallet Logic + APIs

* `lib/wallet.ts` contains the create/unlock flow and PBKDF2 + AES-GCM session encryption.  
* `app/api/create-wallet/route.ts` creates an encrypted wallet payload.  
* `app/api/track-wallet/route.ts` accepts wallet telemetry for dev observability.  

### Data + Prisma

* `prisma/crdb/schema.prisma` is the OLTP schema (wallets + transactions).  
* `prisma/pg/schema.prisma` is the OLAP schema (user + daily summaries).  
* `infra/db/prisma-crdb.ts` and `infra/db/prisma-pg.ts` are the database client factories.  
* `infra/utils/summary.service.ts` wraps the OLAP read path for summaries.  

### Messaging + Agents

* `infra/kafka/*` provides a Kafka REST producer/consumer client.  
* `infra/agentic/*` holds agent orchestration, RAG, and wallet-policy logic.  

### Runtime + Local Dev

* `dev.sh` and `prod.sh` are the Podman/Docker runners for local and production-like builds.  
* `justfile` provides convenience wrappers for the shell scripts.  
* `tests/*` contains Vitest suites and helpers.  

### Things to Learn Next

* Trace the wallet creation flow: `components/home/*` → `/api/create-wallet` → `lib/wallet.ts`.  
* Review Wagmi + connector setup in `app/Web3Providers.client.tsx` and `infra/wagmi/wagmi.ts`.  
* Learn how data is pulled from OLAP by reading `infra/utils/summary.service.ts` and the `pg` Prisma schema.  
* Inspect Kafka agent wiring in `infra/agentic/kafka.ts` and the REST client in `infra/kafka/client.ts`.  
* Extend tests in `tests/lib/*` and `tests/app/api/*` for new wallet flows.  

## Testing

1. Spin up the dev container or run locally.
2. Execute:

   ```bash
   pnpm test
   ```
3. Tests include basic wallet flows, network switching, and form validation.

## Deployment

1. Build production image:

   ```bash
   ./prod.sh             # builds + runs on http://localhost:2999
   ./prod.sh --port 8080 # expose production build on a custom port
   ```
2. Push to container registry (`podman push` or `docker push`, depending on the runtime).
3. Deploy via your platform of choice (AWS ECS, Azure ACR, etc.).

## Contributing

1. Fork the repo.
2. Create feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes and push.
4. Open a PR describing your changes.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) and review the [Contributing Guidelines](CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgements

* Inspired by desert landscapes and traditional Middle Eastern patterns.
* Thanks to the WAGMI and Next.js communities for open-source support.
