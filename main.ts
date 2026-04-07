/**
 * Deno entry: demo intersected valuation without requiring RPC unless env set.
 *
 * Usage:
 *   deno task intersect
 *   RPC_URL=... LEDGER=0x... deno run --allow-env --allow-net main.ts
 */
import { intersectValuations, relaxCoupledValuation } from "./src/intersect/engine.ts";
import { readLedgerValuation } from "./src/intersect/onchain.ts";
import { WAD } from "./src/intersect/math.ts";
import type { LedgerValuation } from "./src/intersect/types.ts";
import type { Address } from "viem";
import { parseArgs } from "jsr:@std/cli/parse-args";

function envAddr(name: string): Address | undefined {
  const v = Deno.env.get(name);
  if (!v?.startsWith("0x")) return undefined;
  return v as Address;
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["rpc", "ledger", "token"],
    boolean: ["help"],
    default: {},
  });

  if (args.help) {
    console.log(`MuniCoins intersected valuation (Deno)

Local demo (no chain):
  deno run --allow-env main.ts

On-chain snapshot:
  RPC_URL=https://... LEDGER=0x... TOKEN_ID=1 deno run --allow-env --allow-net main.ts
`);
    return;
  }

  const rpcUrl = args.rpc ?? Deno.env.get("RPC_URL");
  const ledgerAddr = (args.ledger as Address | undefined) ?? envAddr("LEDGER");
  const tokenId = BigInt(args.token ?? Deno.env.get("TOKEN_ID") ?? "1");

  if (rpcUrl && ledgerAddr) {
    const snap = await readLedgerValuation(
      { rpcUrl, ledgerAddress: ledgerAddr },
      tokenId,
    );
    const ledgerVal = {
      slotValueMinor: snap.slotValueMinor,
      cumulativeFactorWad: snap.cumulativeFactorWad,
      operationalFundMinor: snap.operationalFundMinor,
      premiumReserveMinor: snap.premiumReserveMinor,
    };
    const anchor = {
      mirrorValueMinor: snap.slotValueMinor,
      legMultiplierWad: WAD,
    };
    const g = intersectValuations(ledgerVal, anchor, { kind: "geometric" });
    const w = intersectValuations(ledgerVal, anchor, {
      kind: "weighted",
      ledgerWeightBps: 7000n,
    });
    console.log(JSON.stringify({ chain: { ledger: ledgerAddr, tokenId }, g, w }, (_, v) =>
      typeof v === "bigint" ? v.toString() : v, 2));
    return;
  }

  // Offline illustration: two legs feeding each other
  const ledgerMinor = 1_247_400n; // $1.2474 in 1e6 units
  const nftMirror = 1_200_000n; // slightly different anchor
  const offlineLedger: LedgerValuation = {
    slotValueMinor: ledgerMinor,
    cumulativeFactorWad: 1_247_400_000_000_000_000n, // illustrative WAD-scale factor
    operationalFundMinor: 350_000_000_000n,
    premiumReserveMinor: 315_000_000_000n,
  };
  const anchor = { mirrorValueMinor: nftMirror, legMultiplierWad: WAD };

  const blended = intersectValuations(offlineLedger, anchor, {
    kind: "weighted",
    ledgerWeightBps: 5000n,
  });
  const geo = intersectValuations(offlineLedger, anchor, { kind: "geometric" });
  const relaxed = relaxCoupledValuation(ledgerMinor, nftMirror, 1n);

  console.log(JSON.stringify({
    note: "offline demo; set RPC_URL + LEDGER for live reads",
    weighted: blended,
    geometric: geo,
    relaxedCoupling: relaxed,
  }, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
