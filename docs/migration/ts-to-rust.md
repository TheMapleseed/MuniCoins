# Phased migration: Deno/TS services → Rust

Goal: **no new** TypeScript features (see `.cursor/rules/rust-stack-no-js.mdc`); shrink and replace legacy `*.ts` with Rust binaries and shared crates.

| Current (Deno) | Target (Rust) | Notes |
|----------------|---------------|--------|
| `node.ts`, `src/node/**` | `muni-token-node` binary (Axum/Tokio) + optional `muni-indexer` | KV/Postgres via `sqlx` or retain SQLite; long migration. |
| `issuance-authority.ts`, `src/authority/**` | `muni-issuance` HTTP service or fold into sidecar policy | Keep EIP-712 sidecar for keys; authority = orchestration + RPC reads. |
| `main.ts`, `src/intersect/**` | `muni-intersect` library crate + thin CLI | Share types with WASM via `serde` / `rkyv` as needed. |
| `scripts/serve_ui_dist.ts` | Optional: `hyper` static serve or keep Deno **only** as static host | Smallest TS surface; acceptable as tooling. |

**Order of attack (suggested):** (1) extract `intersect` math to a Rust crate used by tests; (2) token node HTTP surface; (3) issuance authority; (4) retire Deno tasks from CI.

**WASM UI** stays in **`viewer-egui/`** (canvas) and **`ui/`** (Leptos); both already Rust → WASM, not TS.
