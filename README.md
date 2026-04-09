# MuniCoins — Token valuation ledger (Ethereum + off-chain services)

This repository implements a **bifurcated-capital** token valuation model. **Product series:** **Series A** (Accumulation) and **Series T** (Treasury) are the names for the two economic emphases---long-hold accrual vs.\ treasury-style horizon---as defined in the whitepaper; the reference on-chain contract remains a single global index unless extended. The **current** mathematical + architecture narrative is **`municoins-whitepaper.tex`** at the repository root (Overleaf-ready); `token-valuation-algorithm.tex` remains a legacy algorithm-only extract.

- **On-chain:** Solidity contracts (`contracts/`), primarily `TokenValuationLedger.sol`, auditable by anyone.
- **Intersect:** Off-chain **dual-leg** valuation (`src/intersect/`) fuses ledger fair value with an NFT-attested mirror (weighted / geometric / harmonic).
- **Deno token node** (`src/node/`, `node.ts`) indexes events, exposes HTTP + SSE, and optional Postgres/Influx sinks.
- **Issuance:** A **Deno issuance authority** (`issuance-authority.ts`, `src/authority/`) that signs EIP-712 `IssuanceCertificate` payloads. Hardware-backed paths call an HTTP **sidecar** (CrypTech / OpenTitan / Tillitis / PKCS#11) per `src/authority/signers/README.md`.
- **EIP-712 sidecar (reference):** Rust binary `issuance-eip712-sidecar` in `sidecar/` — local key signing over HTTP; production swaps the signer for PKCS#11 behind the same API.
- **Web UI (Rust → WASM, Leptos):** `ui/` — Leptos CSR, **Trunk** build, **`deno task ui:serve`** to host `ui/dist` (static server only). **Legacy:** `viewer-egui/` (egui canvas) until migrated. Snapshot JSON still comes from the **token node** (`GET /api/snapshot`).
- **Signing (Rust):** EIP-712 **`issuance-eip712-sidecar`** holds the reference signing HTTP API; source-IP allowlisting is implemented **in Rust** on the sidecar (see `sidecar/README.md`). The Deno issuance authority remains an orchestration option that calls this sidecar for hardware-backed backends.

There is **no** Go `core/capital/...` tree; older README text describing that layout was removed as inaccurate. Legacy standalone Rust files at the repo root were **removed**; the workspace is `municoin-root` + `sidecar` + `viewer-egui` (excluded).

## Quick start

| Goal | Command / path |
|------|----------------|
| **Unified build / CI** | **`BUILD.md`** — `just check`, `just build-release`, or `./scripts/build.sh -t all` |
| Deno typecheck | `deno task check` |
| Token node | `deno task node:start` (see `src/node/README.md`) |
| Issuance authority (local key) | `deno task authority:start` |
| Solidity build / tests | `forge build` / `forge test` (Foundry) |
| EIP-712 sidecar (Rust) | `cargo run -p issuance-eip712-sidecar` (see `sidecar/README.md`) |
| Leptos UI (WASM) | `cd ui && trunk serve` or `deno task ui:dev`; host: `deno task ui:serve` after `deno task ui:trunk` |
| egui viewer (legacy, Trunk) | `cd viewer-egui && trunk serve` or `just viewer-serve` |
| Container images | `deploy/Dockerfile.sidecar`; static sites: `deploy/Dockerfile.viewer-static` (egui), `deploy/Dockerfile.ui-static` (Leptos) |
| SoftHSM PKCS#11 token (dev) | `deploy/softhsm/README.md` |

## Layout

```
contracts/           TokenValuationLedger, ValuationLinkRegistry, tests (Foundry)
src/intersect/       Dual-leg valuation (ledger × NFT mirror)
src/node/            Deno indexer + HTTP API + optional DB sinks
src/authority/       Issuance EIP-712 HTTP service + signer backends
sidecar/             Rust HTTP signer (reference implementation for sidecar contract)
viewer-egui/         egui / WASM viewer (legacy; standalone crate)
ui/                  Leptos CSR → WASM; Deno serves ui/dist
deploy/              Softhsm, Vector, Pingap, Linkerd templates
token-valuation-algorithm.tex   Legacy algorithm-only LaTeX extract
municoins-whitepaper.tex   Current technical whitepaper (Overleaf); notes in whitepaper/README.md
docs/security/ docs/deployment/   Threat model, ops, mTLS, env checklist
docs/systems/    Sphinx RST map of subsystems → repo paths (see BUILD.md)
```

## Security & operations

- Contract tests: `test/`. CI: `.github/workflows/security.yml` (forge + slither when tooling is available).
- Issuance authority requires API key by default (`ISSUANCE_AUTH_API_KEY`); see `src/authority/README.md`.
- **Sidecar** must run on a locked-down network segment; optional `SIDECAR_API_KEY` and mTLS env vars on the Deno client (`*_TLS_*`).

## License

**Commercial / proprietary** — see `LICENSE` for terms. No use or redistribution except under a separate written agreement with The Mapleseed Incorporated.
