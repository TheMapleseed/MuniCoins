import type { Address } from "viem";
import type { LocalAccount } from "viem/accounts";
import { createEip712SidecarAccount } from "./sidecar_http.ts";
import { createHttpClientFromTlsFiles, tlsEnvFromPrefix } from "./tls_optional.ts";

const ENV_PREFIX = "TKEY_SIDECAR";

/**
 * Tillitis TKey: open USB security key / dev board.
 *
 * The USB device is accessed from a host agent (often a small local service). This
 * Deno authority calls a **sidecar** that wraps the Tillitis host protocol and
 * returns Ethereum-compatible ECDSA signatures for EIP-712 payloads.
 *
 * Env:
 * - `TKEY_SIDECAR_BASE_URL` (required)
 * - `TKEY_SIDECAR_SIGN_PATH` (optional, default `/v1/eip712/sign`)
 * - `ISSUANCE_SIGNER_ADDRESS` (required)
 * - `TKEY_SIDECAR_API_KEY` (optional) — `X-TKey-Auth` if set
 * - TLS file envs with prefix `TKEY_SIDECAR_TLS_*` (optional mTLS)
 *
 * @see https://tillitis.se/
 */
export async function createTillitisTKeySidecarAccount(): Promise<LocalAccount> {
  const baseUrl = required(`TKEY_SIDECAR_BASE_URL`);
  const address = requiredAddress(`ISSUANCE_SIGNER_ADDRESS`);
  const signPath = Deno.env.get(`${ENV_PREFIX}_SIGN_PATH`) ?? "/v1/eip712/sign";
  const apiKey = Deno.env.get(`${ENV_PREFIX}_API_KEY`);
  const httpClient = await createHttpClientFromTlsFiles(tlsEnvFromPrefix(ENV_PREFIX));

  return createEip712SidecarAccount({
    address,
    baseUrl,
    signPath,
    apiKey: apiKey ? { headerName: "x-tkey-auth", headerValue: apiKey } : undefined,
    httpClient,
  });
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name} for Tillitis TKey sidecar signer`);
  return v;
}

function requiredAddress(name: string): Address {
  const v = required(name);
  if (!v.startsWith("0x")) throw new Error(`Invalid ${name}`);
  return v as Address;
}
