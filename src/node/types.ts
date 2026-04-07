import type { Address } from "viem";

export type TokenState = {
  tokenId: bigint;
  owner?: Address;
  active?: boolean;
  activationTime?: bigint;
  indexAtActivationWad?: bigint;
  expectedExpiry?: bigint;
  nftCollection?: Address;
  nftTokenId?: bigint;
  anchorFrozen?: boolean;
  lastRedemptionPayoutMinor?: bigint;
};

export type LedgerStats = {
  chainId: number;
  ledgerAddress: Address;
  registryAddress?: Address;
  lastProcessedBlock: bigint;
  scannedBlocks: bigint;
  eventsProcessed: bigint;
  activeTokenCount?: bigint;
  totalTokenSlots?: bigint;
  operationalFundMinor?: bigint;
  premiumReserveMinor?: bigint;
  totalReissued: bigint;
  totalRedeemed: bigint;
  totalRedeemedMinor: bigint;
  totalTransfers: bigint;
  totalReturnsApplied: bigint;
  lastReturnPeriodId?: string;
  lastReturnPeriodEnd?: bigint;
  updatedAtUnix: number;
};

export type DailySnapshot = {
  dayKey: bigint;
  capturedAtUnix: number;
  operationalFundMinor?: bigint;
  premiumReserveMinor?: bigint;
  activeTokenCount?: bigint;
  totalTokenSlots?: bigint;
  totalRedeemedMinor: bigint;
  totalReissued: bigint;
};

export type TokenLink = {
  nftCollection: Address;
  nftTokenId: bigint;
  ledgerSlot: bigint;
  updatedAtBlock: bigint;
};

export type NodeEvent =
  | { type: "indexed_range"; fromBlock: bigint; toBlock: bigint; events: number }
  | { type: "reconciled"; block: bigint; mismatchCount: number }
  | { type: "snapshot"; dayKey: bigint }
  | { type: "error"; message: string };

