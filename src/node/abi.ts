import { parseAbiItem, type AbiEvent } from "viem";

export const ledgerEvents = {
  liquidityBootstrapped: parseAbiItem(
    "event LiquidityBootstrapped(address indexed payer,uint256 operationalFundAmount,uint256 premiumReserveAmount)",
  ) as AbiEvent,
  tokenRangeBootstrapped: parseAbiItem(
    "event TokenRangeBootstrapped(uint256 indexed fromId,uint256 indexed toId,address initialHolder)",
  ) as AbiEvent,
  returnPeriodApplied: parseAbiItem(
    "event ReturnPeriodApplied(bytes16 indexed periodId,uint64 periodStart,uint64 periodEnd,address indexed caller,int256 returnWad,uint256 cumulativeFactorWadAfter,uint256 operationalFundAfter)",
  ) as AbiEvent,
  tokenRedeemed: parseAbiItem(
    "event TokenRedeemed(uint256 indexed tokenId,address indexed owner,uint256 payout,uint256 operationalFundAfter)",
  ) as AbiEvent,
  tokenReissued: parseAbiItem(
    "event TokenReissued(uint256 indexed tokenId,address indexed owner,uint64 activationTime,uint256 indexAtActivationWad)",
  ) as AbiEvent,
  tokenTransferred: parseAbiItem(
    "event TokenTransferred(uint256 indexed tokenId,address indexed from,address indexed to,bool active)",
  ) as AbiEvent,
  slotAnchorSet: parseAbiItem(
    "event SlotAnchorSet(uint256 indexed tokenId,address indexed nftCollection,uint256 indexed nftTokenId,uint64 expectedExpiry)",
  ) as AbiEvent,
  anchorFrozen: parseAbiItem(
    "event AnchorFrozen(uint256 indexed tokenId)",
  ) as AbiEvent,
  reissueFunded: parseAbiItem(
    "event ReissueFunded(uint256 indexed tokenId,address indexed payer,uint256 saleAmount,uint256 operationalFundAfter,uint256 premiumReserveAfter)",
  ) as AbiEvent,
  solvencyPolicyUpdated: parseAbiItem(
    "event SolvencyPolicyUpdated(uint16 minCollateralRatioBps,uint256 maxDailyRedemptionAmount)",
  ) as AbiEvent,
} as const;

export const registryEvents = {
  linkUpdated: parseAbiItem(
    "event LinkUpdated(address indexed nftCollection,uint256 indexed nftTokenId,uint256 ledgerSlot,address indexed setBy)",
  ) as AbiEvent,
} as const;

