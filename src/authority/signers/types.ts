import type { Address, Hex } from "viem";

/** Backends supported by `createIssuanceAccount` (see factory.ts). */
export type IssuanceSignerBackend =
  | "local"
  | "cryptech"
  | "opentitan"
  | "tkey";

/** Wire format for POST body to an EIP-712 sidecar (matches viem `signTypedData` parameters, JSON-safe). */
export type Eip712SignRequestWire = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

/** Expected JSON response from a sidecar signing endpoint. */
export type Eip712SignResponseWire = {
  signature: Hex;
};

export type SidecarTlsFileEnv = {
  /** PEM CA bundle path (optional) for verifying the sidecar server. */
  caFile?: string;
  /** Client certificate PEM path (optional) for mTLS. */
  clientCertFile?: string;
  /** Client private key PEM path (optional) for mTLS. */
  clientKeyFile?: string;
};

export type Eip712SidecarConfig = {
  /** Issuing Ethereum address (must match key inside CrypTech / RoT / TKey). */
  address: Address;
  /** Base URL, e.g. `https://cryptech-signer.internal:8443` */
  baseUrl: string;
  /** Path appended to baseUrl, default `/v1/eip712/sign`. */
  signPath?: string;
  /** Optional bearer or custom header for the sidecar. */
  apiKey?: { headerName: string; headerValue: string };
  /** Optional Deno HTTP client (mTLS / custom CA). */
  httpClient?: Deno.HttpClient;
};
