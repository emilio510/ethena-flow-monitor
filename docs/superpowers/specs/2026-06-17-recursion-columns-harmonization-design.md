# Recursion Columns Harmonization + Closed-Loop Concentration — Design

**Date:** 2026-06-17
**Status:** Approved for planning (brainstorm complete, Gate 1 pending on the plan)
**Touches money-math → dual review required before merge** (per the treasury / money-code escalation rule).

## 1. Problem

The footprint table shows one recursion percentage per position, but after the 2026-06-16 Aave utilization fix the `recursionScore` field means **different things on different protocol rows**, and a related double-count was found:

| Protocol | current footprint `recursionScore` | shape |
|---|---|---|
| Aave (post-fix) | `ethenaCollateralBorrowShare × utilization` | exposure rate, no supplyShare |
| Morpho | `shareOfVault × vaultRecursionShare` | closed-loop shape, has supplyShare |
| Kamino / Jupiter | `recursiveBorrowFraction` only | borrow fraction, no supplyShare, **no utilization** |

Two concrete defects fall out of this:

- **Morpho double-count.** `recursiveUsd = ethenaSuppliedUsd × (shareOfVault × vaultRecursionShare)`, and `ethenaSuppliedUsd = shareOfVault × TVL`, so `recursiveUsd ∝ shareOfVault²` — the same defect class fixed for Aave on 2026-06-16. It **under-reports** recursive exposure for vaults Ethena does not fully own (≈0 error for the ~100%-owned flagship vaults; real for partially-owned ones).
- **Solana fragility.** The footprint Kamino/Jupiter score is *correct today only by coincidence*: the markets run ~100% utilization (so the missing-utilization term ≈ 1) and Ethena owns ~100%. If utilization falls or ownership dilutes, the score silently overstates — a latent silent-failure on the venue most likely to change. The Solana **drilldown** (`solana-vault.ts`) already uses a *different* formula (`shareOfVault × recursiveFraction`) than the footprint, so the two views disagree.

Separately, the user wants a **new "Closed-loop" column**: the share of a market's borrow activity that is a fully-closed Ethena loop (Ethena is **both** the lender and the collateral source). It signals concentration risk and how much of a market is artificially inflated by Ethena lending to itself. This metric is exactly `supplyShare × recursiveBorrowFraction` — the formula removed from the Aave score on 2026-06-16, now repurposed correctly as a concentration indicator rather than an exposure rate.

## 2. Goal

Two clearly-labeled, **consistently-defined** columns across all four protocols (Aave, Morpho, Kamino, Jupiter):

1. **Recursion** (existing column, now consistent) — **exposure rate** = `recursiveUsd / ethenaSuppliedUsd`. "What share of Ethena's deposited capital in this venue is actively levered in a recursive loop." Drives the headline `recursiveUsd`.
2. **Closed-loop** (new column) — **concentration** = `supplyShare × recursiveBorrowFraction`. "What share of this market's recursive borrow activity is a closed Ethena↔Ethena loop." Display-only; does **not** feed any backing or recursive-$ total.

## 3. Canonical definitions

Let, per venue:
- `s` = Ethena's share of the venue's supply (`shareOfReserve` / `ethenaShareOfVault`)
- `r` = recursive-borrow fraction (recursive borrows ÷ total borrows of the venue)
- `u` = utilization (total borrows ÷ total supply of the venue)

Then **uniformly**:

- **Recursion (exposure)** = `recursiveUsd / suppliedUsd`, with `recursiveUsd(row) = suppliedUsd × exposureScore` and `exposureScore = r × u`. This makes `recursiveUsd = s × totalSupply × r × u = s × recursiveBorrows` on every protocol — Ethena's own supplied dollars that are recursively borrowed out. No `supplyShare²`.
- **Closed-loop (concentration)** = `s × r`.

Per-protocol realization (mostly re-exposing values already computed):

| Protocol | `r` (recursive-borrow fraction) | `u` (utilization) | exposureScore (`r×u`) | closed-loop (`s×r`) |
|---|---|---|---|---|
| **Aave** | `ethenaCollateralBorrowShare` | `(aggBorrows+morphoBorrows)/(aggDeposits+morphoBorrows)` | `ethenaCollateralBorrowShare × utilization` *(shipped)* | `ethenaSupplyShare × ethenaCollateralBorrowShare` |
| **Morpho** | n/a as a single book† | baked into `vaultRecursionShare` | `vaultRecursionShare` *(drop the `× shareOfVault` — fixes double-count)* | `shareOfVault × vaultRecursionShare` |
| **Kamino** | `computeKaminoRecursion` | `Σ totalBorrowUsd / Σ totalSupplyUsd` | `recursiveFraction × utilization` *(add `× u`)* | `shareOfVault × recursiveFraction` |
| **Jupiter** | `computeJupiterRecursion` | `Σ borrowedUsd / lendingTotalSuppliedUsd` | `recursiveFraction × utilization` *(add `× u`)* | `shareOfVault × recursiveFraction` |

†**Morpho base nuance (deliberate, documented):** a Morpho vault is a *supplier across many markets it does not own*, so it has no single borrow book. Its `vaultRecursionShare` is already a utilization-weighted fraction of **vault TVL** (`attributedRecursiveBorrow / TVL`, where `attributedRecursiveBorrow = Σ supplyAssetsUsd × marketUtilization` over recursive markets). We therefore define Morpho's closed-loop as `shareOfVault × vaultRecursionShare` (base = vault TVL), not a fraction-of-market-borrows. This is the honest protocol-appropriate analog; the column tooltip notes the base differs for vaults. For Aave and the single-market Solana venues, closed-loop **is** a clean fraction of that market's borrows.

**Today's numbers are unchanged where they were already correct:** with Solana at ~100% util and ~100% ownership, `r×u ≈ r` and `s×r ≈ r`, so Solana still reads ~100% on both columns — but now self-corrects if util or ownership moves. Aave exposure is already shipped. Morpho exposure drops only the erroneous `shareOfVault` factor (visible change only on partially-owned vaults).

## 4. Components & changes

- **`lib/recursion/score.ts`** — `ReserveRecursion` already returns `ethenaSupplyShare` and `ethenaCollateralBorrowShare`. Add a derived `closedLoopShare = clamp(ethenaSupplyShare × ethenaCollateralBorrowShare)` to the returned object. `recursionScore` (exposure) stays as shipped.
- **`lib/views/vault.ts`** (Morpho) — split the two metrics: `recursionScore` (exposure) becomes `vaultRecursionShare` (was `ethenaShareOfVault × vaultRecursionShare`); add `closedLoopShare = clamp(ethenaShareOfVault × vaultRecursionShare)`. This is the **double-count fix** — `recursiveUsd` downstream becomes `suppliedUsd × vaultRecursionShare = shareOfVault × TVL × vaultRecursionShare` (correct).
- **`lib/solana/kamino.ts` / `lib/solana/fluid.ts`** — expose a utilization helper from the totals each already parses (`totalSupplyUsd`/`totalBorrowUsd` for Kamino; `lendingUsd` total + summed `borrowedUsd` for Jupiter). Keep `computeKaminoRecursion`/`computeJupiterRecursion` (the `r` fraction) unchanged.
- **`lib/solana/positions.ts`** — footprint rows: `recursionScore` (exposure) = `recursiveFraction × utilization`; add `closedLoopShare = clamp(shareOfReserve × recursiveFraction)`.
- **`lib/views/solana-vault.ts`** — drilldown: align to the same canonical pair so footprint and drilldown agree (`recursionScore = recursiveFraction × utilization`; `closedLoopShare = shareOfVault × recursiveFraction`).
- **`lib/views/footprint.ts`** — add `closedLoopShare?: number` to `FootprintRow`; populate it from each protocol's computed value. The Aave path reads `recursion.closedLoopShare`; Morpho reads the new vault field; Solana rows carry it through. `weightedRecursion`/`recursiveUsd` keep using `recursionScore` (exposure) only — **closed-loop never enters any total.**
- **`components/footprint-table.tsx`** — add a "Closed-loop" column rendering `fmtPct(r.closedLoopShare)` with a tooltip/subcopy explaining "share of this market's borrow activity that is a closed Ethena loop (Ethena both supplier and collateral); concentration indicator." Keep the existing "Recursion" column (now consistently the exposure rate).

## 5. Data flow

No new data sources. Kamino (`api.kamino.finance`) and Fluid (`api.solana.fluid.io`) already return the supply and borrow totals needed for utilization; Aave aggregates and Morpho allocation already carry theirs. All reads stay server-side at render time (Solana is not Cloudflare-blocked).

## 6. Error handling / invariants

- Every score and the closed-loop value is `clamp`ed to `[0,1]`.
- Utilization guards a zero denominator: `u = supply > 0 ? clamp(borrows/supply) : 0` (and the Aave Morpho-fold fallback already shipped).
- No silent `?? 0` on a money input: a missing supply/borrow total must surface (existing Solana failure-collection pattern), never coerce to a wrong utilization.
- Closed-loop is display-only: a regression test pins that changing `closedLoopShare` leaves `recursiveUsd`, `trueRecursionShare`, and every backing total unchanged.

## 7. Testing

Per protocol, table-style unit tests asserting the two metrics decompose correctly:
- **Aave** (already has utilization tests): add a closed-loop assertion (`s × borrowShare`).
- **Morpho**: a partially-owned vault (e.g. `shareOfVault = 0.5`, `vaultRecursionShare = 0.8`) asserts exposure = `0.8` (not `0.4`) and closed-loop = `0.4`; `recursiveUsd = suppliedUsd × 0.8`. A 100%-owned vault asserts no change vs today.
- **Solana** (Kamino + Jupiter): drive a market to **70% utilization and 60% ownership** and assert exposure = `r × 0.7` and closed-loop = `0.6 × r` — the future-proofing case that is masked today. A ~100%/~100% case asserts today's numbers are unchanged.
- **Cross-cutting**: closed-loop is display-only (totals invariant); footprint and Solana drilldown now report the same exposure score for the same position.

Target: keep the suite green (currently 238) plus the new cases; `tsc` clean; `pnpm build` before push.

## 8. Out of scope

- The headline footprint path still does not fold Morpho borrows into Aave reserve utilization (pre-existing footprint-vs-drilldown split, documented in project memory). Not addressed here.
- The Aave sampled-borrow-share truncation assumption (one 10k page) is unchanged.
- No visual redesign beyond adding one column.

## 9. Review policy

Money-touching recursion math. Before Gate 2: standard `code-reviewer` **plus** a second independent review (`second-opinion` if a CLI is available, else an independent reviewer agent such as `typescript-reviewer`). Resolve CRITICAL/HIGH before commit. Conventional commits; feature branch (auto-deploy on push to `main`).
