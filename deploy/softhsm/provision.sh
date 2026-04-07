#!/usr/bin/env bash
# Provision SoftHSMv2 token storage for PKCS#11 sidecar development/staging.
# Requires: softhsm2-util (SoftHSMv2). See deploy/softhsm/README.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEN="${ROOT}/deploy/softhsm/generated"
CONF_OUT="${SOFTHSM2_CONF:-${GEN}/softhsm2.conf}"
TOKDIR="${SOFTHSM_TOKENDIR:-${GEN}/tokens}"
LABEL="${SOFTHSM_TOKEN_LABEL:-muni-issuance}"

if ! command -v softhsm2-util >/dev/null 2>&1; then
  echo "softhsm2-util not found. Install SoftHSMv2: https://github.com/softhsm/SoftHSMv2" >&2
  exit 1
fi

mkdir -p "${GEN}" "${TOKDIR}"

TEMPLATE="${ROOT}/deploy/softhsm/softhsm2.conf.example"
if [[ ! -f "${TEMPLATE}" ]]; then
  echo "Missing ${TEMPLATE}" >&2
  exit 1
fi

sed "s|TOKENDIR_PLACEHOLDER|${TOKDIR}|g" "${TEMPLATE}" > "${CONF_OUT}"
export SOFTHSM2_CONF="${CONF_OUT}"

echo "SOFTHSM2_CONF=${SOFTHSM2_CONF}"
echo "Token directory: ${TOKDIR}"

# Detect existing initialized token (best-effort: slot list shows label).
if SOFTHSM2_CONF="${CONF_OUT}" softhsm2-util --show-slots 2>/dev/null | grep -q "Initialized:.*yes"; then
  echo "SoftHSM already has at least one initialized token; skipping --init-token."
  echo "To add another token, run softhsm2-util manually or remove token DBs (destructive)."
  exit 0
fi

if [[ -z "${SOFTHSM_SO_PIN:-}" || -z "${SOFTHSM_USER_PIN:-}" ]]; then
  echo "First-time init requires pins. Set SOFTHSM_SO_PIN and SOFTHSM_USER_PIN, then re-run." >&2
  echo "Example: SOFTHSM_SO_PIN=... SOFTHSM_USER_PIN=... $0" >&2
  exit 1
fi

# Non-interactive init (supported by common SoftHSM builds).
SOFTHSM2_CONF="${CONF_OUT}" softhsm2-util \
  --init-token \
  --slot 0 \
  --label "${LABEL}" \
  --so-pin "${SOFTHSM_SO_PIN}" \
  --pin "${SOFTHSM_USER_PIN}"

echo "Initialized token label=${LABEL} in slot 0."
SOFTHSM2_CONF="${CONF_OUT}" softhsm2-util --show-slots
