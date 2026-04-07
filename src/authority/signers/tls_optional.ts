import type { SidecarTlsFileEnv } from "./types.ts";

/**
 * Optional mTLS / custom CA for sidecar `fetch` via `Deno.createHttpClient`.
 * Set paths from env using your platform prefix, e.g. `CRYPTECH_SIDECAR_TLS_CA_FILE`.
 */
export async function createHttpClientFromTlsFiles(
  tls: SidecarTlsFileEnv,
): Promise<Deno.HttpClient | undefined> {
  const { caFile, clientCertFile, clientKeyFile } = tls;
  if (!caFile && !clientCertFile) return undefined;

  const caCerts: string[] = [];
  if (caFile) {
    caCerts.push(new TextDecoder().decode(await Deno.readFile(caFile)));
  }

  let certChain: string | undefined;
  let privateKey: string | undefined;
  if (clientCertFile && clientKeyFile) {
    certChain = new TextDecoder().decode(await Deno.readFile(clientCertFile));
    privateKey = new TextDecoder().decode(await Deno.readFile(clientKeyFile));
  } else if (clientCertFile || clientKeyFile) {
    throw new Error("TLS client auth requires both client cert and key file paths");
  }

  return Deno.createHttpClient({
    caCerts: caCerts.length ? caCerts : undefined,
    cert: certChain,
    key: privateKey,
  });
}

export function tlsEnvFromPrefix(prefix: string): SidecarTlsFileEnv {
  return {
    caFile: Deno.env.get(`${prefix}_TLS_CA_FILE`) ?? undefined,
    clientCertFile: Deno.env.get(`${prefix}_TLS_CLIENT_CERT_FILE`) ?? undefined,
    clientKeyFile: Deno.env.get(`${prefix}_TLS_CLIENT_KEY_FILE`) ?? undefined,
  };
}
