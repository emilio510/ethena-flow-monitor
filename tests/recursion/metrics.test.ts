import { describe, it, expect } from "vitest"
import { recursionMetrics, morphoRecursionMetrics } from "@/lib/recursion/metrics"

describe("recursionMetrics (Aave / Solana canonical)", () => {
  it("exposure = recursiveFraction × utilization; closedLoop = supplyShare × recursiveFraction", () => {
    // 60% Ethena-owned, all borrows recursive (r=1), 70% utilized
    const m = recursionMetrics(0.6, 1.0, 0.7)
    expect(m.exposureScore).toBeCloseTo(0.7) // r×u
    expect(m.closedLoopShare).toBeCloseTo(0.6) // s×r
  })

  it("at ~100% utilization and ~100% ownership both ≈ recursiveFraction (no change today)", () => {
    const m = recursionMetrics(1.0, 1.0, 1.0)
    expect(m.exposureScore).toBeCloseTo(1)
    expect(m.closedLoopShare).toBeCloseTo(1)
  })

  it("idle supply lowers exposure but not closed-loop", () => {
    // half utilized: exposure halves, closed-loop unaffected by utilization
    const m = recursionMetrics(0.5, 0.8, 0.5)
    expect(m.exposureScore).toBeCloseTo(0.4) // 0.8 × 0.5
    expect(m.closedLoopShare).toBeCloseTo(0.4) // 0.5 × 0.8
  })

  it("clamps every input and output into [0,1]", () => {
    const m = recursionMetrics(1.5, 2, 3)
    expect(m.exposureScore).toBe(1)
    expect(m.closedLoopShare).toBe(1)
    const z = recursionMetrics(-1, -1, -1)
    expect(z.exposureScore).toBe(0)
    expect(z.closedLoopShare).toBe(0)
  })

  it("collapses a non-finite (NaN/Infinity) input to 0 instead of propagating it", () => {
    const m = recursionMetrics(NaN, 1, 1)
    expect(m.exposureScore).toBe(1) // r×u unaffected; s was NaN → 0
    expect(m.closedLoopShare).toBe(0) // s×r with s=0
    const n = recursionMetrics(1, NaN, Infinity)
    expect(Number.isFinite(n.exposureScore)).toBe(true)
    expect(Number.isFinite(n.closedLoopShare)).toBe(true)
    expect(n.exposureScore).toBe(0)
    expect(n.closedLoopShare).toBe(0)
  })
})

describe("morphoRecursionMetrics (vault-TVL base)", () => {
  it("exposure = vaultRecursionShare (no shareOfVault — fixes the supplyShare² double-count)", () => {
    // partially-owned vault: 50% Ethena, 80% of TVL recursively borrowed
    const m = morphoRecursionMetrics(0.5, 0.8)
    expect(m.exposureScore).toBeCloseTo(0.8) // NOT 0.4
    expect(m.closedLoopShare).toBeCloseTo(0.4) // shareOfVault × vaultRecursionShare
  })

  it("a 100%-owned vault is unchanged (exposure == closed-loop == vaultRecursionShare)", () => {
    const m = morphoRecursionMetrics(1.0, 0.9)
    expect(m.exposureScore).toBeCloseTo(0.9)
    expect(m.closedLoopShare).toBeCloseTo(0.9)
  })
})

describe("morpho double-count direction", () => {
  it("partially-owned vault: exposure exceeds the old shareOfVault×share product", () => {
    const m = morphoRecursionMetrics(0.5, 0.8)
    const oldDoubleCounted = 0.5 * 0.8 // what recursionScore used to be
    expect(m.exposureScore).toBeGreaterThan(oldDoubleCounted)
    expect(m.exposureScore).toBeCloseTo(0.8)
  })
})
