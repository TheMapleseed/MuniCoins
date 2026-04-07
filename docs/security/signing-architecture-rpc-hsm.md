# RPC trust and HSM signing architectures (cryptoki vs Parsec)

## RPC is a trust boundary

Any component that uses `RPC_URL` (issuance authority reading `ownerOf` / `pSale`, indexers, viewers) **believes** the JSON-RPC provider. A malicious or compromised provider can return false state and cause **wrong signatures** or **wrong off-chain mirrors**.

**Mitigations:**

- Run your **own node** or use **multiple** providers and compare critical reads.
- Use **TLS** to the provider; pin or rotate API keys.
- Treat “free public RPC” as **unsafe** for signing-critical paths.

This is orthogonal to whether signing uses PKCS#11 or Parsec.

## Naming: PARSEC

- **PARSEC** (MaidSafe): a consensus protocol — **not** what we mean here.
- **[Parsec](https://parsec.community/)** (CNCF security project): **Platform Abstraction for Security**, a service that exposes a **stable API** while backends can be SoftHSM, CloudHSM, TPM, etc.

## Pattern A — Direct: App → cryptoki → (tunnel) → PKCS#11 module / HSM

**Idea:** Your signer binary (e.g. extended Rust sidecar) loads `libsofthsm2.so` or vendor PKCS#11 via `cryptoki` and calls `C_Sign` after you hash EIP-712 locally.

**Pros:** Lowest latency; familiar for validators that expect a `.so` path.

**Cons:** One process per HSM personality; tunneling PKCS#11 (e.g. **p11-kit** remotization) must be done carefully.

**Blockchain angle:** Good for a **dedicated signer binary** next to a node when latency matters.

## Pattern B — Parsec: App → Parsec client → (UDS / tunnel) → Parsec service → backend

**Idea:** Application calls Parsec’s API (“sign this hash”); Parsec routes to the configured provider. **Key orchestration** and backend swaps (SoftHSM → NitroKey → CloudHSM) often need **no app recompile** if the Parsec provider mapping is updated.

**Pros:** Multi-tenant clusters, centralized policy, cleaner separation.

**Cons:** Extra hop; wire security for remote Parsec must be explicit (SSH tunnel, mTLS wrapper, or local UDS only).

**Tunneling:** Parsec often uses **Unix domain sockets**. Remote access uses **SSH port forwarding** or **socat** to expose the socket safely—never raw exposure to the public internet.

## Mapping to this repository

- Today’s **`issuance-eip712-sidecar`** uses a **local** `LocalWallet` for EIP-712. Production should replace signing with either:
  - **cryptoki** in-process (Pattern A), or
  - a small adapter that sends a hash to **Parsec** (Pattern B), while keeping the **same HTTP** `/v1/eip712/sign` contract for Deno.

**SoftHSMv2** provisioning for dev/staging: `deploy/softhsm/README.md`.
