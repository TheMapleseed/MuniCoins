# SoftHSMv2 provisioning (PKCS#11 dev / staging)

[SoftHSMv2](https://github.com/softhsm/SoftHSMv2) is a software PKCS#11 token store. It lets you exercise the same **PKCS#11 code paths** your issuance **sidecar** will use against a real HSM (for example CrypTech or a datacenter HSM), without shipping hardware to every developer machine.

SoftHSM is **not** a substitute for hardware-backed assurance in production: token files on disk are only as safe as host disk and permissions. Use it for integration tests, CI, and staging; keep production keys in hardware or a managed KMS/HSM where policy requires it.

## Install SoftHSMv2

- **macOS (Homebrew):** `brew install softhsm`
- **Debian/Ubuntu:** `apt-get install softhsm2`
- **From source:** follow the upstream [SoftHSMv2](https://github.com/softhsm/SoftHSMv2) README (depends on OpenSSL or Botan).

Confirm binaries:

```bash
softhsm2-util --version
```

## Provision a token (this repo)

From the repository root:

```bash
export SOFTHSM_SO_PIN="your-so-pin"
export SOFTHSM_USER_PIN="your-user-pin"
./deploy/softhsm/provision.sh
```

The script:

1. Writes `deploy/softhsm/generated/softhsm2.conf` from `softhsm2.conf.example` (override `SOFTHSM2_CONF` to use a different path).
2. Creates `deploy/softhsm/generated/tokens/` for token databases.
3. Initializes slot `0` with label `muni-issuance` if no token is present yet.

**Environment:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `SOFTHSM2_CONF` | `deploy/softhsm/generated/softhsm2.conf` | Path passed to PKCS#11 clients |
| `SOFTHSM_TOKEN_LABEL` | `muni-issuance` | Token label |
| `SOFTHSM_SO_PIN` | *(required for first init)* | Security officer PIN |
| `SOFTHSM_USER_PIN` | *(required for first init)* | Application / user PIN |

After provisioning, point your **EIP-712 PKCS#11 sidecar** at:

- `SOFTHSM2_CONF` (or install the generated config under `/etc/softhsm2.conf` on servers), and
- The PKCS#11 module path from your OS (for example `/usr/local/lib/softhsm/libsofthsm2.so` on Homebrew macOS, or `/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so` on Debian).

## Link to issuance architecture

The Deno issuance authority does not load PKCS#11 directly. It calls your sidecar over HTTPS (`ISSUANCE_SIGNER_BACKEND=cryptech` and `CRYPTECH_SIDECAR_*`). That sidecar should use PKCS#11 (SoftHSM in dev, hardware in prod) to generate the Ethereum signature for `IssuanceCertificate`. See `src/authority/signers/README.md` and `src/authority/signers/cryptech/README.md`.

## Backup / restore

SoftHSM stores token objects under the directory configured in `directories.tokendir`. Back up that directory with normal filesystem backups and **protect it like key material**. See upstream notes in the [SoftHSMv2 README](https://github.com/softhsm/SoftHSMv2/blob/main/README.md).
