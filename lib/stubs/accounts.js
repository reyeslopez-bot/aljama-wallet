// Stub for the wagmi v3 workspace-internal "accounts" package.
// This package is never published to npm — it exists only inside the wagmi
// monorepo at build time. The tempoWallet connector lazy-imports it at
// runtime via dynamic import('accounts'), which webpack and Turbopack both
// try to resolve statically. We alias this module to an empty stub so the
// build succeeds; tempoWallet will still throw at runtime if actually used,
// but this app only uses the injected() and walletConnect() connectors.
export default {}
