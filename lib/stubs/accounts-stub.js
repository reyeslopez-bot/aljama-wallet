// Empty stub for wagmi's optional `accounts` (porto) peer dependency.
// The app does not use wagmi tempo connectors; this prevents webpack and
// turbopack from failing when they encounter the bare `accounts` specifier
// that @wagmi/core/tempo/Connectors.js imports via dynamic import().
export default {}
