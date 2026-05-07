# Ethena Flow Monitor — Design Spec

**Date:** 2026-05-06
**Status:** Draft (pre-implementation)
**Owner:** TokenLogic

## Purpose

A dedicated dashboard that highlights **Ethena's recursive-loop exposure** across Aave V3 and Morpho Blue deployments on five chains. The product surfaces, in one number per reserve, how much of a given lending market is functioning as a same-dollar recycling loop where Ethena supplies one side and Ethena-issued tokens collateralise the other side.

The dashboard borrows the visual vocabulary of Yuzu's `research.yuzu.money/aave-exposures` page (dark mono UI, concentration panels, depositor/borrower tables), but is scoped narrowly to Ethena rather than serving as a general Aave explorer.

## Why this matters

Ethena's USDe/sUSDe backing has migrated from being primarily funding-rate carry to sitting in liquid stablecoin lending positions, predominantly Aave. The same dollar can simultaneously serve as (a) Ethena's USDe backing and (b) collateral for someone else's leveraged USDe position on the lending market. This dual-use creates fragility that aggregate TVL numbers hide. The dashboard exposes the loop quantitatively.

## Scope

**Chains:** Ethereum, Base, Mantle, Plasma, MegaETH.
**Protocols:** Aave V3 (all 5 chains), Morpho Blue (Ethereum + Base only).
**Monitored wallets:** 11 Ethena-controlled addresses (provided as a config file, see §6).
**Assumption:** All 11 wallets are passive depositors with zero borrows. Any borrow detected on these wallets is flagged as an anomaly, not aggregated as normal data.

## Product surface

### View A — Ethena footprint (landing)

Single page summarising every position the 11 wallets hold across all chains and protocols.

- **Header KPIs:** total $ supplied, reserves touched, chains active, protocols active.
- **Per-position table** with columns: chain icon, protocol (Aave / Morpho), asset, Ethena $ supplied, % of reserve supply, recursion score (§3), tag column ("PASSIVE", "ANOMALY: BORROW", "MORPHO VAULT", "PT").
- Sortable by Ethena $ desc by default. Click row → View B for that reserve.

### View B — Reserve drill-down

The Yuzu reserve page, retrofitted with Ethena-specific overlays.

- **Reserve KPI strip:** total supplied, total borrowed, utilisation, supply APY, borrow APY, supply cap, borrow cap.
- **Concentration panel:** Top 1 / 5 / 10 supplier share, with green ETHENA tag on any slot occupied by one of the 11 wallets.
- **Top depositors table:** ranked by aToken supply. Ethena rows pinned to top with green ETHENA badge.
- **Borrow recursion panel** (the headline of the page):
  - Donut chart of borrows split by collateral asset.
  - Adjacent table with columns: collateral asset, collateral $, borrowed $, leverage, share of total borrows, **tag** (ETHENA-DIRECT for Tier-1 tokens, PT for Pendle PT tokens).
  - Above the panel, the headline statistic: **"X% of borrows are recursive Ethena loops"**.

### Morpho-specific rendering

Morpho Blue uses isolated markets (one collateral, one loan asset per market). For Ethena's vault deposits (e.g. the $50M PYUSD in `sentora-pyusd-core`), View B renders the vault's allocation breakdown directly: each row is one underlying market with its collateral/loan pair labeled, no aggregation needed. Tags applied identically to the Aave view.

## Recursion score

Per (chain × protocol × reserve):

```
recursion_score = ethena_supply_share × ethena_collateral_borrow_share

where:
  ethena_supply_share              = sum(Ethena $ supplied to reserve) / total_supply_$
  ethena_collateral_borrow_share   = sum($ borrowed against TIER_1 union PT_TOKENS) / total_borrows_$
```

Both factors clamp to [0, 1]. Score lives in [0, 1] and is presented as a percentage. The score is the primary sort key in View A.

The numerator of `ethena_collateral_borrow_share` is broken out in View B by sub-bucket (USDe, sUSDe, USDtb, sUSDtb, PT-sUSDe-*, PT-USDe-*, PT-srUSDe-*) so users can see whether the recursion is driven by direct stablecoin collateral or by PT collateral.

### 3.1 Multi-collateral attribution

The user-positions API returns each (user × market) as one row containing a *list* of collateral assets and a *list* of borrowed assets (verified against live data: 3 multi-asset supply rows in the first 200 of `ethereum-core-v3`). To bucket borrows by collateral type for the recursion calculation, we need an attribution rule for users posting multi-asset collateral.

**Default rule — pro-rata by USD value.** For a user with supplied USD totals C₁ + C₂ + … = C_total and total borrow B, attribute `B × (Cᵢ / C_total)` to each collateral asset. Most defensible methodology; assigns proportionally and avoids overcounting.

**Alternative rule — any-Tier-1 ⇒ all.** If any element of `supply_reserve_symbols` is in TIER_1 ∪ PT_TOKENS, count the entire borrow as Ethena-recursive. Higher recall, lower precision. Useful as a stress-test framing.

The UI exposes both via a toggle on View B. The headline "X% of borrows are recursive" defaults to pro-rata; the toggle reveals the alternative number for comparison.

## Data architecture

Two data layers, no persistence needed. The TokenLogic internal user-positions API serves daily-fresh BigQuery snapshots covering every Aave V3 user across all 5 target chains, eliminating the need for a subgraph or event-walking pipeline. Verified against live data on 2026-05-06.

### Layer 1 — Ethena footprint (the 11 wallets)

**Aave:** `GET /internal/aave/user-positions/latest?user_address={addr}` per Ethena wallet. Returns every (market × user) row in one call per wallet. 11 calls total, parallelised. Confirmed on 2026-05-06: wallet `0xb873...313c` returns rows for ethereum, plasma, megaeth (matches the Yuzu screenshot exactly: $500.01M USDM on MegaETH, $450M USDT0 on Plasma).

**Morpho:** Morpho GraphQL `userByAddress(address, chainId)` per wallet × 2 chains (Ethereum + Base). 22 calls, parallelised.

**Optional live refresh** (Phase 2 only, deferred): `viem` + `UiPoolDataProviderV3.getUserReservesData()` for sub-minute freshness if the daily BigQuery cadence ever proves insufficient. Not in MVP.

### Layer 2 — Per-reserve recursion math

**Aave:** `GET /internal/aave/user-positions/latest?market_key={key}` paginated per market, for the 5 markets we care about: `ethereum-core-v3`, `base-core-v3`, `mantle-core-v3`, `plasma-core-v3`, `megaeth-core-v3`. Each row is one user's combined supply + borrow position in that market.

For each row we apply the attribution rule (§3.1) and increment per-(reserve × collateral_class) buckets. Aggregating across all rows of a market gives `ethena_collateral_borrow_share` per reserve in that market.

**Morpho:** GraphQL `marketByUniqueKey` per market — Morpho Blue's isolated-market model means each market is single-collateral / single-loan; no per-borrower attribution needed.

### Layer 3 — Reserve aggregates

`GET /v1/aave/markets/latest` for total supply / borrow / APRs / caps across every reserve in every market in one call. Already returns all the aggregate fields the View B KPI strip needs.

### Caching

React Query session-level cache only. No Vercel KV, no cron job. The TokenLogic API is itself the cache (BigQuery refreshed daily); the dashboard simply reads it on demand.

## Configuration

Single `config/tokens.config.ts` file:

```ts
export const TIER_1 = {        // Ethena-issued
  ethereum: ['USDe', 'sUSDe', 'USDtb', 'sUSDtb'],
  base: [/* ... */],
  // ...per chain, with addresses
}

export const TIER_2 = {        // Backing assets Ethena holds
  ethereum: ['USDC', 'USDT', 'USDM', 'USDS', 'PYUSD'],
  base: ['USDC', 'USDT0', 'PYUSD'],
  mantle: ['USDC', 'USDT0', 'mUSD'],
  plasma: ['USDT0', 'USDe'],
  megaeth: ['USDM'],
}

export const PT_TOKENS = {      // Pendle PT tokens, treated as Tier-1-equivalent
  ethereum: ['PT-sUSDe-*', 'PT-USDe-*', 'PT-srUSDe-*'],   // each maturity, expanded
  plasma: [/* ... */],
}

export const ETHENA_WALLETS = [
  '0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c',
  '0xafbb1a7e9ddef38d9bc4a220e702b18dacaa2a62',
  '0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4',
  '0x2bf5d9a2326ad3c5ef8208f91af79c3ca1f0f67c',
  '0x6cd57b9a87c96421cfd7bc2b2f940c7e89cac4b5',
  '0xc7a455f687d1ed5d4d7edcc7563488c7e573d548',
  '0xe3490297a08d6fc8da46edb7b6142e4f461b62d3',
  '0xf270a1d7c68002da1ec8359f3958d4ec015729de',
  '0x1c3b25019ed4e4876e7af7903cc3e1e23287c337',
  '0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5',
  '0x3feaa7483fcfba130e68b41369dd78ff30465459',
]
```

Token addresses sourced from `aave-dao/aave-address-book` where available, with chain-specific overrides for non-Aave assets (PT tokens, USDT0, USDM, mUSD).

## Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Matches `incentive-engine`, `gho-lm-dashboard` |
| Hosting | Vercel | Same |
| Web3 | viem 2.x + Alchemy RPCs | Phase 2 only (live refresh fallback) |
| Cache | React Query | Session-level only; API is the persistent cache |
| UI | shadcn/ui + Tailwind CSS | Fastest path to Yuzu visual parity |
| Charts | Recharts (donut + bars) | Dependency-light |
| Validation | zod | Stack standard |
| Font | JetBrains Mono | Free, near-Berkeley aesthetic |
| Colors | bg `#0a0a0a`, accent `#f5cc4c`, success `#10b981`, recursion `#ef4444`, PT-tag `#f59e0b` | Matches Yuzu palette |

## Repository layout (proposed)

```
ethena-flow-monitor/
|-- app/                            # Next.js routes
|   |-- page.tsx                    # View A
|   `-- reserve/[chain]/[asset]/    # View B
|-- lib/
|   |-- aave/                       # Aave reads (viem multicall, subgraph queries)
|   |-- morpho/                     # Morpho GraphQL client
|   |-- tokenlogic/                 # TokenLogic API client
|   |-- recursion/                  # Score computation
|   `-- ethena/                     # Wallet list + tier classification
|-- config/
|   `-- tokens.config.ts
|-- components/                     # shadcn-based UI
`-- docs/superpowers/specs/         # this spec lives here
```

## Out of scope (Phase 2)

- Time-series view of Ethena's footprint over time
- Alerts on recursion-score spikes or Ethena exit events
- Custodian -> exchange -> Aave attribution flow for USDe backing
- Mutating Ethena wallet list at runtime (config file only for Phase 1)

## Open questions / risks

1. **Discovery-endpoint inconsistency.** `/internal/aave/user-positions/chains` and `/internal/aave/user-positions/markets` currently return only a subset (omitting Ethereum, Base, Mantle, MegaETH) even though those markets *are* queryable directly via `?market_key=`. We hardcode the 5 market_keys we care about and bypass discovery. Flag for Martin to align.
2. **Schema deviations from API docs.** Live data shows: `supply_reserve_symbols` is an *array* (docs say comma-separated string); `supply_reserve_amount` and `supply_reserve_amount_usd` are *scalar-or-array* depending on cardinality; date fields are wrapped in `{value: "YYYY-MM-DD"}` (BigQuery raw shape). Implementation normalises via zod with discriminated unions. Flag for Martin to update docs.
3. **Pendle PT maturity rollover.** When a PT matures and is replaced, the new PT address must enter `PT_TOKENS` config quickly to avoid undercounting recursion. Treat as a doc-level operational runbook entry.
4. **Morpho vault → underlying market drilling.** Verify the GraphQL `vaultByAddress.allocation` field gives per-market $ exposure as expected during implementation.

**Resolved during design (kept for trail):**
- *MegaETH provenance:* Confirmed canonical Aave V3 (`megaeth-core-v3` market_key returns user-positions data on 2026-05-06).
- *Plasma data source:* Replaced by the user-positions API (`plasma-core-v3` market_key returns 46 Tier-1-collateralised borrow rows on 2026-05-06).
