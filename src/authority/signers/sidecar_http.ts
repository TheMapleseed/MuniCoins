import { toAccount } from "viem/accounts";
import type { CustomSource, LocalAccount } from "viem/accounts/types";

type SignTypedDataParameters = Parameters<CustomSource["signTypedData"]>[0];
import type { Eip712SidecarConfig, Eip712SignResponseWire } from "./types.ts";
import { stringifyEip712Payload } from "./json_safe.ts";

/**
 * Builds a viem `LocalAccount` whose `signTypedData` POSTs to a co-located sidecar.
 *
 * Deployment pattern: run a small service next to the HSM/device (CrypTech PKCS#11,
 * OpenTitan RoT app, Tillitis TKey host agent) that accepts canonical EIP-712 JSON
 * and returns a raw `signature` hex (65-byte ECDSA as Ethereum expects).
 */
export function createEip712SidecarAccount(config: Eip712SidecarConfig): LocalAccount {
  const { address, baseUrl, signPath = "/v1/eip712/sign", apiKey, httpClient } = config;
  const base = baseUrl.replace(/\/$/, "");

  const signTypedData: CustomSource["signTypedData"] = async (
    parameters: SignTypedDataParameters,
  ) => {
    const headers: Record<string, string> = {
      "content-type": "application/json; charset=utf-8",
    };
    if (apiKey) headers[apiKey.headerName] = apiKey.headerValue;

    const body = stringifyEip712Payload(parameters);

    const res = await fetch(`${base}${signPath}`, {
      method: "POST",
      headers,
      body,
      client: httpClient,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Sidecar sign failed: HTTP ${res.status} ${text.slice(0, 512)}`);
    }
    let parsed: Eip712SignResponseWire;
    try {
      parsed = JSON.parse(text) as Eip712SignResponseWire;
    } catch {
      throw new Error("Sidecar sign failed: response is not JSON");
    }
    if (!parsed.signature?.startsWith("0x") || parsed.signature.length < 130) {
      throw new Error("Sidecar sign failed: missing or invalid signature field");
    }
    return parsed.signature;
  };

  return toAccount({
    address,
    async signMessage() {
      throw new Error("Issuance authority: signMessage is not supported on sidecar accounts");
    },
    async signTransaction() {
      throw new Error("Issuance authority: signTransaction is not supported on sidecar accounts");
    },
    signTypedData,
  }) as LocalAccount;
}
