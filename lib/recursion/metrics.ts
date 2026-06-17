export interface RecursionMetrics {
  /** Exposure rate = recursiveUsd / ethenaSuppliedUsd. Drives recursiveUsd. */
  exposureScore: number
  /** Concentration = share of the venue's recursive borrow activity that is a
   *  closed Ethena↔Ethena loop (Ethena both supplier and collateral source).
   *  Display-only — never enters any total. */
  closedLoopShare: number
}

// NaN-safe: a non-finite input (e.g. an upstream 0/0) collapses to 0 rather
// than propagating NaN into a downstream total. The current callers all guard
// division-by-zero, but this keeps the shared helper defensive by construction.
const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

/**
 * Canonical metrics for single-market venues (Aave reserves, Solana isolated
 * markets), from three fractions:
 *   supplyShare       — Ethena's share of the venue's supply
 *   recursiveFraction — recursive borrows ÷ total borrows of the venue
 *   utilization       — total borrows ÷ total supply of the venue
 *
 * exposureScore = recursiveFraction × utilization  →  recursiveUsd =
 *   suppliedUsd × exposure = supplyShare × recursiveBorrows (no supplyShare²).
 * closedLoopShare = supplyShare × recursiveFraction.
 */
export function recursionMetrics(
  supplyShare: number,
  recursiveFraction: number,
  utilization: number,
): RecursionMetrics {
  const s = clamp(supplyShare)
  const r = clamp(recursiveFraction)
  const u = clamp(utilization)
  return { exposureScore: clamp(r * u), closedLoopShare: clamp(s * r) }
}

/**
 * Morpho variant. A vault supplies across many markets it does not own, so it
 * has no single borrow book; `vaultRecursionShare` is already a utilization-
 * weighted fraction of vault TVL (recursive borrowed ÷ TVL). Exposure is that
 * fraction directly — NOT × shareOfVault (that was the supplyShare² double-
 * count). Closed-loop applies the ownership share for the concentration view.
 */
export function morphoRecursionMetrics(
  shareOfVault: number,
  vaultRecursionShare: number,
): RecursionMetrics {
  const s = clamp(shareOfVault)
  const v = clamp(vaultRecursionShare)
  return { exposureScore: v, closedLoopShare: clamp(s * v) }
}
