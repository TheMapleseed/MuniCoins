# Build system

## Recommendation

| Layer | Tool | Why |
|--------|------|-----|
| Rust crates | **Cargo** | Workspace: `sidecar`. Standalone Trunk crates: `viewer-egui/`, **`ui/`** (Leptos), each with its own lockfile. |
| WASM bundle | **Trunk** | `viewer-egui/` and **`ui/`** (`Trunk.toml`, `index.html`). Pulls `wasm-bindgen`, `wasm-opt`, no Node bundler. |
| Web UI host | **Deno** | `deno task ui:serve` → `scripts/serve_ui_dist.ts` serves **`ui/dist`** (static files + WASM MIME only). |
| Task runner | **Just** (`justfile`) | One command surface: `just viewer-wasm-release`, `just all`. Install: `cargo install just`. |
| Fallback | **`scripts/build.sh`** | `./scripts/build.sh -t <target> [-r] [-o 'extra args'] [-- …]` — same targets without Just. |
| Contracts | **Foundry** (`forge`) | Matches existing `forge build` / CI. |
| Deno (interim) | **`deno task check`** | Indexer, issuance authority, intersect remain TypeScript until ported; `just deno-check` keeps them typechecked. |

Avoid introducing **npm/webpack** for the Rust/WASM path: Trunk + Cargo is enough. The repo root `package.json` exists only for OpenZeppelin contract deps.

**No new JavaScript or TypeScript** for application code—see `.cursor/rules/rust-stack-no-js.mdc`. Existing Deno `.ts` files remain until replaced by Rust; phased plan: `docs/migration/ts-to-rust.md`.

**Hardened canvas / anti-scrape UX** (wgpu, flashlight, dither, etc.) is **not** “maximum security forever”—see `docs/security/hardened-viewer.md` for limits, legal notes, and a checkbox roadmap.

## Prerequisites

```bash
rustup target add wasm32-unknown-unknown
cargo install trunk just   # trunk = WASM web; just = tasks (optional)
```

## Targets

| Command | What it does |
|---------|----------------|
| `just viewer-wasm-release` | `trunk build --release` → `viewer-egui/dist/` |
| `just ui-wasm-release` | `trunk build --release` → `ui/dist/` (Leptos) |
| `just viewer-serve` | `trunk serve` (egui dev) |
| `just ui-serve` | `deno task ui:serve` (after `ui` trunk build) |
| `just sidecar-release` | Release binary `issuance-eip712-sidecar` |
| `just deno-check` | `deno task check` |
| `just contracts` | `forge build` |
| `just check` | Sidecar + egui WASM + **Leptos WASM** + Deno typecheck |
| `just build-release` | Sidecar + both Trunk releases + forge build |
| `just all` | `check` then `build-release` |

Shell equivalent: `./scripts/build.sh -t check`, `./scripts/build.sh -t build-release`, `./scripts/build.sh -t all` (add `-r` for release where noted in `-h`).

## Systems documentation (Sphinx, reStructuredText)

A **subsystem map** with paths into this repository lives under ``docs/systems/`` (``.rst`` sources, ``conf.py``). Build HTML locally:

```bash
python3 -m venv .venv-docs
.venv-docs/bin/pip install sphinx
.venv-docs/bin/sphinx-build -b html docs/systems docs/systems/_build
```

Open ``docs/systems/_build/html/index.html``. The optional venv directory ``.venv-docs/`` is gitignored.

## Deployment shapes

| Shape | What you ship | Notes |
|-------|----------------|--------|
| **Container** | Multi-stage image: build Rust with `cargo chef` or plain `cargo build --release`, runtime `distroless` or `alpine`. Static viewer: `nginx` serving `viewer-egui/dist` after `trunk build --release`. | See `deploy/Dockerfile.*`. |
| **Serverless** | **Static** WASM/JS/CSS from `viewer-egui/dist` to S3+R CloudFront, Vercel static, etc. APIs stay separate (token node, issuance) — not suitable for long-lived SSE/WebSocket without managed runners. | Stateless WASM hosting is ideal for the viewer only. |
| **Remote server** | `systemd` units or `docker compose`: token node, optional issuance authority, sidecar on localhost or overlay network; reverse proxy TLS. | Same artifacts as container, without orchestrator. |

Git push → CI should run `just check` (or `scripts/build.sh -t check`) on every branch; release pipeline runs `just build-release` and publishes images/artifacts.

## TS / JS → Rust / WASM (scope)

- **Today:** The **viewer** is already **Rust → WASM** (`viewer-egui`, canvas + egui). The **EIP-712 sidecar** is Rust. Remaining services (`src/node`, `src/authority`, `src/intersect`, `main.ts`) are Deno/TS.
- **Direction:** Port incrementally (e.g. intersect math → Rust crate consumed from WASM + sidecar). Replacing the token node and issuance HTTP servers is a **large** migration; track it in issues, not in a single build script.
- **“Hardened UI”** (wgpu/pixels, flashlight reveal, temporal dither, LSB watermark, integrity probes): treat as **optional product modes** with threat-model + accessibility/legal review before shipping. Prototype behind feature flags in `viewer-egui`, not in Deno.

## Compliance note

Covert fingerprinting, silent watermarks, and anti-recording tricks can conflict with **privacy regulation** and user expectations. Document purpose, consent, and opt-out if you ship them.
