# Issuance signer backends (deployment scale)

The issuance authority uses **one** backend selected by `ISSUANCE_SIGNER_BACKEND`:

| Value       | Use case | Where the key lives |
|------------|----------|---------------------|
| `local`    | Single-host deployment with a protected key material path | `ISSUANCE_SIGNER_PRIVATE_KEY` in a secrets manager / HSM-exported process |
| `cryptech` | [CrypTech](https://cryptech.is/) open HSM / crypto board | Sidecar next to the device (PKCS#11 or vendor stack) |
| `opentitan`| [OpenTitan](https://opentitan.org/) RoT / secure execution | Sidecar bridging host RPC to RoT signing firmware |
| `tkey`     | [Tillitis TKey](https://tillitis.se/) USB security key | Sidecar using the Tillitis host protocol |

## PKCS#11 development tokens (SoftHSMv2)

To test PKCS#11-based signing without physical HSM hardware, use [SoftHSMv2](https://github.com/softhsm/SoftHSMv2). Provisioning scripts and config live under `deploy/softhsm/` (see `deploy/softhsm/README.md`). Point your sidecar at `SOFTHSM2_CONF` and the platform `libsofthsm2` module path after running `provision.sh`.

## Shared pattern: EIP-712 sidecar

Hardware integration is **not** implemented inside this Deno process. Instead, each platform runs a **small co-located HTTP service** that:

1. Accepts `POST` with a JSON body equivalent to viem’s `signTypedData` parameters (`domain`, `types`, `primaryType`, `message`). Integer fields may appear as decimal strings after JSON serialization.
2. Computes the EIP-712 digest and signs with secp256k1 using the platform key.
3. Responds with `{ "signature": "0x..." }` (65-byte ECDSA, Ethereum-compatible `v`).

This repository implements the **client** (`sidecar_http.ts`). Your platform team implements the **server** against CrypTech PKCS#11, OpenTitan secure boot / crypto blocks, or the TKey device API.

**Reference server:** `sidecar/` (`issuance-eip712-sidecar`) signs with a local key but matches the HTTP contract so you can run an end-to-end path before PKCS#11 integration.

### TLS

Optional env (per backend prefix):

- `*_TLS_CA_FILE` — PEM CA bundle to verify the sidecar server.
- `*_TLS_CLIENT_CERT_FILE` / `*_TLS_CLIENT_KEY_FILE` — client certificate for mTLS.

The Deno task uses `--allow-read` so these PEM paths can be mounted read-only in containers.

## CrypTech (`ISSUANCE_SIGNER_BACKEND=cryptech`)

- `CRYPTECH_SIDECAR_BASE_URL` — HTTPS base URL of the sidecar.
- `CRYPTECH_SIDECAR_SIGN_PATH` — default `/v1/eip712/sign`.
- `ISSUANCE_SIGNER_ADDRESS` — Ethereum address of the CrypTech-held key (must match on-chain `issuanceSigner`).
- Optional: `CRYPTECH_SIDECAR_API_KEY` (sent as `Authorization: Bearer …`).

See also: `cryptech.ts`.

## OpenTitan (`ISSUANCE_SIGNER_BACKEND=opentitan`)

- `OPENTITAN_SIDECAR_BASE_URL`
- `OPENTITAN_SIDECAR_SIGN_PATH` — default `/v1/eip712/sign`.
- `ISSUANCE_SIGNER_ADDRESS`
- Optional: `OPENTITAN_SIDECAR_API_KEY` (header `X-OpenTitan-Auth`).

See also: `opentitan.ts`.

## Tillitis TKey (`ISSUANCE_SIGNER_BACKEND=tkey`)

- `TKEY_SIDECAR_BASE_URL`
- `TKEY_SIDECAR_SIGN_PATH` — default `/v1/eip712/sign`.
- `ISSUANCE_SIGNER_ADDRESS`
- Optional: `TKEY_SIDECAR_API_KEY` (header `X-TKey-Auth`).

See also: `tillitis_tkey.ts`.

## Local key (`ISSUANCE_SIGNER_BACKEND=local` or unset)

- `ISSUANCE_SIGNER_PRIVATE_KEY` — standard secp256k1 private key hex (still protect with KMS/Vault in production).

See `factory.ts` and `local_key` path inside `factory.ts`.
