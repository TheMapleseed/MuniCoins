import type { Address } from "viem";
import type { LocalAccount } from "viem/accounts";
import { createEip712SidecarAccount } from "./sidecar_http.ts";
import { createHttpClientFromTlsFiles, tlsEnvFromPrefix } from "./tls_optional.ts";

const ENV_PREFIX = "OPENTITAN_SIDECAR";

/**
 * OpenTitan: open-source silicon root of trust.
 *
 * Typical pattern: firmware in the secure execution domain performs secp256k1 signing
 * (or delegates to a crypto block). This Deno service talks to a **sidecar** that
 * bridges host RPC to the RoT signing implementation (SPI, mailbox, or vendor HAL).
 *
 * Env:
 * - `OPENTITAN_SIDECAR_BASE_URL` (required)
 * - `OPENTITAN_SIDECAR_SIGN_PATH` (optional, default `/v1/eip712/sign`)
 * - `ISSUANCE_SIGNER_ADDRESS` (required)
 * - `OPENTITAN_SIDECAR_API_KEY` (optional) — `X-OpenTitan-Auth` if set
 * - TLS file envs with prefix `OPENTITAN_SIDECAR_TLS_*` (optional mTLS)
 *
 * @see https://opentitan.org/
 */
export async function createOpenTitanSidecarAccount(): Promise<LocalAccount> {
  const baseUrl = required(`OPENTITAN_SIDECAR_BASE_URL`);
  const address = requiredAddress(`ISSUANCE_SIGNER_ADDRESS`);
  const signPath = Deno.env.get(`${ENV_PREFIX}_SIGN_PATH`) ?? "/v1/eip712/sign";
  const apiKey = Deno.env.get(`${ENV_PREFIX}_API_KEY`);
  const httpClient = await createHttpClientFromTlsFiles(tlsEnvFromPrefix(ENV_PREFIX));

  return createEip712SidecarAccount({
    address,
    baseUrl,
    signPath,
    apiKey: apiKey ? { headerName: "x-opentitan-auth", headerValue: apiKey } : undefined,
    httpClient,
  });
}

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name} for OpenTitan sidecar signer`);
  return v;
}

function requiredAddress(name: string): Address {
  const v = required(name);
  if (!v.startsWith("0x")) throw new Error(`Invalid ${name}`);
  return v as Address;
}
