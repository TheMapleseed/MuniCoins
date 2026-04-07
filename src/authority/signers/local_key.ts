import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { LocalAccount } from "viem/accounts";

/** In-process signing from `ISSUANCE_SIGNER_PRIVATE_KEY` (protect with vault/KMS in production). */
export function createLocalPrivateKeyAccount(): LocalAccount {
  const v = Deno.env.get("ISSUANCE_SIGNER_PRIVATE_KEY");
  if (!v) throw new Error("Missing ISSUANCE_SIGNER_PRIVATE_KEY for ISSUANCE_SIGNER_BACKEND=local");
  if (!v.startsWith("0x")) throw new Error("Invalid ISSUANCE_SIGNER_PRIVATE_KEY");
  return privateKeyToAccount(v as Hex);
}
