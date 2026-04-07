//! Legacy umbrella crate for historical Rust dependencies.
//! Primary tooling in this repository: **Foundry** (contracts), **Deno** (node + authority),
//! **issuance-eip712-sidecar** (HTTP PKCS#11/local signing bridge), **viewer-egui** (WASM UI).

#![allow(dead_code)]
#![allow(clippy::missing_errors_doc)]

/// Placeholder so `cargo check` succeeds at the workspace root without pulling in removed binaries.
pub const REPO_ROOT_LIB_MARKER: bool = true;
