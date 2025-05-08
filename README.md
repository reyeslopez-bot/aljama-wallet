# Aljama Wallet

**Aljama Wallet** is a secure, Middle Eastern–themed Web3 wallet built with Next.js, WAGMI, and Ethers.js, containerized with Podman for consistent development and production environments.

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
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Contributing](#contributing)
13. [License](#license)
14. [Acknowledgements](#acknowledgements)

---

## Project Overview

Aljama Wallet aims to deliver a seamless, culturally resonant wallet experience for users in Middle Eastern and global markets. It integrates best-in-class security practices with an intuitive UI/UX inspired by desert and dune motifs. Key goals:

* **Security First:** Leverage WAGMI & Ethers.js for audited blockchain interactions.
* **Container Consistency:** Use Podman for deterministic builds across environments.
* **Modular UI:** Tailwind CSS + custom Middle Eastern aesthetic.

## Features

* **Create**, **Unlock**, and **Import** wallets via mnemonic or private key.
* **Secure storage** of encrypted keys in local encrypted storage.
* **Network switching** between Ethereum Mainnet, Testnets, and custom RPCs.
* **Transaction history** display and simple on-chain interactions.
* **Themed UI** components (cards, buttons) aligned with Aladin-inspired typography.

## Tech Stack & Architecture

* **Next.js (App Router):** Server-side rendering and API routes
* **React 18 + TypeScript:** Strongly-typed components and hooks
* **WAGMI & Ethers.js:** Blockchain connectivity and wallet management
* **Tailwind CSS:** Utility-first styling, custom `aladin` font integration
* **Podman Containerfile:** Single/multi-stage build for dev & prod
* **pnpm:** Fast, deterministic package management
* **Playwright:** End-to-end UI testing
* **GitHub Actions:** CI for lint, build, and test

## Prerequisites

* **Podman (v4+)** or Docker
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

   Copy `.env.example` to `.env.local` and fill in the values:

   ```ini
   NEXT_PUBLIC_RPC_URL=<YOUR_RPC_ENDPOINT>
   NEXTAUTH_SECRET=<SECURE_RANDOM_STRING>
   ```

## Development Workflow

### Running in Container

```bash
# Starts Podman container, installs dependencies, and runs dev server
./dev.sh
```

### Running Locally

```bash
pnpm dev
```

### Linting & Formatting

```bash
pnpm lint      # ESLint
pnpm format    # Prettier
```

## Configuration & Environment Variables

| Key                    | Description                      | Example                                                          |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------- |
| NEXT\_PUBLIC\_RPC\_URL | RPC endpoint for blockchain node | [https://eth-goerli.example.com](https://eth-goerli.example.com) |
| NEXTAUTH\_SECRET       | Secret for NextAuth.js sessions  | supersecretvalue123                                              |

## Scripts & Commands

* `./dev.sh` - Launch development container + server
* `./prod.sh` - Build and start production image
* `pnpm dev` - Local development
* `pnpm build` - Next.js production build
* `pnpm start` - Serve built app
* `pnpm test` - Run Playwright tests
* `pnpm lint` - Lint codebase
* `pnpm format` - Format code

## Directory Structure

```
/  
├─ app/                 # Next.js app router pages
├─ components/          # Reusable React components
├─ hooks/               # Custom React hooks (e.g., useWallet)
├─ lib/                 # Utilities & API clients
├─ public/              # Static assets (fonts, images)
├─ scripts/             # dev.sh, prod.sh
├─ tests/               # Playwright e2e tests
├─ Containerfile        # Podman build spec
├─ .github/workflows/   # CI definitions
└─ README.md            # This file
```

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
   ./prod.sh
   ```
2. Push to container registry (Podman login + `podman push`).
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

