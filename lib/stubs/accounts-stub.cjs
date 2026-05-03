// Empty stub for wagmi's optional `accounts` (porto) peer dependency.
// The app does not use the wagmi tempo connectors; this stub prevents webpack
// and turbopack from failing to resolve the bare `accounts` specifier that
// @wagmi/core/tempo/Connectors.js imports via a dynamic import().
module.exports = {};
