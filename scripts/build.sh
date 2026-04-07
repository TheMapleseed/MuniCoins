#!/usr/bin/env bash
# Option-driven build (no Just required). Repository root = cwd.
# Usage:
#   ./scripts/build.sh -t all
#   ./scripts/build.sh -t viewer-wasm -r
#   ./scripts/build.sh -t sidecar -o "--verbose"
#   ./scripts/build.sh -t sidecar -- --features foo   # extra args after --
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="help"
RELEASE=""
OPTS_FROM_FLAG=()

usage() {
  echo "Usage: $0 -t <target> [-r] [-o 'extra args...'] [-- ...]"
  echo ""
  echo "Targets:"
  echo "  viewer-wasm   viewer-check   ui-wasm   ui-check"
  echo "  sidecar       deno-check     contracts"
  echo "  check         build-release  all"
  echo ""
  echo "  -t name   target (required)"
  echo "  -r        release (trunk --release, cargo --release)"
  echo "  -o '...'  extra args split on spaces (passed to trunk/cargo/forge/deno)"
  echo "  -h        help"
  echo "  --        end of flags; remaining args appended (e.g. cargo --features)"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t)
      shift
      TARGET="${1:?-t requires an argument}"
      shift
      ;;
    -r)
      RELEASE=1
      shift
      ;;
    -o)
      shift
      read -r -a OPTS_FROM_FLAG <<<"${1:?-o requires a string}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

EXTRA=("${OPTS_FROM_FLAG[@]}" "$@")

rust_wasm_target() {
  rustup target add wasm32-unknown-unknown 2>/dev/null || true
}

case "$TARGET" in
  help|"")
    usage
    exit 0
    ;;
  viewer-wasm)
    rust_wasm_target
    if [[ -n "$RELEASE" ]]; then
      (cd viewer-egui && trunk build --release "${EXTRA[@]}")
    else
      (cd viewer-egui && trunk build "${EXTRA[@]}")
    fi
    ;;
  viewer-check)
    rust_wasm_target
    (cd viewer-egui && cargo check --lib --target wasm32-unknown-unknown "${EXTRA[@]}")
    ;;
  ui-wasm)
    rust_wasm_target
    if [[ -n "$RELEASE" ]]; then
      (cd ui && trunk build --release "${EXTRA[@]}")
    else
      (cd ui && trunk build "${EXTRA[@]}")
    fi
    ;;
  ui-check)
    rust_wasm_target
    (cd ui && cargo check --target wasm32-unknown-unknown "${EXTRA[@]}")
    ;;
  sidecar)
    if [[ -n "$RELEASE" ]]; then
      cargo build -p issuance-eip712-sidecar --release "${EXTRA[@]}"
    else
      cargo build -p issuance-eip712-sidecar "${EXTRA[@]}"
    fi
    ;;
  deno-check)
    deno task check "${EXTRA[@]}"
    ;;
  contracts)
    forge build "${EXTRA[@]}"
    ;;
  check)
    cargo check -p issuance-eip712-sidecar "${EXTRA[@]}"
    rust_wasm_target
    (cd viewer-egui && cargo check --lib --target wasm32-unknown-unknown "${EXTRA[@]}")
    (cd ui && cargo check --target wasm32-unknown-unknown "${EXTRA[@]}")
    deno task check "${EXTRA[@]}"
    ;;
  build-release)
    ./scripts/build.sh -t sidecar -r
    ./scripts/build.sh -t viewer-wasm -r
    ./scripts/build.sh -t ui-wasm -r
    ./scripts/build.sh -t contracts
    ;;
  all)
    ./scripts/build.sh -t check
    ./scripts/build.sh -t build-release
    ;;
  *)
    echo "Unknown target: $TARGET" >&2
    usage >&2
    exit 1
    ;;
esac

echo "build.sh: target=$TARGET ok"
