## Forward-Secrecy Sync

`ratchet.ts` provides an application-layer encrypted sync channel for node-to-node or node-to-service replication outside blockchain transport.

### Guarantees (practical)

- per-message authenticated encryption (AES-GCM)
- one-way key ratchet per message (HMAC-SHA256) for forward secrecy of prior messages
- deterministic sequencing (`seq`) to prevent replay/order confusion

### Typical usage

1. Exchange ECDH public keys.
2. Build ratchet state with `establishRatchet(...)`.
3. Sender calls `sealWithRatchet(...)`.
4. Receiver calls `openWithRatchet(...)`.
5. Persist only current chain keys (never old keys).

> Keep this channel separate from on-chain signatures. This is for off-chain replication/state sync security.

