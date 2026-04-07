/** Fixed-point scale for multipliers (1e18 = 1.0). */
export const WAD = 1_000_000_000_000_000_000n;

/** Integer square root (Newton), for geometric mean. */
export function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("sqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (n / x + x) / 2n;
  }
  return x;
}

/** Geometric mean of two non-negative integers (floor). */
export function geometricMean(a: bigint, b: bigint): bigint {
  if (a < 0n || b < 0n) throw new RangeError("geometricMean expects non-negative");
  if (a === 0n || b === 0n) return 0n;
  return sqrtBigInt(a * b);
}

/** Harmonic mean (useful when both legs must “agree”; zero-safe). */
export function harmonicMean(a: bigint, b: bigint): bigint {
  if (a < 0n || b < 0n) throw new RangeError("harmonicMean expects non-negative");
  if (a === 0n || b === 0n) return 0n;
  return (2n * a * b) / (a + b);
}

/** Weighted average; weights in same scale (e.g. bps sum to 10_000). */
export function weightedAverage(
  a: bigint,
  b: bigint,
  weightA: bigint,
  weightB: bigint,
): bigint {
  const den = weightA + weightB;
  if (den === 0n) return 0n;
  return (a * weightA + b * weightB) / den;
}
