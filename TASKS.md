# Proposed Follow-up Tasks

## Typo Fix
- Correct "Aladin-inspired" to "Aladdin-inspired" in the features list for clarity.
  - File: README.md (Features section)

## Bug Fix
- Align `useUnlockWallet` with the actual `unlockWallet` signature by passing the required params instead of casting to `(password: string) => Promise<void>`, preventing runtime failures when unlock logic is implemented.
  - Files: infra/utils/useUnlockWallet.ts, lib/wallet.ts

## Comment/Documentation Discrepancy
- Update the README directory structure to reflect that `dev.sh`/`prod.sh` live at the repository root instead of under a `scripts/` directory.
  - File: README.md (Directory Structure section)

## Test Improvement
- Populate `tests/helpers/walletMocks.ts` with reusable wagmi/ethers wallet mocks (addresses, connectors) so Playwright and unit tests can avoid ad-hoc fixtures.
  - File: tests/helpers/walletMocks.ts
