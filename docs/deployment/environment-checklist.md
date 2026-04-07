# Deployment environment checklist

Use before mainnet or production-adjacent environments. Not exhaustive for legal/compliance.

## Smart contract

- [ ] `TokenValuationLedger` deployed; constructor args reviewed (`asset`, `totalTokenSlots`, `initialActiveSlots`, `pInitial`, `pSale`, `pCore`, `pPremium`, admin roles, oracles).
- [ ] Roles assigned: `RETURN_ROLE`, `PAUSER_ROLE`, policy roles — **multisig** for admin where required.
- [ ] `setPolicy` / return bounds: `maxAbsReturnWad`, period length, staleness caps as appropriate.
- [ ] `setSolvencyPolicy`: `minCollateralRatioBps`, `maxDailyRedemptionAmount` if used.
- [ ] `setExpiryProofPolicy` / `setIssuanceCertificationPolicy`: signers and enforcement flags match operations.
- [ ] `setComplianceMode` / allowlist if institutional policy requires it.
- [ ] Liquidity / bootstrap steps completed (`LiquidityBootstrapped` / token range as designed).

## Issuance authority (Deno)

- [ ] `RPC_URL`, `LEDGER_ADDRESS`, `CHAIN_ID` correct for the network.
- [ ] `ISSUANCE_SIGNER_BACKEND` matches deployment (`local` vs sidecar).
- [ ] `ISSUANCE_AUTH_API_KEY` set (or explicit dev-only `ALLOW_INSECURE_NO_AUTH`).
- [ ] If sidecar: `ISSUANCE_SIGNER_ADDRESS`, `CRYPTECH_SIDECAR_BASE_URL` (or OpenTitan/TKey vars), optional mTLS PEM paths.
- [ ] Firewall: authority listens only on intended interfaces.
- [ ] `CORS_ALLOW_ORIGINS` for browser admin UIs; never use `ALLOW_INSECURE_CORS_ALL` in production.
- [ ] `HEALTH_MINIMAL=true` / `HEALTH_REQUIRE_AUTH=true` if load balancers should not see signer metadata.
- [ ] `VERBOSE_ERRORS` **unset** in production.

## EIP-712 sidecar (Rust)

- [ ] `ISSUANCE_SIGNER_PRIVATE_KEY` / HSM path matches on-chain `issuanceSigner` address.
- [ ] `CHAIN_ID` matches network.
- [ ] **Source IP:** `SIDECAR_ALLOWED_SOURCE_CIDRS` set for production cluster ranges, or `ALLOW_INSECURE_LOCAL_DEV=true` only in dev; avoid `SIDECAR_ENFORCE_SOURCE_NETWORK=false` unless NetworkPolicy fully replaces in-process checks.
- [ ] Optional `SIDECAR_TRUST_PROXY_FROM_CIDRS` if a reverse proxy terminates TLS in front of the sidecar.
- [ ] `SIDECAR_API_KEY` aligned with proxy/authority expectations.
- [ ] TLS/mTLS configured per `docs/security/mtls-authority-sidecar.md` and `docs/security/mtls-and-proxy.md` if required.
- [ ] CORS: only if browsers hit the sidecar directly (unusual); otherwise leave `CORS_ALLOW_ORIGINS` unset.

## Token node (Deno)

- [ ] `START_BLOCK` set to deployment block or first relevant block.
- [ ] `LEDGER_ADDRESS`, optional `REGISTRY_ADDRESS`.
- [ ] `NODE_KV_PATH` writable and backed up.
- [ ] `LEDGER_DATABASE_URL` if Postgres mirror; migrations/permissions OK.
- [ ] Influx/Vector endpoints if used.
- [ ] Optional `NODE_API_KEY` for `/stats`, `/token`, etc.; **`GET /health`**, **`GET /api/snapshot`**, and **`GET /snapshot`** stay unauthenticated (health probes + public chain mirror for the WASM viewer), unless you front the node with a proxy that enforces auth for everything.
- [ ] `CORS_ALLOW_ORIGINS` set if browsers call the node API; omit for internal-only JSON clients.

## SoftHSM (if applicable)

- [ ] `SOFTHSM2_CONF` and token directory on secure storage; permissions restricted.
- [ ] Pins stored in vault, not in shell history.

## Post-deploy smoke

- [ ] `GET /health` on authority and sidecar.
- [ ] One **read-only** contract call from indexer matches Etherscan.
- [ ] Optional: one **test issuance** path on a testnet slot.
