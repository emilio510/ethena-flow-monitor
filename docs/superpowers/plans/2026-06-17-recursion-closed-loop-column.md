# Recursion Closed-Loop Column + Harmonization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Closed-loop" concentration column to the footprint table and make both recursion metrics (exposure + closed-loop) consistent across Aave, Morpho, Kamino, and Jupiter — folding in the Morpho `supplyShare²` double-count fix and Solana utilization future-proofing.

**Architecture:** Centralize the canonical formula in one pure helper `lib/recursion/metrics.ts` so every protocol computes the same two numbers: `exposureScore = recursiveFraction × utilization` and `closedLoopShare = supplyShare × recursiveFraction`. Downstream `recursiveUsd(row) = ethenaSuppliedUsd × exposureScore` (drops the double-counted `supplyShare`). Each protocol becomes a thin adapter that passes its `(supplyShare, recursiveFraction, utilization)`. Morpho is the one documented exception (a vault has no single borrow book) and uses a TVL-based variant in the same helper module. `closedLoopShare` is display-only and never enters any total.

**Tech Stack:** TypeScript, Vitest, Next.js 16 server components. No new deps or data sources.

**Spec:** `docs/superpowers/specs/2026-06-17-recursion-columns-harmonization-design.md`.

---

## File Structure

- `lib/recursion/metrics.ts` — **CREATE**. Two pure helpers + `RecursionMetrics` type. Single source of truth for the formula.
- `tests/recursion/metrics.test.ts` — **CREATE**. Canonical-formula tests incl. the off-100% Solana case and the Morpho double-count case.
- `lib/recursion/score.ts` — **MODIFY**. Adopt `recursionMetrics`; add `closedLoopShare` to `ReserveRecursion`.
- `lib/views/footprint.ts` — **MODIFY**. `FootprintRow.closedLoopShare`; Aave + Morpho wiring; Morpho double-count fix.
- `lib/views/vault.ts` — **MODIFY**. Morpho drilldown: split exposure vs closed-loop.
- `lib/solana/positions.ts` — **MODIFY**. Kamino + Jupiter footprint rows: add utilization, split metrics.
- `lib/solana/fluid.ts` — **MODIFY**. Export a `totalUsdgBorrowedUsd` helper for Jupiter utilization.
- `lib/views/solana-vault.ts` — **MODIFY**. Kamino + Jupiter drilldown: adopt canonical pair (already has `utilization`).
- `components/footprint-table.tsx` — **MODIFY**. Add the "Closed-loop" column.
- Per-protocol test files (exist): `tests/recursion/score.test.ts`, `tests/solana/kamino.test.ts`, `tests/solana/fluid.test.ts`, `tests/solana/positions.test.ts`, `tests/solana/solana-vault.test.ts`.

---

### Task 1: Canonical metrics helper (the heart)

**Files:**
- Create: `lib/recursion/metrics.ts`
- Test: `tests/recursion/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/recursion/metrics.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/recursion/metrics.test.ts`
Expected: FAIL — module `@/lib/recursion/metrics` does not exist.

- [ ] **Step 3: Implement the helper**

```typescript
// lib/recursion/metrics.ts
export interface RecursionMetrics {
  /** Exposure rate = recursiveUsd / ethenaSuppliedUsd. Drives recursiveUsd. */
  exposureScore: number
  /** Concentration = share of the venue's recursive borrow activity that is a
   *  closed Ethena↔Ethena loop (Ethena both supplier and collateral source).
   *  Display-only — never enters any total. */
  closedLoopShare: number
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/recursion/metrics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/recursion/metrics.ts tests/recursion/metrics.test.ts
git commit -m "feat(recursion): canonical exposure + closed-loop metrics helper"
```

---

### Task 2: Aave adopts the helper; FootprintRow gains closedLoopShare

**Files:**
- Modify: `lib/recursion/score.ts:92-103`
- Modify: `lib/views/footprint.ts` (FootprintRow interface ~41-56; aaveRecursion closure ~270-284; Aave row push ~297-314)
- Test: `tests/recursion/score.test.ts`

- [ ] **Step 1: Add the failing assertion to the existing Aave test**

In `tests/recursion/score.test.ts`, inside the first test ("MegaETH/USDM: score is utilization-aware…"), add after the existing `recursionScore` assertion:

```typescript
    // closed-loop = supplyShare × borrowShare = (500/600) × 1.0
    expect(result.closedLoopShare).toBeCloseTo(500_000_000 / 600_000_000)
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/recursion/score.test.ts`
Expected: FAIL — `result.closedLoopShare` is `undefined`.

- [ ] **Step 3: Adopt `recursionMetrics` in `score.ts`**

In `lib/recursion/score.ts`: add to the `ReserveRecursion` interface (after `recursionScore`):

```typescript
  /** Concentration: supplyShare × recursiveFraction. Display-only. */
  closedLoopShare: number
```

Add the import at the top:

```typescript
import { recursionMetrics } from "./metrics"
```

Replace the return's score line. Current:

```typescript
  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: ethenaCollateralBorrowShare * utilization,
    borrowsByCollateral,
    attributedBorrowsTotal,
  }
```

New:

```typescript
  const { exposureScore, closedLoopShare } = recursionMetrics(
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    utilization,
  )

  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: exposureScore,
    closedLoopShare,
    borrowsByCollateral,
    attributedBorrowsTotal,
  }
```

(`exposureScore = ethenaCollateralBorrowShare × utilization` — identical to the shipped value, so all existing exposure assertions still pass.)

- [ ] **Step 4: Surface it through the footprint Aave path**

In `lib/views/footprint.ts`:

(a) Add to the `FootprintRow` interface, after `recursionScore?: number`:

```typescript
  closedLoopShare?: number
```

(b) The `aaveRecursion` closure currently returns `{ score: r.recursionScore, approx: sample.truncated }`. Change it to:

```typescript
    return { score: r.recursionScore, closedLoop: r.closedLoopShare, approx: sample.truncated }
```

(c) In the Aave row push (the `if (supplied > 0)` block), add after `recursionScore: recursion?.score,`:

```typescript
        closedLoopShare: recursion?.closedLoop,
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/recursion/score.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add lib/recursion/score.ts lib/views/footprint.ts tests/recursion/score.test.ts
git commit -m "feat(recursion): Aave closed-loop via canonical helper; FootprintRow.closedLoopShare"
```

---

### Task 3: Morpho — split exposure vs closed-loop (double-count fix)

**Files:**
- Modify: `lib/views/footprint.ts` (Morpho block ~362-391)
- Modify: `lib/views/vault.ts` (drilldown ~117-145; `MorphoVaultView` type)
- Test: `tests/recursion/metrics.test.ts` already covers the formula; add a footprint-level guard below.

- [ ] **Step 1: Fix the footprint Morpho path**

In `lib/views/footprint.ts`, add the import (extend the existing metrics import or add):

```typescript
import { recursionMetrics, morphoRecursionMetrics } from "@/lib/recursion/metrics"
```

In the Morpho block, replace:

```typescript
      const vaultRecursion = morphoVaultRecursionShare(vault)
      recursionScore = clamp(shareOfReserve ?? 0) * vaultRecursion
      weightedNumerator += supplied * recursionScore
      weightedDenominator += supplied
```

with:

```typescript
      const vaultRecursion = morphoVaultRecursionShare(vault)
      const m = morphoRecursionMetrics(shareOfReserve ?? 0, vaultRecursion)
      recursionScore = m.exposureScore
      closedLoopShareValue = m.closedLoopShare
      weightedNumerator += supplied * recursionScore
      weightedDenominator += supplied
```

Declare `let closedLoopShareValue: number | undefined` next to the existing `let recursionScore` / `let shareOfReserve` declarations in that block, and add `closedLoopShare: closedLoopShareValue,` to the Morpho `out.push({ ... })`. (This changes `recursiveUsd` from `supplied × shareOfVault × vaultRecursion` to `supplied × vaultRecursion` — the double-count fix.)

- [ ] **Step 2: Fix the Morpho drilldown (`vault.ts`)**

In `lib/views/vault.ts`, add the import:

```typescript
import { morphoRecursionMetrics } from "@/lib/recursion/metrics"
```

Replace:

```typescript
  const recursionScore = ethenaShareOfVault * vaultRecursionShare
```

with:

```typescript
  const { exposureScore: recursionScore, closedLoopShare } =
    morphoRecursionMetrics(ethenaShareOfVault, vaultRecursionShare)
```

Add `closedLoopShare: number` to the `MorphoVaultView` interface (next to `recursionScore`) and `closedLoopShare,` to the returned object.

- [ ] **Step 3: Add a metrics guard test (display-only + direction)**

Append to `tests/recursion/metrics.test.ts`:

```typescript
describe("morpho double-count direction", () => {
  it("partially-owned vault: exposure exceeds the old shareOfVault×share product", () => {
    const m = morphoRecursionMetrics(0.5, 0.8)
    const oldDoubleCounted = 0.5 * 0.8 // what recursionScore used to be
    expect(m.exposureScore).toBeGreaterThan(oldDoubleCounted)
    expect(m.exposureScore).toBeCloseTo(0.8)
  })
})
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm exec vitest run tests/recursion/metrics.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add lib/views/footprint.ts lib/views/vault.ts tests/recursion/metrics.test.ts
git commit -m "fix(recursion): Morpho exposure drops double-counted shareOfVault; add closed-loop"
```

---

### Task 4: Kamino — utilization + canonical split (footprint + drilldown)

**Files:**
- Modify: `lib/solana/positions.ts` (`buildKaminoRows` ~91-120)
- Modify: `lib/views/solana-vault.ts` (Kamino builder ~187-202)
- Test: `tests/solana/positions.test.ts`, `tests/solana/solana-vault.test.ts`

- [ ] **Step 1: Write failing footprint test**

In `tests/solana/positions.test.ts`, follow the file's existing mocking pattern for `fetchEthenaMarketReserves`/`fetchEthenaPrimeVaultMetrics`. Add a case where the USDG reserve is **70% utilized** (`totalBorrowUsd = 70`, `totalSupplyUsd = 100`) and assert the built Kamino row has `recursionScore ≈ recursiveFraction × 0.7` and `closedLoopShare ≈ shareOfReserve × recursiveFraction`. (Match the existing test's construction of `AssetLeg` and the reserves fixture; if the file has no Kamino-row test yet, model it on the Jupiter/positions cases already present.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/solana/positions.test.ts`
Expected: FAIL — current `recursionScore` ignores utilization (returns the bare fraction).

- [ ] **Step 3: Implement in `buildKaminoRows`**

In `lib/solana/positions.ts`, add the import:

```typescript
import { recursionMetrics } from "@/lib/recursion/metrics"
```

`computeKaminoRecursion(reserves)` stays (it is the `recursiveFraction`). Replace the per-leg row construction so each leg computes utilization from its own reserve and routes through the helper:

```typescript
  const recursiveFraction = computeKaminoRecursion(reserves)
  return activeLegs.map((leg) => {
    const reserve = reserves.find((r) => r.liquidityToken === leg.asset)
    const reserveAggregateDeposits = reserve?.totalSupplyUsd ?? vault.tokensInvestedUsd
    const utilization =
      reserve && reserve.totalSupplyUsd > 0
        ? reserve.totalBorrowUsd / reserve.totalSupplyUsd
        : 0
    const shareOfReserve =
      reserveAggregateDeposits > 0
        ? Math.min(1, leg.value / reserveAggregateDeposits)
        : undefined
    const { exposureScore, closedLoopShare } = recursionMetrics(
      shareOfReserve ?? 0,
      recursiveFraction,
      utilization,
    )
    return {
      protocol: "KAMINO",
      chain: "solana",
      marketKey: `kamino:${KAMINO_ETHENA_MARKET}`,
      reserveSymbol: leg.asset,
      vaultName: "Ethena Prime (Sentora)",
      vaultAddress: KAMINO_ETHENA_PRIME_VAULT,
      ethenaSuppliedUsd: leg.value,
      reserveAggregateDeposits,
      shareOfReserve,
      recursionScore: exposureScore,
      closedLoopShare,
      recursionApprox: false,
      isAnomalyBorrow: false,
    }
  })
```

- [ ] **Step 4: Align the Kamino drilldown**

In `lib/views/solana-vault.ts`, the Kamino builder already computes `utilization` (the `usdgReserve` block) and `marketRecursionShare`. Add the import `import { recursionMetrics } from "@/lib/recursion/metrics"` and replace:

```typescript
    recursionScore: ethenaShareOfVault * marketRecursionShare,
```

with (compute once before the return):

```typescript
  const { exposureScore, closedLoopShare } = recursionMetrics(
    ethenaShareOfVault,
    marketRecursionShare,
    utilization,
  )
```

and in the returned object: `recursionScore: exposureScore, closedLoopShare,`. Add `closedLoopShare: number` to the `SolanaVaultView` type.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/solana/positions.test.ts tests/solana/solana-vault.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc clean. (Update any existing drilldown assertion that hard-coded the old `share × fraction` score to the new `fraction × utilization`; at ~100% util the value is unchanged.)

- [ ] **Step 6: Commit**

```bash
git add lib/solana/positions.ts lib/views/solana-vault.ts tests/solana/positions.test.ts tests/solana/solana-vault.test.ts
git commit -m "feat(recursion): Kamino utilization-aware exposure + closed-loop (footprint + drilldown)"
```

---

### Task 5: Jupiter — utilization helper + canonical split

**Files:**
- Modify: `lib/solana/fluid.ts` (add `totalUsdgBorrowedUsd`)
- Modify: `lib/solana/positions.ts` (`buildJupiterRows` ~122-149)
- Modify: `lib/views/solana-vault.ts` (Jupiter builder ~284-297)
- Test: `tests/solana/fluid.test.ts`, `tests/solana/positions.test.ts`

- [ ] **Step 1: Write failing helper test**

In `tests/solana/fluid.test.ts`, add (using the existing `FluidBorrowingVault` fixture shape in that file):

```typescript
import { totalUsdgBorrowedUsd } from "@/lib/solana/fluid"

it("totalUsdgBorrowedUsd sums USDG borrows across borrow vaults", () => {
  // two USDG-borrow vaults + one non-USDG vault that must be ignored
  const vaults = [
    makeVault({ borrowSymbol: "USDG", totalBorrow: 100, borrowDecimals: 0, borrowPrice: 1 }),
    makeVault({ borrowSymbol: "USDG", totalBorrow: 50, borrowDecimals: 0, borrowPrice: 1 }),
    makeVault({ borrowSymbol: "WSOL", totalBorrow: 999, borrowDecimals: 0, borrowPrice: 1 }),
  ]
  expect(totalUsdgBorrowedUsd(vaults)).toBeCloseTo(150)
})
```

(Reuse or add a small `makeVault` factory mirroring the existing fluid fixtures; if the test file already has a vault factory, use it.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/solana/fluid.test.ts`
Expected: FAIL — `totalUsdgBorrowedUsd` is not exported.

- [ ] **Step 3: Add the helper to `fluid.ts`**

In `lib/solana/fluid.ts`, export (it formalizes the sum already done inline in `computeJupiterRecursion` and the drilldown):

```typescript
/** Total USDG currently borrowed across all USDG-debt vaults, in USD. */
export function totalUsdgBorrowedUsd(vaults: FluidBorrowingVault[]): number {
  return vaults
    .filter((v) => v.borrowToken.symbol === "USDG")
    .reduce(
      (s, v) =>
        s +
        (Number(v.totalBorrow ?? 0) / 10 ** v.borrowToken.decimals) *
          (v.borrowToken.price ?? 1),
      0,
    )
}
```

- [ ] **Step 4: Use it in `buildJupiterRows`**

In `lib/solana/positions.ts`, import `totalUsdgBorrowedUsd` from `@/lib/solana/fluid` and `recursionMetrics` from `@/lib/recursion/metrics`. After `totalSuppliedUsd` is computed, add utilization and route each leg through the helper:

```typescript
  const recursiveFraction = computeJupiterRecursion(borrowing)
  const utilization =
    totalSuppliedUsd > 0 ? totalUsdgBorrowedUsd(borrowing) / totalSuppliedUsd : 0
  return activeLegs.map((leg) => {
    const shareOfReserve =
      totalSuppliedUsd > 0 ? Math.min(1, leg.value / totalSuppliedUsd) : undefined
    const { exposureScore, closedLoopShare } = recursionMetrics(
      shareOfReserve ?? 0,
      recursiveFraction,
      utilization,
    )
    return {
      protocol: "JUPITER LEND",
      chain: "solana",
      marketKey: `jup-lend:${JUPITER_ETHENA_LENDING_VAULT}`,
      reserveSymbol: leg.asset,
      vaultName: "Bitwise × Ethena (Fluid)",
      vaultAddress: JUPITER_ETHENA_LENDING_VAULT,
      ethenaSuppliedUsd: leg.value,
      reserveAggregateDeposits: totalSuppliedUsd,
      shareOfReserve,
      recursionScore: exposureScore,
      closedLoopShare,
      recursionApprox: false,
      isAnomalyBorrow: false,
    }
  })
```

- [ ] **Step 5: Align the Jupiter drilldown**

In `lib/views/solana-vault.ts`, the Jupiter builder already computes `utilization` (the `totalUsdgBorrowedUsd / totalAssetsUsd` block) and `marketRecursionShare`. Replace `recursionScore: ethenaShareOfVault * marketRecursionShare,` using the same `recursionMetrics(ethenaShareOfVault, marketRecursionShare, utilization)` pattern as Task 4 Step 4, setting `recursionScore: exposureScore, closedLoopShare,`. (Optionally swap its inline borrowed-sum for the new `totalUsdgBorrowedUsd` helper — DRY, behavior-identical.)

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run tests/solana/fluid.test.ts tests/solana/positions.test.ts tests/solana/solana-vault.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add lib/solana/fluid.ts lib/solana/positions.ts lib/views/solana-vault.ts tests/solana/fluid.test.ts tests/solana/positions.test.ts
git commit -m "feat(recursion): Jupiter utilization-aware exposure + closed-loop"
```

---

### Task 6: Footprint table — render the Closed-loop column

**Files:**
- Modify: `components/footprint-table.tsx`
- Test: visual/manual (this is presentational; the value math is covered by Tasks 1-5)

- [ ] **Step 1: Add the column header**

In `components/footprint-table.tsx`, the header row currently has `<div className="text-right">Recursion</div>` (~line 21). Add immediately after it:

```tsx
        <div className="text-right">Closed-loop</div>
```

- [ ] **Step 2: Add the body cell**

The body row renders the Recursion cell (the block around `r.recursionScore`, ~lines 82-90). Add a sibling cell after it that renders `closedLoopShare` with a tooltip via the native `title` attribute (no new component):

```tsx
              <div
                className="text-right"
                title="Share of this market's borrow activity that is a closed Ethena loop (Ethena both supplier and collateral source). Concentration / artificial-inflation indicator. For Morpho vaults the base is vault TVL, not market borrows."
              >
                {r.closedLoopShare !== undefined ? fmtPct(r.closedLoopShare) : "—"}
              </div>
```

Update the row/grid column count to match the added column (find the `grid-cols-*` / column template the table uses for its rows and header, and add one column slot so alignment holds). Keep the existing "Recursion" cell unchanged.

- [ ] **Step 3: Typecheck + build the column visually**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.
Then `pnpm dev`, open `/`, confirm a "Closed-loop" column renders with values (MegaETH USDm should show ~97% closed-loop next to ~66% recursion), and the grid stays aligned.

- [ ] **Step 4: Commit**

```bash
git add components/footprint-table.tsx
git commit -m "feat(footprint): add Closed-loop concentration column"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: PASS — all tests (baseline 238 + new metrics/score/solana cases). A failing test outside the touched modules is a real regression; a test asserting an OLD Solana drilldown `share × fraction` score is being corrected (update to `fraction × util`, equal at ~100% util).

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: both succeed.

- [ ] **Step 3: Production-shape sanity (local)**

`pnpm dev`, then confirm: footprint shows two distinct columns (Recursion = exposure, Closed-loop = concentration); MegaETH USDm ≈ 66% / ≈ 97%; Kamino/Jupiter rows ≈ 100% / ≈ 100% (unchanged today); the Solana drilldown recursion score now matches its footprint row.

---

## Dual review (money-touching math — MANDATORY before merge)

Per the treasury / money-code escalation rule: standard `code-reviewer` **plus** a second independent review (`second-opinion` if a CLI is available, else an independent reviewer agent such as `ecc:typescript-reviewer`). Focus them on: the Morpho double-count fix (`recursiveUsd` no longer `∝ shareOfVault²`), the Solana utilization correctness, and that `closedLoopShare` never enters `recursiveUsd`/`trueRecursionShare`/any backing total. Resolve CRITICAL/HIGH before Gate 2. Feature branch (`feat/recursion-closed-loop-column`); auto-deploy on push to `main`.

---

## Self-Review

- **Spec coverage:** canonical helper (Task 1); two consistent columns + `recursiveUsd = supplyShare × recursiveBorrows` (Tasks 1-5); Morpho double-count fix (Task 3); Solana utilization future-proofing + drilldown/footprint alignment (Tasks 4-5); new display-only column (Task 6); Morpho TVL-base nuance documented in helper + tooltip; dual review (review section). ✓
- **Placeholder scan:** test steps that depend on each file's existing fixture pattern (Tasks 4-5) instruct the implementer to reuse the established factory rather than invent one — concrete, not "TBD". No TODO/placeholder code.
- **Type consistency:** `closedLoopShare` is the single field name on `ReserveRecursion`, `FootprintRow`, `MorphoVaultView`, and `SolanaVaultView`; `recursionMetrics(supplyShare, recursiveFraction, utilization)` and `morphoRecursionMetrics(shareOfVault, vaultRecursionShare)` signatures are used identically at every call site; `exposureScore`/`closedLoopShare` are the `RecursionMetrics` field names throughout.
