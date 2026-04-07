# Operational controls

Checklist-oriented runbook for operators. Pair with `docs/deployment/environment-checklist.md`.

## Secrets rotation

| Secret | Suggested cadence | Notes |
|--------|-------------------|--------|
| `ISSUANCE_AUTH_API_KEY` | On staff change or quarterly | Update reverse proxy and Deno env together. |
| `SIDECAR_API_KEY` | Same | Restart sidecar and authority after change. |
| SoftHSM SO/User PINs | Per org policy | Requires ceremony to re-wrap or rotate tokens. |
| RPC API keys | On leak suspicion or quarterly | Rotate in provider dashboard; update all services. |
| TLS certificates (mTLS) | Before expiry | Automate renewal where possible. |

After rotating **issuance signing keys**, update **on-chain** `setIssuanceCertificationPolicy` / `issuanceSigner` to the new address before retiring the old key.

## Key ceremonies

- **Generate** secp256k1 keys in HSM or approved environment; **never** commit private keys to git.
- **Dual control** for SO PIN and user PIN where policy requires it.
- **Witnessed** initialization of new tokens (`softhsm2-util` or HSM vendor procedure); record serials/slot IDs in secure CMDB.
- **Export** only what policy allows (often: address for chain registration, not raw key).

## Access logging

- Log **authentication failures** to issuance authority and sidecar (reverse proxy access logs, application logs).
- Log **admin actions** on-chain via events; indexers should retain **immutable** log sinks (e.g. WORM storage) for serious deployments.
- **Never** log full API keys or PINs; log key ids or fingerprints only.

## Alerting (suggested)

| Signal | Severity |
|--------|----------|
| HTTP 5xx on authority / sidecar | High |
| Sudden spike in `/cert/issuance` 401 | Medium |
| On-chain `Paused` event | High |
| Contract `PolicyUpdated`, `IssuanceCertificationPolicyUpdated` | Medium (verify expected change) |
| Indexer lag vs chain head | Medium |

Wire alerts to on-call per your org (PagerDuty, Opsgenie, etc.).

## Runbooks (outline)

1. **Incident: suspected leaked API key** — rotate key, review access logs, scan for unauthorized signatures (chain + off-chain logs).
2. **Incident: sidecar down** — fail closed: issuance stops; restore VM/PKCS#11; verify health endpoint.
3. **Incident: wrong `issuanceSigner` on-chain** — pause if needed; multisig transaction to correct signer; communicate to integrators.

## Backup and restore drills

- **SoftHSM**: backup `directories.tokendir` per vendor guidance; **restore drill** quarterly on a non-prod host.
- **Postgres** (if used): test restore from snapshot to a scratch instance; verify row counts for `token_state`.
- **Deno KV**: copy `NODE_KV_PATH`; restore drill: replay from chain if KV lost (slower but consistent).

Document **RTO/RPO** targets in your internal wiki; this repo only lists technical artifacts.
