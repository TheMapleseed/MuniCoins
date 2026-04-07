# `issuance-eip712-sidecar`

Rust HTTP service implementing the **same** signing contract the Deno issuance authority expects when `ISSUANCE_SIGNER_BACKEND` is `cryptech`, `opentitan`, or `tkey`: `POST /v1/eip712/sign` with a JSON body matching viem `signTypedData` parameters, response `{ "signature": "0x..." }`.

This binary uses a **local** `ISSUANCE_SIGNER_PRIVATE_KEY` (set `CHAIN_ID` to match your network). For production, keep this process behind network policy and replace the internal signer with PKCS#11 (e.g. after [SoftHSMv2](https://github.com/softhsm/SoftHSMv2) provisioning in `deploy/softhsm/`) while preserving the HTTP API.

## Run

**Source IP policy (Rust, in-process):** By default `SIDECAR_ENFORCE_SOURCE_NETWORK` is on. Either set **`SIDECAR_ALLOWED_SOURCE_CIDRS`** to your cluster/private ranges (e.g. `10.0.0.0/8,172.16.0.0/12`) or use **`ALLOW_INSECURE_LOCAL_DEV=true`** for loopback-only development (`127.0.0.1/32,::1/128`). Set **`SIDECAR_ENFORCE_SOURCE_NETWORK=false`** only if you rely entirely on Kubernetes `NetworkPolicy` / firewall (not recommended for production). Optional **`SIDECAR_TRUST_PROXY_FROM_CIDRS`**: when the TCP peer is in these CIDRs, the effective client IP is the first hop in `X-Forwarded-For`.

```bash
export ISSUANCE_SIGNER_PRIVATE_KEY=0x...
export CHAIN_ID=1
export SIDECAR_PORT=8788
export ALLOW_INSECURE_LOCAL_DEV=true   # or set SIDECAR_ALLOWED_SOURCE_CIDRS instead
# Optional: match Deno cryptech sidecar auth
export SIDECAR_API_KEY=your-secret
cargo run -p issuance-eip712-sidecar
```

## CORS

Default: **no** permissive CORS (appropriate for server-to-server). Optional:

- `CORS_ALLOW_ORIGINS=https://a.example.com,https://b.example.com`
- `ALLOW_INSECURE_CORS_ALL=true` — **dev only** (`*`).

## Health

- `HEALTH_MINIMAL=true` — response `{ "ok": true }` only.
- `HEALTH_REQUIRE_AUTH=true` — requires `Authorization: Bearer <SIDECAR_API_KEY>` when `SIDECAR_API_KEY` is set.

## Errors

- `500` responses omit internal details unless `VERBOSE_ERRORS=true`.

## Endpoints

- `GET /health`
- `POST /v1/eip712/sign` — body from Deno `stringifyEip712Payload(signTypedData parameters)`; optional `Authorization: Bearer <SIDECAR_API_KEY>`

Point the issuance authority at this service, for example:

```bash
export ISSUANCE_SIGNER_BACKEND=cryptech
export ISSUANCE_SIGNER_ADDRESS=0x...   # must match sidecar key
export CRYPTECH_SIDECAR_BASE_URL=http://127.0.0.1:8788
deno task authority:start
```
