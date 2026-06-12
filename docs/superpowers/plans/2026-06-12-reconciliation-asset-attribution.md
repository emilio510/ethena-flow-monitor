# Reconciliation asset-attribution fixes — Spec + Plan

Date: 2026-06-12
Status: Approved (diagnosis confirmed live; user approved both fixes)

## Problem (two confirmed money-math defects)

Reconciliation keys the on-chain ("ours") side by asset symbol, but two things make per-asset totals wrong:

### Bug A — Kamino position hardcoded to USDG; Ethena rotated to PYUSD
`lib/solana/positions.ts:88` hardcodes `reserveSymbol: "USDG"` and books the **entire** Kamino counterparty value (~$272.5M) as USDG. Live Kamino (`/kamino-market/BJnb…/reserves/metrics`) + the snapshot both show the Ethena Prime kvault now lends **PYUSD $250.1M + USDG $20.2M** (rotation USDG→PYUSD). Effect:
- USDG on-chain over-stated ~$250M → false "−$250M, on-chain exceeds reported" gap.
- PYUSD on-chain under-stated $250M → the Solana PYUSD leg is invisible (mislabeled USDG).
`buildJupiterRow:115` has the same hardcoded `"USDG"` (currently correct — Jupiter is 100% USDG — but the same rot risk).

### Bug B — JAAA Base leg not read; same asset spans EVM + Solana
Ethena reports JAAA $249.7M = Solana $199.8M + **Base $49.9M**. Only the Solana leg is on-chain. The Base JAAA (wallet `0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4`, contract `0x5a0f93d040de44e78f251b03c43be9cf317dcf64`, ~48.2M units) is not read. The EVM idle reader only values stables 1:1 + ERC4626 vaults — it has no price hook for a non-stable RWA token.

Ethena per-asset/per-chain truth (snapshot 1781226081):
- PYUSD $825.8M = Ethereum $575.9M + Solana $250M
- USDG $274.0M = Solana $274M (Kamino $22.5M + Jupiter $251.4M)
- JAAA $249.7M = Solana $199.8M + Base $49.9M

## Fix A — Kamino/Jupiter per-asset attribution

Drive the Solana footprint rows from the snapshot's per-counterparty **asset breakdown** instead of a single hardcoded-symbol total. No symbol hardcode → no silent rot on the next rotation.

**`lib/solana/positions.ts`:**
- Change `extractSolanaLegs` to return per-counterparty asset legs:
  ```ts
  interface AssetLeg { asset: string; value: number }
  function extractSolanaLegs(snapshot): { kamino: AssetLeg[]; jupiter: AssetLeg[] }
  ```
  Aggregate `cp.assets` (asset, value) for the Kamino and Jupiter counterparties within the `"DeFi Lending"` strategy. (Keeps the existing strategy/counterparty filter.)
- `buildKaminoRow(ethenaUsd)` → `buildKaminoRows(legs: AssetLeg[]): Promise<FootprintRow[]>`. Fetch `vault` + `reserves` once. For each leg emit a row with `reserveSymbol: leg.asset`, `ethenaSuppliedUsd: leg.value`. Enrichment per leg: match the Kamino reserve by `liquidityToken === leg.asset` for `reserveAggregateDeposits`/`shareOfReserve` (fall back to `vault.tokensInvestedUsd` only for the legacy single-asset case). `recursionScore` = `computeKaminoRecursion(reserves)` (market-level — same for every leg of the market). Skip legs with `value <= 0`.
- `buildJupiterRow(ethenaUsd)` → `buildJupiterRows(legs: AssetLeg[]): Promise<FootprintRow[]>`. Same shape: `reserveSymbol: leg.asset` from the snapshot leg (not hardcoded). Jupiter enrichment stays the jleUSDG/USDG Fluid lending figure (Jupiter is USDG-only today); label still comes from the leg so a future rotation surfaces correctly.
- `getEthenaSolanaPositions` aggregates `rows = [...kaminoRows, ...jupiterRows]`; keep the `Promise.allSettled` + `failed[]` partial-tolerance exactly as is.

**No change needed** to `footprint.ts` recursion weighting (it already iterates `solana.rows` and uses `row.ethenaSuppliedUsd × recursionScore`) or to `buildReconciliation` (it sums `deployed` rows by `reserveSymbol` — now correctly USDG vs PYUSD).

**Expected reconciliation effect:** USDG on-chain drops to ~$273.9M (≈ Ethena $274M → verified); PYUSD on-chain gains the $250M Solana leg.

## Fix B — read the Base JAAA leg (EVM idle non-stable pricing)

Add a price hook to the EVM idle reader so a non-stable token (JAAA) can be valued via the Alchemy Prices API, then list JAAA on Base.

**`config/idle-tokens.ts`:**
- Extend `IdleToken` with an optional:
  ```ts
  /** Price via the Alchemy Prices API by (network,address) instead of the
   *  default $1 peg. For non-stable tokens (RWA) held idle. */
  priceVia?: { network: string; address: string; approx?: boolean }
  ```
- Add to `IDLE_TOKENS.base`:
  ```ts
  { symbol: "JAAA", address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64", decimals: 6,
    priceVia: { network: "base-mainnet", address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64", approx: true } }
  ```
  (JAAA's own Base contract is both the held token and the price source.)

**`lib/onchain/balances.ts` (`getEthenaIdleBalances`):**
- Before the per-chain scan, collect every `IdleToken` with `priceVia` across all chains and batch-fetch their prices via `fetchTokenPrices` (from `lib/onchain/prices.ts`) into a `Map`. A fetch failure pushes a `failures` entry and leaves the map empty (no throw).
- In `toRows`, valuation precedence per token: `isErc4626` → `convertToAssets` (unchanged); else `priceVia` → `amount × price`, and **if the price is missing, exclude the token + `console.warn` + push a failure** (no `?? 0`, set `approx: true` on the row); else → 1:1 (unchanged).
- Carry the `approx` flag onto the resulting `IdleBalanceRow` (the field already exists).

**No double-count:** JAAA is held directly (idle), has no deployed footprint row. `0x2d4d2a…` is already in `ETHENA_WALLETS`/`MONITORED_WALLETS`, so `balanceOf` already covers it.

**Expected reconciliation effect:** JAAA on-chain = Solana $199.8M + Base $49.9M ≈ Ethena $249.7M → verified (within the `max($10M, 3%)` tolerance).

## Out of scope
- The residual EVM PYUSD / USDC gaps vs Ethena are genuine custodian-omnibus (off-chain), not bugs.
- Truly on-chain (vs snapshot-derived) reading of the Kamino USDG/PYUSD split — the snapshot asset breakdown is authoritative enough for labeling; revisit only if it proves unreliable.

## Tasks (TDD; independent math review before merge)

1. **Fix A** — `lib/solana/positions.ts` per-asset Kamino/Jupiter rows. Tests in `tests/solana/` (or `tests/views/`): given a snapshot with Kamino assets `[USDG 22.5M, PYUSD 250M]` + Jupiter `[USDG 251.4M]`, `getEthenaSolanaPositions` emits a PYUSD row of $250M and a USDG row of $22.5M (Kamino) + $251.4M (Jupiter); no row labeled USDG carries the PYUSD value. Mock the Kamino/Fluid fetchers.
2. **Fix B** — `config/idle-tokens.ts` + `lib/onchain/balances.ts` priceVia. Tests in `tests/onchain/`: a `priceVia` token is valued at `amount × price` with `approx: true`; a missing price excludes it + records a failure (no $0). Mock multicall + `fetchTokenPrices`.
3. **Reconciliation assertion** — extend `tests/views/`: with the corrected deployed rows + Base JAAA idle, USDG nets to ~$274M (verified) and JAAA nets to ~$249.7M (verified); PYUSD on-chain includes the Solana $250M.
4. **Verify** — full suite + tsc + `pnpm build` + live smoke (USDG no longer a −$250M gap; PYUSD shows the Solana leg; JAAA verified).
