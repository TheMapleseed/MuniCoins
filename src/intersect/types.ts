/**
 * Intersected valuation: ledger (economic truth) × NFT anchor (coupling / attestation).
 */
export type LedgerValuation = {
  /** Raw minor units (e.g. USDC 6 decimals). */
  slotValueMinor: bigint;
  cumulativeFactorWad: bigint;
  operationalFundMinor: bigint;
  premiumReserveMinor: bigint;
};

export type NftAnchor = {
  /** Optional synthetic / mirror quote for the same exposure (same minor units). */
  mirrorValueMinor: bigint;
  /** Optional premium or haircut on the NFT leg, WAD-scaled (1e18 = 1.0). */
  legMultiplierWad: bigint;
};

export type IntersectMode =
  | { kind: "ledger_primary" }
  | { kind: "weighted"; ledgerWeightBps: bigint }
  | { kind: "geometric" }
  | { kind: "cross_coupled" };

export type IntersectedQuote = {
  ledgerMinor: bigint;
  nftAdjustedMinor: bigint;
  combinedMinor: bigint;
  mode: IntersectMode;
};
