## Token Node (Deno)

Purpose: run a dedicated indexer/ledger for `TokenValuationLedger` (+ optional `ValuationLinkRegistry`) so this system is tracked independently and efficiently.

### Start

```bash
RPC_URL=https://... \
LEDGER_ADDRESS=0x... \
REGISTRY_ADDRESS=0x... \
START_BLOCK=12345678 \
deno task node:start
```

Optional **`NODE_API_KEY`**: when set, routes require header `x-api-key: <value>`, except public read-only endpoints: `GET /health`, `GET /api/snapshot`, and `GET /snapshot` (same JSON; WASM/egui viewer uses these without a secret). Use with a reverse proxy or internal network for mutating or sensitive routes.

**CORS:** set `CORS_ALLOW_ORIGINS` (comma-separated) for browser clients, or leave unset for server-only. See `src/http/cors.ts`.

### API

- `GET /health`
- `GET /api/snapshot` (alias: `GET /snapshot`) — live chain mirror for the egui/WASM viewer. Requires `RPC_URL` and `LEDGER_ADDRESS`. Optional `SUM_TOKEN_IDS` (comma-separated) or query `?sum=1,2,3` to include `sumActiveClaimsMinor` for those token IDs.
- `GET /stats`
- `GET /snapshots?limit=30`
- `GET /token/:tokenId`
- `GET /link/:nftCollection/:nftTokenId`
- `GET /events` (SSE realtime stream)

### Storage

- Uses Deno KV (`NODE_KV_PATH`, default `./data/token-node.kv`).
- Persists:
  - last scanned block
  - aggregate stats
  - per-token state (owner/active/anchor)
  - NFT->ledger links
  - daily snapshots

### Optional Postgres mirror

Set `LEDGER_DATABASE_URL` and the node will mirror state to Postgres tables:

- `ledger_stats`
- `token_state`
- `token_links`
- `daily_snapshots`

### Optional InfluxDB metrics/events sink

Set all of:

- `INFLUX_URL`
- `INFLUX_ORG`
- `INFLUX_BUCKET`
- `INFLUX_TOKEN`

When configured, node writes:

- aggregate stats points
- token/link updates
- daily snapshots
- node lifecycle/index events

### Reconciliation

Every `NODE_RECONCILE_LOOPS` (default `20`) polling cycles, the node compares local stats with on-chain views and self-heals drift.

### Proxy options

- Linkerd2/Kubernetes template: `deploy/linkerd/token-node.yaml`
- Pingap gateway config: `deploy/pingap/pingap.toml`
- Vector pipeline template: `deploy/vector/vector.toml`

### Polars analytics

`analytics/polars_daily.py` reads `daily_snapshots` from Postgres and computes TVL delta series.

### Issuance certification (on-chain)

`TokenValuationLedger` now supports issuer-controlled certification:

- `setIssuanceCertificationPolicy(signer, enforceCertificates)`
- `reissueCertified(...)` path with EIP-712 issuer signature

When enforcement is enabled, non-certified reissue paths are blocked.

Off-chain issuance signer service:

- `issuance-authority.ts`
- `src/authority/issuance_service.ts`
- `src/authority/README.md`

### Forward-secrecy for off-chain sync

Use `src/node/sync/ratchet.ts` for encrypted ratcheting envelopes between off-chain systems that mirror ledger state.

