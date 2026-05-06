# Ethena Flow Monitor

Dashboard for monitoring Ethena's recursive-loop exposure on Aave V3 across Ethereum, Base, Mantle, Plasma, and MegaETH.

## What it shows

- **View A** (`/`) — every Aave reserve where the 11 monitored Ethena wallets have a position, ranked by USD size and concentration share.
- **View B** (`/reserve/{chain}/{asset}`) — per-reserve drill-down: top depositors (Ethena badged), concentration KPIs, and a recursion panel that splits borrows by collateral type and surfaces the headline `% of borrows are recursive Ethena loops` figure.

## Recursion score

```
recursion_score = ethena_supply_share × ethena_collateral_borrow_share
```

- `ethena_supply_share` = $ supplied by Ethena wallets / total reserve supply
- `ethena_collateral_borrow_share` = $ borrowed against Ethena-stack collateral (USDe / sUSDe / USDtb / sUSDtb / PT-*) / total borrows

Multi-collateral users are attributed pro-rata by USD value.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind 4
- Recharts for the borrow donut
- Vitest for unit tests
- Single data source: TokenLogic internal user-positions API (`/internal/aave/user-positions/latest`) + reserve aggregates (`/v1/aave/markets/latest`)

## Local dev

```bash
cp .env.example .env.local
# fill in TOKENLOGIC_API_KEY (must have internal.api permission)
pnpm install
pnpm dev
```

Tests:

```bash
pnpm test
```

## Configuration

- `config/wallets.ts` — 11 Ethena addresses (allowlist).
- `config/markets.ts` — 5 Aave V3 markets (Ethereum, Base, Mantle, Plasma, MegaETH).
- `config/tokens.ts` — TIER_1 (Ethena-issued) / TIER_2 (backing) symbol classifiers + PT-* regex.

When Pendle PTs roll, the regex (`^PT-.+-\d{1,2}[A-Z]{3}\d{4}$`) auto-matches new maturities — no config change needed unless a non-standard naming appears.

## Deferred (Phase 2)

- Morpho Blue integration (Ethereum + Base)
- Attribution-rule UI toggle (any-Tier-1 alternative)
- Live `viem` refresh fallback when daily BigQuery cadence isn't enough
- Time-series view, alert rules

## Spec & plan

- Design spec: `docs/superpowers/specs/2026-05-06-ethena-flow-monitor-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-06-ethena-flow-monitor.md`
