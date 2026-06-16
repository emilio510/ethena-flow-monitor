# Recursion Utilization Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Aave per-reserve recursion score (and the headline recursive-$ figure it drives) utilization-aware, so idle supplied liquidity is no longer counted as recursive.

**Architecture:** Today `computeReserveRecursion` returns `recursionScore = ethenaSupplyShare × ethenaCollateralBorrowShare`, and `footprint.ts` derives recursive dollars as `ethenaSuppliedUsd × recursionScore`. That product has **two defects**: (1) it has no *utilization* term, so on a reserve where Ethena supplies $550M but only $375M is borrowed, the idle $175M is billed as recursive; and (2) because the weighting multiplies by `ethenaSuppliedUsd` (which already embeds Ethena's supply share), keeping `ethenaSupplyShare` *inside the score too* double-applies it. The fix is to redefine the score as `ethenaCollateralBorrowShare × utilization` (dropping the standalone `ethenaSupplyShare` factor), where `utilization = aggregateBorrows / aggregateDeposits`. With `recursiveUsd(row) = ethenaSuppliedUsd × score`, this algebraically yields the economically correct `supplyShare × totalBorrows × recursiveBorrowFraction` — Ethena's supplied dollars that are actually borrowed out into recursive loops. The change is localized to `lib/recursion/score.ts`; every downstream surface (footprint table %, headline `recursiveUsd`/`trueRecursionShare`, reserve drilldown KPI) reads the same `recursionScore` and updates automatically.

**Why this is Aave-only:** the Morpho vault scorer (`lib/views/vault.ts:108-114`) already multiplies by `utilization` ("Idle liquidity sitting in a recursive market does NOT inflate the score"), and the Solana/Jupiter scorer (`lib/solana/fluid.ts`) already computes from `totalBorrow`. Only the Aave path skips utilization.

**Tech Stack:** TypeScript, Vitest, Next.js 16 (server components). No new deps.

**Basis-consistency (do not regress):** `utilization` is `aggregateBorrows / aggregateDeposits` — both full-basis markets-API USD aggregates, so their ratio is unaffected by one-page borrower truncation. `ethenaCollateralBorrowShare` stays on the sampled-borrower basis (`ethenaStackBorrowed / attributedBorrowsTotal`, the 2948e2d fix). Each factor is internally basis-consistent.

**Cross-protocol caveat (in scope to not regress, not to perfect):** only the reserve *drilldown* (`lib/views/reserve.ts`) passes `morphoMarkets`; the footprint/headline path never does. When folded Morpho borrows exist but there is **no Aave deposit base** (`aggregateDeposits === 0`), `utilization` falls back to `1` so the Morpho-driven recursion is not zeroed. When an Aave base *does* exist alongside folded Morpho borrows, the Morpho slice is dampened by Aave utilization — an acknowledged approximation, consistent with the pre-existing footprint-vs-drilldown divergence; not expanded here.

---

## File Structure

- `lib/recursion/score.ts` — **MODIFY**. Redefine `recursionScore`; add `utilization`. The only logic change.
- `tests/recursion/score.test.ts` — **MODIFY**. Update 2 existing expectations to the new (correct) behavior; add 3 new tests.
- `app/reserve/[chain]/[asset]/page.tsx` — **MODIFY (copy only)**. Clarify the "Recursion score" KPI sublabel so the displayed % is not mistaken for the old supply×borrow qualifier.
- `lib/views/footprint.ts` — **NO CODE CHANGE**. Verified: `recursiveUsd = weightedRecursion × deployedUsd` and per-row `ethenaSuppliedUsd × recursionScore` become correct automatically once the score is fixed. A test pins this.

---

### Task 1: Make the Aave recursion score utilization-aware

**Files:**
- Modify: `lib/recursion/score.ts:92-103`
- Test: `tests/recursion/score.test.ts`

- [ ] **Step 1: Update the two existing tests that assert the OLD (supply×borrow) score**

In `tests/recursion/score.test.ts`, the MegaETH case (currently named "~83%") and the borrow-share case assert the pre-fix formula. Replace them with the new expectations.

Replace the first test (lines 24-50) body's assertions block:

```typescript
  it("MegaETH/USDM: score is utilization-aware (borrowShare × utilization), not supply×borrow", () => {
    const ethenaWallet = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"
    const rows: UserPositionRow[] = [
      row({
        userAddress: "0x222",
        supplies: [{ symbol: "USDe", amount: 200_000_000, amountUsd: 200_000_000 }],
        borrows: [{ symbol: "USDm", amount: 179_000_000, amountUsd: 179_000_000 }],
        totalSupplyUsd: 200_000_000,
        totalBorrowUsd: 179_000_000,
      }),
    ]

    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows,
      aggregateDeposits: 600_000_000,
      aggregateBorrows: 179_000_000,
      ethenaSupplyByUser: new Map([[ethenaWallet, 500_000_000]]),
    })

    // utilization = 179M / 600M = 0.2983; borrowShare = 179M/179M = 1.0
    // score = borrowShare × utilization (supplyShare is NOT a factor of the score)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(1)
    expect(result.recursionScore).toBeCloseTo(179_000_000 / 600_000_000)
    // recursive$ = ethenaSupplied × score = 500M × 0.2983 ≈ $149M (borrow-anchored)
    expect(500_000_000 * result.recursionScore).toBeCloseTo(149_166_666, -4)
    expect(result.borrowsByCollateral.get("USDe")).toBeCloseTo(179_000_000)
  })
```

Replace the borrow-share test (lines 91-122) assertions block (`aggregateDeposits`/`aggregateBorrows` are both `1_000_000_000`, so utilization = 1.0):

```typescript
    expect(result.attributedBorrowsTotal).toBeCloseTo(400_000_000)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(0.5) // 200/400, not 200/1000
    // utilization = 1.0 (aggregateBorrows == aggregateDeposits); score = borrowShare × util
    expect(result.recursionScore).toBeCloseTo(0.5)
```

- [ ] **Step 2: Add the new behavioral tests**

Append inside the `describe` block:

```typescript
  it("dampens the score by utilization (idle supply is not recursive)", () => {
    // 1000 supplied, only 600 borrowed, all against USDe.
    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows: [
        row({
          userAddress: "0x1",
          supplies: [{ symbol: "USDe", amount: 700_000_000, amountUsd: 700_000_000 }],
          borrows: [{ symbol: "USDm", amount: 600_000_000, amountUsd: 600_000_000 }],
          totalSupplyUsd: 700_000_000,
          totalBorrowUsd: 600_000_000,
        }),
      ],
      aggregateDeposits: 1_000_000_000,
      aggregateBorrows: 600_000_000,
      ethenaSupplyByUser: new Map([["0xe", 1_000_000_000]]),
    })
    // borrowShare = 1.0, utilization = 0.6 → score = 0.6 (NOT 1.0)
    expect(result.recursionScore).toBeCloseTo(0.6)
  })

  it("at 100% utilization the score equals the recursive borrow fraction (no regression)", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows: [
        row({
          userAddress: "0x1",
          supplies: [{ symbol: "USDe", amount: 500_000_000, amountUsd: 500_000_000 }],
          borrows: [{ symbol: "USDm", amount: 500_000_000, amountUsd: 500_000_000 }],
          totalSupplyUsd: 500_000_000,
          totalBorrowUsd: 500_000_000,
        }),
      ],
      aggregateDeposits: 500_000_000,
      aggregateBorrows: 500_000_000,
      ethenaSupplyByUser: new Map([["0xe", 500_000_000]]),
    })
    // utilization = 1.0, borrowShare = 1.0 → score = 1.0
    expect(result.recursionScore).toBeCloseTo(1)
  })

  it("folded-Morpho with no Aave base falls back to utilization=1 (not zeroed)", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDtb",
      marketKey: "ethereum-core-v3",
      rows: [],
      aggregateDeposits: 0,
      aggregateBorrows: 0,
      ethenaSupplyByUser: new Map(),
      morphoMarkets: [{ collateralSymbol: "sUSDe", marketBorrowUsd: 108_000_000 }],
    })
    // No Aave deposits → utilization falls back to 1; borrowShare = 1.0 → score = 1.0
    expect(result.recursionScore).toBeCloseTo(1)
  })
```

- [ ] **Step 3: Run the tests to verify they FAIL**

Run: `pnpm exec vitest run tests/recursion/score.test.ts`
Expected: FAIL — old formula returns `supplyShare × borrowShare` (e.g. MegaETH `0.833`, dampen-case `1.0`), not the new util-aware values.

- [ ] **Step 4: Implement the fix in `lib/recursion/score.ts`**

Replace the `ethenaCollateralBorrowShare` block and the `recursionScore` field (current lines 92-100).

Current:

```typescript
  const ethenaCollateralBorrowShare =
    attributedBorrowsTotal > 0 ? clamp(ethenaStackBorrowed / attributedBorrowsTotal) : 0

  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: ethenaSupplyShare * ethenaCollateralBorrowShare,
```

New:

```typescript
  const ethenaCollateralBorrowShare =
    attributedBorrowsTotal > 0 ? clamp(ethenaStackBorrowed / attributedBorrowsTotal) : 0

  // Reserve utilization on the markets-API aggregate basis (both full-basis,
  // so their ratio is truncation-safe). This converts "Ethena's supplied $"
  // (the weight applied downstream) into "Ethena's supplied $ actually borrowed
  // out" — idle supply is not recursive. When there is no Aave deposit base but
  // folded Morpho borrows exist (drilldown only), fall back to 1 so the
  // Morpho-driven recursion is not zeroed.
  const utilization =
    input.aggregateDeposits > 0
      ? clamp(input.aggregateBorrows / input.aggregateDeposits)
      : (input.morphoMarkets?.length ? 1 : 0)

  // Score = recursive-borrow fraction × utilization. `ethenaSupplyShare` is
  // deliberately NOT a factor: downstream recursive-$ = ethenaSuppliedUsd ×
  // score, and ethenaSuppliedUsd already embeds Ethena's supply share, so
  // including it here would double-apply it. `ethenaSupplyShare` is still
  // returned for display/diagnostics.
  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: ethenaCollateralBorrowShare * utilization,
```

- [ ] **Step 5: Run the tests to verify they PASS**

Run: `pnpm exec vitest run tests/recursion/score.test.ts`
Expected: PASS (all cases, including the unchanged Morpho-fold tests at lines 52-89 — they have `aggregateDeposits === 0` so utilization falls back to 1, preserving their `0.5` / `1.0` expectations).

- [ ] **Step 6: Commit**

```bash
git add lib/recursion/score.ts tests/recursion/score.test.ts
git commit -m "fix(recursion): make Aave reserve score utilization-aware

recursionScore was supplyShare × borrowShare with no utilization term, so
idle supplied liquidity counted as recursive (MegaETH USDM: ~\$535M billed vs
~\$364M actually borrowed). Redefine as borrowShare × utilization; drop the
standalone supplyShare factor (it is double-applied via the downstream
ethenaSuppliedUsd weighting). Morpho/Solana scorers already utilization/borrow
anchored — Aave was the only gap."
```

---

### Task 2: Pin the headline recursive-$ math (footprint integration test)

**Files:**
- Test: `tests/recursion/score.test.ts` (a focused unit assertion — no `footprint.ts` code change)

- [ ] **Step 1: Write a test asserting the recursive-$ identity that footprint relies on**

Append inside the `describe` block. This locks the contract `footprint.ts` depends on (`recursiveUsd(row) = ethenaSuppliedUsd × recursionScore` equals the borrow-anchored figure), so a future score change can't silently re-break the headline.

```typescript
  it("ethenaSuppliedUsd × score equals supplyShare × totalBorrows × recursiveFraction", () => {
    // MegaETH shape: 550M Ethena supply of 565M total; 375M borrowed, all vs USDe.
    const ethenaSupplied = 550_000_000
    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows: [
        row({
          userAddress: "0x1",
          supplies: [{ symbol: "USDe", amount: 400_000_000, amountUsd: 400_000_000 }],
          borrows: [{ symbol: "USDm", amount: 375_000_000, amountUsd: 375_000_000 }],
          totalSupplyUsd: 400_000_000,
          totalBorrowUsd: 375_000_000,
        }),
      ],
      aggregateDeposits: 565_000_000,
      aggregateBorrows: 375_000_000,
      ethenaSupplyByUser: new Map([["0xe", ethenaSupplied]]),
    })
    const recursiveUsd = ethenaSupplied * result.recursionScore
    // supplyShare(550/565) × totalBorrows(375M) × recursiveFraction(1.0) ≈ $365M
    const expected = (ethenaSupplied / 565_000_000) * 375_000_000 * 1.0
    expect(recursiveUsd).toBeCloseTo(expected, -4)
    // And it is NOT the old supply-anchored ~$535M.
    expect(recursiveUsd).toBeLessThan(400_000_000)
  })
```

- [ ] **Step 2: Run to verify it PASSES** (Task 1 already implements the fix)

Run: `pnpm exec vitest run tests/recursion/score.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/recursion/score.test.ts
git commit -m "test(recursion): pin borrow-anchored recursive-\$ identity used by footprint headline"
```

---

### Task 3: Clarify the reserve-page "Recursion score" copy

**Files:**
- Modify: `app/reserve/[chain]/[asset]/page.tsx:95-98`

- [ ] **Step 1: Read the KpiCard to confirm its props**

Run: `grep -n "KpiCard" components/**/*.tsx app/reserve/**/*.tsx`
Then open the `KpiCard` definition to confirm whether it accepts a `hint`/`sub`/`title` prop. If it does NOT, only the surrounding helper text is editable — adjust the nearest descriptive line instead. Do not invent a prop.

- [ ] **Step 2: Update the label/sublabel so the % reads as utilization-aware**

The page already renders a separate `Utilization` KPI (line 89), so the two now compose. Change the `Recursion score` KpiCard (lines 96-97) label text to make the meaning explicit. If `KpiCard` supports a hint prop:

```tsx
          <KpiCard
            label="Recursion score"
            hint="Share of Ethena's supplied position actively borrowed into Ethena-collateralised loops (utilization-aware)"
            value={fmtPct(view.recursion.recursionScore)}
          />
```

If it does not support a hint prop, leave the value untouched and instead update the existing descriptive copy nearest the KPI grid to state that recursion score is utilization-aware. Keep the change copy-only.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no new type errors).

- [ ] **Step 4: Commit**

```bash
git add "app/reserve/[chain]/[asset]/page.tsx"
git commit -m "docs(reserve): label recursion score as utilization-aware"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS — all tests (baseline was 233; this plan nets +3 recursion tests). If any test outside `tests/recursion/` fails, it depended on the old score semantics — investigate before "fixing" it (a test asserting the old supply×borrow value is itself the thing being corrected; a test asserting unrelated behavior failing is a real regression).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build (Next 16 — required before push per AGENTS.md)**

Run: `pnpm build`
Expected: success.

- [ ] **Step 4: Sanity-read the live headline locally**

Run: `pnpm dev`, open `/`, and confirm the "Recursive exposure" hero meter dropped vs the old value (MegaETH was the biggest single contributor). Open `/reserve/megaeth/USDm` and confirm the Recursion score KPI now reads materially below the old ~97% and is consistent with the displayed Utilization × Borrow-recursion.

---

## Dual review (money-touching math — MANDATORY before merge)

Per the treasury / money-code escalation rule, this recursion-math change requires a second **independent** review in addition to the standard `code-reviewer`:

- Run `/santa-loop lib/recursion/score.ts tests/recursion/score.test.ts` (adversarial dual-model; both must return NICE), **or** the `second-opinion` skill as fallback.
- Do **not** merge on a single reviewer's approval. Resolve any CRITICAL/HIGH before Gate 2.

---

## Self-Review

- **Spec coverage:** util-aware score (Task 1) ✓; util-aware displayed % — propagates from the single `recursionScore` to footprint table (`fmtPct(r.recursionScore)`) and reserve KPI ✓; honest headline `recursiveUsd`/`trueRecursionShare` (Task 2 pins the identity; no `footprint.ts` change needed) ✓; copy honesty (Task 3) ✓; dual review (money-code rule) ✓.
- **Placeholder scan:** Task 3 Step 2 is conditional on a real prop — explicitly instructs *not* to invent one and to read the component first. No TBD/TODO.
- **Type consistency:** no interface changes; `recursionScore`, `ethenaSupplyShare`, `ethenaCollateralBorrowShare`, `attributedBorrowsTotal`, `borrowsByCollateral` all retain current names/types. `ethenaSupplyShare` remains on the returned object (now informational).
