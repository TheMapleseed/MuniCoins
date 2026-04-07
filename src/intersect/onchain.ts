import {
  type Abi,
  type Address,
  type Chain,
  createPublicClient,
  http,
} from "viem";
import { mainnet } from "viem/chains";

/** Minimal ABI for TokenValuationLedger reads used by the intersection layer. */
export const tokenValuationLedgerAbi = [
  {
    type: "function",
    name: "currentTokenValue",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "cumulativeFactorWad",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "operationalFund",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "premiumReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "activeTokenCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalTokenSlots",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pInitial",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "assetDecimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "liquidityBootstrapped",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

export const valuationLinkRegistryAbi = [
  {
    type: "function",
    name: "getLedgerSlot",
    stateMutability: "view",
    inputs: [
      { name: "nftCollection", type: "address" },
      { name: "nftTokenId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

export type ReadLedgerContext = {
  rpcUrl: string;
  ledgerAddress: Address;
  chain?: Chain;
};

/** Pull ledger valuation snapshot + slot value for `tokenId`. */
export async function readLedgerValuation(
  ctx: ReadLedgerContext,
  tokenId: bigint,
) {
  const chain = ctx.chain ?? mainnet;
  const client = createPublicClient({ chain, transport: http(ctx.rpcUrl) });

  const [
    slotValueMinor,
    cumulativeFactorWad,
    operationalFundMinor,
    premiumReserveMinor,
  ] = await Promise.all([
    client.readContract({
      address: ctx.ledgerAddress,
      abi: tokenValuationLedgerAbi,
      functionName: "currentTokenValue",
      args: [tokenId],
    }),
    client.readContract({
      address: ctx.ledgerAddress,
      abi: tokenValuationLedgerAbi,
      functionName: "cumulativeFactorWad",
    }),
    client.readContract({
      address: ctx.ledgerAddress,
      abi: tokenValuationLedgerAbi,
      functionName: "operationalFund",
    }),
    client.readContract({
      address: ctx.ledgerAddress,
      abi: tokenValuationLedgerAbi,
      functionName: "premiumReserve",
    }),
  ]);

  return {
    slotValueMinor,
    cumulativeFactorWad,
    operationalFundMinor,
    premiumReserveMinor,
  };
}

export type ReadIntersectContext = ReadLedgerContext & {
  registryAddress: Address;
};

/** Resolve NFT → ledger slot via ValuationLinkRegistry, then read slot value. */
export async function readIntersectedLedgerLeg(
  ctx: ReadIntersectContext,
  nftCollection: Address,
  nftTokenId: bigint,
) {
  const chain = ctx.chain ?? mainnet;
  const client = createPublicClient({ chain, transport: http(ctx.rpcUrl) });

  const ledgerSlot = await client.readContract({
    address: ctx.registryAddress,
    abi: valuationLinkRegistryAbi,
    functionName: "getLedgerSlot",
    args: [nftCollection, nftTokenId],
  });

  if (ledgerSlot === 0n) {
    throw new Error("No on-chain link for this NFT; set Link in ValuationLinkRegistry");
  }

  const ledger = await readLedgerValuation(ctx, ledgerSlot);
  return { ledgerSlot, ledger };
}
