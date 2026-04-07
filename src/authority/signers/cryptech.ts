import type { Address } from "viem";
import type { LocalAccount } from "viem/accounts";
import { createEip712SidecarAccount } from "./sidecar_http.ts";
import { createHttpClientFromTlsFiles, tlsEnvFromPrefix } from "./tls_optional.ts";

const ENV_PREFIX = "CRYPTECH_SIDECAR";

/**
 * CrypTech Project: open HSM-style crypto hardware.
 *
 * This process does not speak PKCS#11 directly. In production, run a **sidecar**
 * on the CrypTech host (or a locked-down VM with the CrypTech board/USB) that:
 * - loads keys via PKCS#11 or vendor tooling against the CrypTech device,
 * - exposes `POST /v1/eip712/sign` accepting the same JSON body this client sends,
 * - returns `{ "signature": "0x..." }`.
 *
 * Env:
 * - `CRYPTECH_SIDECAR_BASE_URL` (required)
 * - `CRYPTECH_SIDECAR_SIGN_PATH` (optional, default `/v1/eip712/sign`)
 * - `ISSUANCE_SIGNER_ADDRESS` (required) — must match the Ethereum address of the CrypTech-held key
 * - `CRYPTECH_SIDECAR_API_KEY` (optional) — sent as `Authorization: Bearer ...` if set
 * - `CRYPTECH_SIDECAR_TLS_CA_FILE`, `CRYPTECH_SIDECAR_TLS_CLIENT_CERT_FILE`, `CRYPTECH_SIDECAR_TLS_CLIENT_KEY_FILE` (optional mTLS)
 *
 * @see https://cryptech.is/
 */
export async function createCryptechSidecarAccount(): Promise<LocalAccount> {
  const baseUrl = required(`CRYPTECH_SIDECAR_BASE_URL`);
  const address = requiredAddress(`ISSUANCE_SIGNER_ADDRESS`);
  const signPath = Deno.env.get(`${ENV_PREFIX}_SIGN_PATH`) ?? "/v1/eip712/sign";
  const apiKey = Deno.env.get(`${ENV_PREFIX}_API_KEY`);
  const httpClient = await createHttpClientFromTlsFiles(tlsEnvFromPrefix(ENV_PREFIX));

  return createEip712SidecarAccount({
    address,
    baseUrl,
    signPath,
    apiKey: apiKey
      ? { headerName: "authorization", headerValue: `Bearer ${apiKey}` }
      : undefined,
    httpClient,
  });
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name} for CrypTech sidecar signer`);
  return v;
}

function requiredAddress(name: string): Address {
  const v = required(name);
  if (!v.startsWith("0x")) throw new Error(`Invalid ${name}`);
  return v as Address;
}
