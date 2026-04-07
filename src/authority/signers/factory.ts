import type { LocalAccount } from "viem/accounts";
import type { IssuanceSignerBackend } from "./types.ts";
import { createCryptechSidecarAccount } from "./cryptech.ts";
import { createLocalPrivateKeyAccount } from "./local_key.ts";
import { createOpenTitanSidecarAccount } from "./opentitan.ts";
import { createTillitisTKeySidecarAccount } from "./tillitis_tkey.ts";

const BACKENDS: readonly IssuanceSignerBackend[] = ["local", "cryptech", "opentitan", "tkey"];

/**
 * Creates the viem account used by the issuance authority HTTP service.
 *
 * `ISSUANCE_SIGNER_BACKEND`:
 * - `local` (default): `ISSUANCE_SIGNER_PRIVATE_KEY`
 * - `cryptech`: CrypTech sidecar — see `cryptech.ts`
 * - `opentitan`: OpenTitan sidecar — see `opentitan.ts`
 * - `tkey`: Tillitis TKey sidecar — see `tillitis_tkey.ts`
 */
export async function createIssuanceAccount(): Promise<LocalAccount> {
  const raw = Deno.env.get("ISSUANCE_SIGNER_BACKEND") ?? "local";
  if (!BACKENDS.includes(raw as IssuanceSignerBackend)) {
    throw new Error(
      `Unknown ISSUANCE_SIGNER_BACKEND=${raw}. Use ${BACKENDS.join("|")}`,
    );
  }
  const backend = raw as IssuanceSignerBackend;

  switch (backend) {
    case "local":
      return createLocalPrivateKeyAccount();
    case "cryptech":
      return await createCryptechSidecarAccount();
    case "opentitan":
      return await createOpenTitanSidecarAccount();
    case "tkey":
      return await createTillitisTKeySidecarAccount();
    default: {
      const _exhaustive: never = backend;
      return _exhaustive;
    }
  }
}
