================================================================================
EIP-712 sidecar (Rust reference signer)
================================================================================

The **Rust sidecar** implements the **same HTTP signing contract** the Deno authority uses for backends such as CrypTech, OpenTitan, or TKey: sign EIP-712 payloads over HTTP. It is also the reference for **network policy** (source CIDR enforcement) in Rust.

Primary locations
-----------------

* ``sidecar/`` — Cargo package ``issuance-eip712-sidecar``.
* ``sidecar/README.md`` — run instructions, env vars (``SIDECAR_ALLOWED_SOURCE_CIDRS``, ``ALLOW_INSECURE_LOCAL_DEV``, etc.), CORS, health.
* ``sidecar/src/main.rs`` — HTTP server entry.
* ``sidecar/src/network_policy.rs`` — source IP / CIDR policy (see README for interaction with ``X-Forwarded-For``).

Build
-----

* ``deno.json`` includes ``sidecar:run`` / ``sidecar:build``; root ``justfile`` / ``scripts/build.sh`` can build the binary for deployment.
* ``deploy/Dockerfile.sidecar`` — container image for the sidecar.
