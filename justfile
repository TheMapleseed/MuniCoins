# MuniCoins — unified build tasks (install: cargo install just)
# Run `just` or `just --list` from the repo root.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

# --- Rust / WASM viewer (egui + Trunk) ---

wasm-target:
    rustup target add wasm32-unknown-unknown

viewer-wasm: wasm-target
    cd viewer-egui && trunk build

viewer-wasm-release: wasm-target
    cd viewer-egui && trunk build --release

viewer-serve:
    cd viewer-egui && trunk serve

viewer-check:
    cd viewer-egui && cargo check --lib --target wasm32-unknown-unknown

viewer-native:
    cd viewer-egui && cargo run --features native --bin muni-viewer-egui

# --- Leptos UI (Rust → WASM CSR; Deno serves `ui/dist` — minimal TS in Deno is static server only) ---

ui-check: wasm-target
    cd ui && cargo check --target wasm32-unknown-unknown

ui-wasm: wasm-target
    cd ui && trunk build

ui-wasm-release: wasm-target
    cd ui && trunk build --release

ui-serve:
    deno task ui:serve

# --- Rust sidecar (EIP-712 signing) ---

sidecar:
    cargo build -p issuance-eip712-sidecar

sidecar-release:
    cargo build -p issuance-eip712-sidecar --release

sidecar-check:
    cargo check -p issuance-eip712-sidecar

# --- Deno (indexer, issuance authority, intersect — until ported to Rust) ---

deno-check:
    deno task check

deno-fmt:
    deno fmt

# --- Solidity ---

contracts:
    forge build

contracts-test:
    forge test

# --- Aggregate ---

check: sidecar-check viewer-check ui-check deno-check
    @echo "check: ok"

build-release: sidecar-release viewer-wasm-release ui-wasm-release contracts
    @echo "build-release: ok"

all: check build-release
    @echo "all: ok"
