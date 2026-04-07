## Issuance Authority Service (Production)

Signs `IssuanceCertificate` EIP-712 payloads for `TokenValuationLedger.reissueCertified(...)`.

### Start

```bash
RPC_URL=https://... \
LEDGER_ADDRESS=0x... \
ISSUANCE_SIGNER_BACKEND=local \
ISSUANCE_SIGNER_PRIVATE_KEY=0x... \
ISSUANCE_AUTH_API_KEY=... \
deno task authority:start
```

Hardware-backed signing (CrypTech / OpenTitan / Tillitis TKey) uses co-located **sidecars**; set `ISSUANCE_SIGNER_BACKEND` to `cryptech`, `opentitan`, or `tkey`, provide `ISSUANCE_SIGNER_ADDRESS`, and the sidecar base URL for that platform. See `src/authority/signers/README.md`.

### Endpoints

- `GET /health`
- `POST /cert/issuance`

Request body:

```json
{
  "tokenId": "2",
  "caller": "0xabc...def",
  "nonce": "123",
  "deadline": "1735689600"
}
```

Response includes:

- `signature`
- canonical signed payload (`slotOwner`, `saleAmount`, etc)

### CORS

Default: **no** `Access-Control-Allow-Origin` (safe for server-to-server). For browser-based admin tools, set:

- `CORS_ALLOW_ORIGINS=https://app.example.com,https://admin.example.com` (comma-separated exact origins), or
- `ALLOW_INSECURE_CORS_ALL=true` (development only).

### Health hardening

- `HEALTH_MINIMAL=true` — `/health` returns only `{ "ok": true }` (no signer address).
- `HEALTH_REQUIRE_AUTH=true` — `/health` requires the same `ISSUANCE_AUTH_API_KEY` as `/cert/issuance` (use with probes that supply the header, or rely on mTLS at the proxy instead).

### Errors

- By default, `500` responses do **not** include internal exception text. Set `VERBOSE_ERRORS=true` for debugging only.

### Security notes

- API key auth is required by default.  
  To disable only in isolated local dev, set `ALLOW_INSECURE_NO_AUTH=true`.
- Protect endpoint with internal network policy + API key + mTLS (service mesh/proxy). See `docs/security/mtls-and-proxy.md`.
- Run signer on a hardened host and rotate key material regularly.
- Rotate `issuanceSigner` on-chain via `setIssuanceCertificationPolicy`.
