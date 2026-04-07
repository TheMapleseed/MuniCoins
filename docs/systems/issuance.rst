================================================================================
Issuance authority (EIP-712 certificates)
================================================================================

The **issuance authority** signs **EIP-712** ``IssuanceCertificate`` payloads. The Deno service orchestrates signing; hardware-backed paths delegate to a **sidecar** or device-specific signers.

Entry and tasks
---------------

* ``issuance-authority.ts`` — process entrypoint (``deno task authority:start``).
* ``src/authority/issuance_service.ts`` — HTTP issuance service implementation.
* ``src/authority/signers/factory.ts`` — signer backend selection.
* ``src/authority/signers/local_key.ts`` — local key signer.
* ``src/authority/signers/sidecar_http.ts`` — HTTP sidecar signer client.
* ``src/authority/signers/json_safe.ts``, ``src/authority/signers/types.ts`` — helpers and types.
* ``src/authority/signers/tls_optional.ts`` — optional TLS client configuration.

Per-backend notes
-------------------

* ``src/authority/signers/README.md`` — overview of signer backends.
* ``src/authority/signers/cryptech/``, ``opentitan/``, ``tillitis_tkey/`` — device-specific READMEs and bindings.

Top-level docs
--------------

* ``src/authority/README.md`` — API keys, env vars, and operational notes.
