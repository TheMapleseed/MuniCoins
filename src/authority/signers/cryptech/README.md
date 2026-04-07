# CrypTech integration scaffold

**Role in this repo:** `cryptech.ts` configures the issuance authority to call a **sidecar** over HTTPS. The sidecar is responsible for PKCS#11 (or equivalent) access to the [CrypTech](https://cryptech.is/) device and for producing Ethereum ECDSA signatures over EIP-712 payloads.

**You implement:** the sidecar service (language of your choice) that exposes `POST ${CRYPTECH_SIDECAR_SIGN_PATH}` and returns `{ "signature": "0x..." }`.

**This repo implements:** HTTP client + optional mTLS in `../sidecar_http.ts` and `../tls_optional.ts`.

**PKCS#11 without hardware (dev/staging):** provision [SoftHSMv2](https://github.com/softhsm/SoftHSMv2) using `deploy/softhsm/` so your sidecar can load keys through the same PKCS#11 API you will use against CrypTech or a datacenter HSM in production.
