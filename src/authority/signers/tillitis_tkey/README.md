# Tillitis TKey integration scaffold

**Role in this repo:** `tillitis_tkey.ts` configures calls to a **TKey sidecar** that wraps the USB host protocol for [Tillitis TKey](https://tillitis.se/) and outputs raw ECDSA signatures compatible with Ethereum / EIP-712.

**You implement:** a process on the host that talks to the TKey (per Tillitis documentation) and exposes the standard `POST` signing endpoint expected by `../sidecar_http.ts`.
