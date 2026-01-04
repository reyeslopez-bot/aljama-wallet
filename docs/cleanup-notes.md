## 2025-02-28 Cleanup

- Removed unused hero UI set (`components/hero/*`) that was no longer referenced by the landing page.
- Removed unused UI scaffolding (`Header`, `Footer`, `LanguageSwitcher`, `CreateWalletModal`, `WalletDashboard`) to keep front-facing surface minimal.
- Dropped unused wallet form/dashboard stubs and the XRPL dev card to avoid shipping dead code in the wallet module.
- Trimmed wallet barrel exports to only the active components and cleaned up redundant eslint disables in Prisma client wrappers.

### Recommendations

- Gate future hero/UI additions behind live flows to avoid shipping static placeholders.
- Add a small `knip` or lint check in CI to flag unused exports before they hit main.
