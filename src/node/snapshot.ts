/**
 * Live RPC snapshot for the egui/WASM viewer — same JSON shape as before, served from the token node (`GET /api/snapshot`).
 * Chain state is public; this avoids a separate Deno viewer process.
 */
import {
  type Address,
  type Chain,
  createPublicClient,
  http,
} from "viem";
import { mainnet } from "viem/chains";
import { tokenValuationLedgerAbi } from "../intersect/onchain.ts";

export type LedgerSnapshot = {
  ledgerAddress: Address;
  assetDecimals: number;
  liquidityBootstrapped: boolean;
  totalTokenSlots: bigint;
  activeTokenCount: bigint;
  pInitialMinor: bigint;
  cumulativeFactorWad: bigint;
  operationalFundMinor: bigint;
  premiumReserveMinor: bigint;
  protocolTvlMinor: bigint;
  sumActiveClaimsMinor?: bigint;
};

export type SnapshotContext = {
  rpcUrl: string;
  ledgerAddress: Address;
  chain?: Chain;
};

export function formatMinorToUsd(minor: bigint, decimals: number): string {
  if (decimals === 0) return minor.toString();
  const s = minor.toString().padStart(decimals + 1, "0");
  const i = s.length - decimals;
  return `${s.slice(0, i)}.${s.slice(i)}`;
}

export async function buildLedgerSnapshot(
  ctx: SnapshotContext,
  opts?: { sumTokenIds?: bigint[] },
): Promise<LedgerSnapshot> {
  const chain = ctx.chain ?? mainnet;
  const client = createPublicClient({ chain, transport: http(ctx.rpcUrl) });

  const addr = ctx.ledgerAddress;

  const [
    assetDecimals,
    liquidityBootstrapped,
    totalTokenSlots,
    activeTokenCount,
    pInitialMinor,
    cumulativeFactorWad,
    operationalFundMinor,
    premiumReserveMinor,
  ] = await Promise.all([
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "assetDecimals",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "liquidityBootstrapped",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "totalTokenSlots",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "activeTokenCount",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "pInitial",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "cumulativeFactorWad",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "operationalFund",
    }),
    client.readContract({
      address: addr,
      abi: tokenValuationLedgerAbi,
      functionName: "premiumReserve",
    }),
  ]);

  const protocolTvlMinor = operationalFundMinor + premiumReserveMinor;

  let sumActiveClaimsMinor: bigint | undefined;
  if (opts?.sumTokenIds?.length) {
    sumActiveClaimsMinor = 0n;
    for (const id of opts.sumTokenIds) {
      const v = await client.readContract({
        address: addr,
        abi: tokenValuationLedgerAbi,
        functionName: "currentTokenValue",
        args: [id],
      });
      sumActiveClaimsMinor += v;
    }
  }

  return {
    ledgerAddress: addr,
    assetDecimals: Number(assetDecimals),
    liquidityBootstrapped,
    totalTokenSlots,
    activeTokenCount,
    pInitialMinor,
    cumulativeFactorWad,
    operationalFundMinor,
    premiumReserveMinor,
    protocolTvlMinor,
    sumActiveClaimsMinor,
  };
}
