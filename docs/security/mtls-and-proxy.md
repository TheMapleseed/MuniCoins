# mTLS: direct termination vs reverse proxy

Two supported patterns. Pick **one** per environment; do not double-terminate TLS incorrectly.

## 1. Reverse proxy terminates TLS and mTLS (common in Kubernetes / Pingap / nginx)

**When to use:** You want a single ingress, WAF, rate limits, and centralized cert rotation.

**Flow:**

```
Client (Deno issuance authority)
  → TLS + mTLS
    → Proxy (validates client cert, optional JWT/API key)
      → plain HTTP or separate mTLS to backend
        → Deno / sidecar (listen on loopback or pod network only)
```

**Provision:**

1. Install server cert + key on the proxy; configure **client CA** for mTLS.
2. Upstream to `http://127.0.0.1:8790` (authority) or sidecar port **only from the proxy**.
3. Pass identity to the app if needed: `X-Forwarded-Client-Cert` / `X-SSL-Client-DN` (proxy-specific).
4. Keep **`CORS_ALLOW_ORIGINS`** on the Deno app for browser callers; **CORS is not a substitute for network policy** on server-to-server paths.

**Deno env:** use `*_TLS_CLIENT_*` only when the **Deno process** initiates TLS to the sidecar (client cert toward sidecar). When the proxy terminates mTLS, the Deno app often uses **plain HTTP to localhost** behind the proxy.

## 2. Direct mTLS (no HTTP reverse proxy in front)

**When to use:** Two services on the same VLAN, or you want end-to-end TLS from process to process without a proxy hop.

**Flow:**

```
Deno  --TLS+mTLS-->  Sidecar (Rust)
```

**Provision:**

1. Issue server cert for sidecar host/DNS/SAN.
2. Issue **client** cert for the issuance authority host or service account.
3. Set on Deno: `CRYPTECH_SIDECAR_TLS_CA_FILE`, `CRYPTECH_SIDECAR_TLS_CLIENT_CERT_FILE`, `CRYPTECH_SIDECAR_TLS_CLIENT_KEY_FILE` (see `src/authority/signers/tls_optional.ts`).
4. Sidecar listens **TLS** — today the reference sidecar is **HTTP**. For production direct mTLS you typically either:
   - terminate TLS in **stunnel / nginx** on the same host forwarding to `127.0.0.1:8788`, or
   - extend the sidecar to use `axum-server` with rustls (future work).

So “direct mTLS” in practice is often **stunnel → local HTTP sidecar** until the sidecar gains native TLS.

## Health checks with mTLS

- **Kubernetes:** use an **HTTPGet** probe against the **proxy** path that maps to `/health`, with optional mTLS at ingress or a separate **exec** probe.
- **Restrict payload:** set `HEALTH_MINIMAL=true` and `HEALTH_REQUIRE_AUTH=true` on authority/sidecar so probes that bypass mTLS do not leak signer metadata (pair with network policy so only the mesh can reach the port).

See also: `docs/security/mtls-authority-sidecar.md`.
