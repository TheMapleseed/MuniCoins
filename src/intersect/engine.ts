import type { IntersectMode, IntersectedQuote, LedgerValuation, NftAnchor } from "./types.ts";
import { geometricMean, harmonicMean, weightedAverage, WAD } from "./math.ts";

const BPS = 10_000n;

/**
 * NFT leg: mirror value scaled by `legMultiplierWad` (defaults to 1.0 WAD).
 */
export function nftAdjustedValue(anchor: NftAnchor): bigint {
  return (anchor.mirrorValueMinor * anchor.legMultiplierWad) / WAD;
}

/**
 * Combine ledger fair value and NFT-adjusted mirror so each conditions the other:
 * - **ledger_primary**: use ledger only (NFT is attestation-only).
 * - **weighted**: blend in basis points (e.g. 7000 ledger + 3000 NFT = correlated quote).
 * - **geometric**: √(ledger × nft) — both must be non-zero for full weight.
 * - **cross_coupled**: harmonic mean of ledger and nft-adjusted (conservative “both agree”).
 */
export function intersectValuations(
  ledger: LedgerValuation,
  anchor: NftAnchor,
  mode: IntersectMode,
): IntersectedQuote {
  const L = ledger.slotValueMinor;
  const N = nftAdjustedValue(anchor);

  let combined: bigint;
  switch (mode.kind) {
    case "ledger_primary":
      combined = L;
      break;
    case "weighted": {
      const wL = mode.ledgerWeightBps;
      const wN = BPS - wL;
      combined = weightedAverage(L, N, wL, wN);
      break;
    }
    case "geometric":
      combined = geometricMean(L, N);
      break;
    case "cross_coupled":
      combined = harmonicMean(L, N);
      break;
  }

  return {
    ledgerMinor: L,
    nftAdjustedMinor: N,
    combinedMinor: combined,
    mode,
  };
}

/**
 * Iterate two valuations “off each other” until delta < `epsilonMinor` or `maxSteps`.
 * v' = (v_ledger + v_nft) / 2 each step — fixed-point style coupling.
 */
export function relaxCoupledValuation(
  ledgerMinor: bigint,
  nftSeedMinor: bigint,
  epsilonMinor: bigint,
  maxSteps = 32,
): { settled: bigint; steps: number } {
  let a = ledgerMinor;
  let b = nftSeedMinor;
  for (let i = 0; i < maxSteps; i++) {
    const next = (a + b) / 2n;
    const diff = a > next ? a - next : next - a;
    if (diff <= epsilonMinor) {
      return { settled: next, steps: i + 1 };
    }
    b = a;
    a = next;
  }
  return { settled: (a + b) / 2n, steps: maxSteps };
}
