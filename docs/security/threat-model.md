# Threat model (MuniCoins issuance + ledger)

This document is maintained with the codebase. It is **not** a substitute for a formal security assessment.

## Design intent (what we protect)

**The valuation ledger is meant to be observable**—on-chain state, indexers, and HTTP mirrors such as `GET /api/snapshot` expose the same information anyone could obtain from RPC. There is no security goal of hiding balances or TVL from the public.

**What must be protected** is **unauthorized control** over token lifecycle and **unauthorized issuance**:

| Concern | Where it is enforced |
|--------|----------------------|
| Who may **sign** valid `IssuanceCertificate` payloads | **Off-chain:** issuance authority + `ISSUANCE_AUTH_API_KEY`, signer backend, optional sidecar + `SIDECAR_API_KEY` / mTLS / HSM. **On-chain:** `issuanceSigner` and certification / enforcement flags. |
| Who may **change policy**, pause, replace signers, post returns, etc. | **On-chain** roles (`DEFAULT_ADMIN_ROLE`, `RETURN_ROLE`, policy roles, …)—use multisig / timelock as appropriate. |

Public read APIs and viewers are not the control plane; they do not hold signing keys and should not accept issuance requests.

### Cluster-bound issuance (Rust signing + WASM UI)

- **Read-only UI:** The browser dashboard is **`viewer-egui/`** built as **Rust → WASM** (`wasm32-unknown-unknown`). It does not ship a separate JavaScript UI layer for ledger viewing; it fetches public snapshot JSON over HTTP.
- **Signing:** The **`issuance-eip712-sidecar`** (Rust) implements EIP-712 HTTP signing and **in-process source CIDR enforcement** (`SIDECAR_ALLOWED_SOURCE_CIDRS`, etc.—see `sidecar/README.md`). That is the supported place for **ring-zero-style** IP allowlisting in code; do not duplicate it in TypeScript.

Run **issuance origination** (Deno issuance authority when used, Rust sidecar, HSM clients) **only** on a **bounded inner network**: Kubernetes pod CIDR, VPC subnets, plus **NetworkPolicy** / firewall so the signing HTTP API is not on the public Internet. **Ingress** should allow only trusted workloads, CI, or admin paths (bastion, VPN, gateway + mTLS).

**Nuance:** The Deno authority still **reads chain state** via `RPC_URL` (egress to a provider or an **in-cluster** execution client). Signing **keys** and the **sidecar HTTP surface** stay on the private mesh; chain reads remain a separate trust boundary (scenario A).

## Assets

| Asset | What must hold |
|-------|----------------|
| Issuance private key / HSM material | Only authorized processes can sign `IssuanceCertificate` (EIP-712). |
| `ISSUANCE_AUTH_API_KEY` (Deno authority) | Only reverse proxies / callers you trust. |
| `SIDECAR_API_KEY` (Rust sidecar) | Same as above; sidecar must not be exposed to the public internet without TLS + policy. |
| SoftHSM / token DB | Files under `directories.tokendir` are key material at rest. |
| RPC endpoint credentials | Integrity and confidentiality of chain reads; prefer authenticated RPC in production. |
| Postgres / KV / Influx | Mirror data; compromise leaks analytics, not chain truth. |

## Actors and calls

| Actor | Typical capability |
|-------|---------------------|
| **Anyone** | Read contract state, replay historical events, call public `view` functions. |
| **`RETURN_ROLE`** | Post period returns (`applyPeriodReturnWithPeriod`); can affect global index and operational fund if malicious—use multisig / timelock. |
| **`POLICY_ROLE` / `ISSUER_POLICY_ROLE` / `PAUSER_ROLE` / etc.** | Change policies, pause, set issuance signer—protect via multisig. |
| **Slot owner** | Redeem own slot; reissue subject to funding + certification + compliance rules. |
| **Issuance authority (Deno)** | Signs only after reading canonical chain state (`ownerOf`, `pSale`) and checks; can be DoS’d or key-stolen if host is compromised. |
| **EIP-712 sidecar** | Holds or uses signing key; compromise = forged issuance certs if on-chain `issuanceSigner` matches stolen key. |

## Scenarios

### A. RPC provider is malicious or MITM

- **Reads** can be lied to (fake `ownerOf`, `pSale`). The authority would sign wrong payloads.
- **Mitigations**: trusted RPC, redundant providers, compare responses, or run a light client / your own node for signing-critical reads.

### B. Sidecar compromised (not the HSM)

- Attacker could sign arbitrary EIP-712 bodies **if** they also control or bypass API key and the key inside the sidecar process.
- **Mitigations**: mTLS (`docs/security/mtls-authority-sidecar.md`), network policy (localhost-only listener), HSM/PKCS#11 so raw key never exists in the sidecar process, separate monitoring.

### C. Deno issuance authority compromised

- Attacker can sign using the configured backend (local key or HTTP to sidecar). If using sidecar + mTLS + HSM, impact is reduced to availability and logging integrity on the Deno host.
- **Mitigations**: minimal attack surface, API key rotation, audit logs, separate signing network segment.

### D. On-chain admin key compromised

- Attacker can change policies, pause, replace `issuanceSigner`, drain via allowed contract paths depending on design.
- **Mitigations**: multisig, timelocks, monitoring on admin events, incident runbooks.

## What this model does *not* cover

Legal/regulatory use (treasury, banking), insurance of assets, and third-party oracle truth beyond what the contract enforces.

## Further reading

- RPC + HSM patterns (cryptoki vs Parsec): `docs/security/signing-architecture-rpc-hsm.md`
- mTLS with or without a reverse proxy: `docs/security/mtls-and-proxy.md`
- Hardened viewer (canvas/WASM) — realistic limits + roadmap: `docs/security/hardened-viewer.md`
