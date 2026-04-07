#!/usr/bin/env bash
# Quick check that the Rust EIP-712 sidecar responds on /health.
# Start the sidecar first, e.g.:
#   ISSUANCE_SIGNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
#   CHAIN_ID=31337 ALLOW_INSECURE_LOCAL_DEV=true cargo run -p issuance-eip712-sidecar
# (Default Rust source-IP policy requires SIDECAR_ALLOWED_SOURCE_CIDRS or ALLOW_INSECURE_LOCAL_DEV; see sidecar/README.md.)
set -euo pipefail

URL="${SIDECAR_HEALTH_URL:-http://127.0.0.1:8788/health}"

echo "GET $URL"
curl -sfS "$URL" | (command -v jq >/dev/null && jq . || cat -)
echo
echo "ok"
