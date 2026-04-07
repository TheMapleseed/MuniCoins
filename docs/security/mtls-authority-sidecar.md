# mTLS between issuance authority and EIP-712 sidecar

The Deno issuance authority calls the sidecar over HTTPS (`src/authority/signers/sidecar_http.ts`). Optional **mutual TLS** protects against unauthorized callers on the network and ties identity to client certificates.

## Server (sidecar)

1. Terminate TLS on the sidecar host or a reverse proxy (nginx, Envoy, Pingap) in front of `issuance-eip712-sidecar`.
2. Present a **server certificate** from your internal CA or a public CA (if applicable).
3. Require **client certificates** from a private CA for callers (the issuance authority host).

## Client (Deno)

Set environment variables read by `tls_optional.ts` (prefix matches your backend, e.g. CrypTech):

| Variable | Purpose |
|----------|---------|
| `CRYPTECH_SIDECAR_TLS_CA_FILE` | PEM file: CA that signed the **server** cert (verify server identity). |
| `CRYPTECH_SIDECAR_TLS_CLIENT_CERT_FILE` | PEM: client certificate for the authority. |
| `CRYPTECH_SIDECAR_TLS_CLIENT_KEY_FILE` | PEM: client private key (protect file permissions `0600`). |

Same pattern for `OPENTITAN_SIDECAR_*` and `TKEY_SIDECAR_*` prefixes.

The Deno task **`authority:start`** includes `--allow-read` so PEM paths can be mounted read-only in containers.

## Policy guidance

- **Development**: HTTP to localhost is acceptable on a single machine.
- **Staging/production**: **TLS always**; **mTLS** where the sidecar is reachable from more than one network zone or shared subnet.

## Operational note

Rotating client certs requires deploying new PEM files and restarting the authority process; coordinate with `docs/security/operational-controls.md`.

When a **reverse proxy** terminates mTLS instead of the Deno process, see `docs/security/mtls-and-proxy.md`.
