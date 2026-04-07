# OpenTitan integration scaffold

**Role in this repo:** `opentitan.ts` points the issuance authority at an **OpenTitan sidecar** that bridges host networking to RoT signing (mailbox, SPI, or your product’s secure boot / crypto driver stack).

**You implement:** firmware + host daemon that completes EIP-712 signing inside the trust boundary you define, and an HTTP (or HTTP+mTLS) listener that matches the shared sidecar contract in `../README.md`.

**References:** [OpenTitan project](https://opentitan.org/).
