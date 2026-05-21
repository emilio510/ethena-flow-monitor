# Ethena Flow Monitor

A live dashboard tracking how much of Ethena Labs' collateral stack is being levered through DeFi lending markets — Aave V3, Morpho Blue, Kamino and Jupiter Lend, across six chains.

**Live:** https://ethena-flow-monitor.vercel.app

## The question this answers

Ethena issues USDe / sUSDe / USDtb. Some of that supply gets deployed as collateral on Aave or Morpho, where users borrow against it (USDC, USDT, PYUSD, etc.) and recycle the borrowed stables back into more Ethena collateral. That's a recursive loop.

The dashboard answers two related questions at a glance:

1. **How much of each lending reserve's borrows are actually backed by Ethena-stack collateral?** (per-market recursion score)
2. **What share of Ethena's total backing is currently tied up in recursive loops?** (the headline "true recursion" figure)

## What it shows

### View A — Footprint (`/`)

The home page. One row per (chain, protocol, reserve/vault) where any of the 11 monitored Ethena wallets has a position, sorted by USD supplied.

**KPI strip:**

| KPI                   | Definition                                                |
|-----------------------|-----------------------------------------------------------|
| Deployed in lending   | Sum of Ethena's supply positions across Aave + Morpho     |
| Idle backing          | On-chain stablecoin balances sitting in the 11 wallets    |
| Total backing         | Deployed + idle                                           |
| **True recursion**    | Recursive USD ÷ total backing — the headline figure       |
| Recursion (deployed)  | $-weighted recursion across deployed positions only       |
| Chains active         | Distinct chains touched                                   |
| Reserves touched      | Distinct (market, reserve) pairs                          |
| Borrow anomalies      | Unexpected borrow positions from supply-only wallets      |

**Footprint table** — clickable rows route to View B (Aave) or the vault drilldown (Morpho).

**Idle backing table** — per-token aggregate of the wallets' non-deployed stablecoin holdings. Matches Debank's bundle view.

### View B — Aave reserve drilldown (`/reserve/{chain}/{asset}`)

Walks every borrower in the market and computes the share of borrows collateralised by Ethena-stack assets. Three tabs:

- **Top depositors** — ranked, Ethena wallets badged.
- **Top borrowers** — each row shows the user's full position as a stacked bar (supplies left, borrows right, coloured by token bucket).
- **Used as collateral** — borrowers whose collateral mix includes Ethena-stack assets.

A donut + breakdown table splits borrows by collateral symbol (USDe / sUSDe / USDtb / PT-* / USDC / etc.).

### Vault drilldown (`/vault/{chain}/{address}`)

Per-Morpho-vault view: TVL, Ethena's share, recursion score, market allocation table, depositors list. Works for both Morpho V1 (legacy MetaMorpho) and V2 vaults — V2 routes are resolved by following each adapter through to its underlying V1 vault and synthesising a unified allocation.

## The math

### Per-Aave-reserve recursion score

```
recursion_score = ethena_supply_share × ethena_collateral_borrow_share
```

- `ethena_supply_share` = $ supplied by Ethena wallets ÷ total reserve supply
- `ethena_collateral_borrow_share` = $ borrowed against Ethena-stack collateral ÷ total borrows

Borrowers with multi-collateral positions are attributed pro-rata by USD value.

### Per-Morpho-vault recursion

Idle liquidity is excluded — only borrowed money in markets backed by Ethena-stack collateral counts.

```
vault_recursion_share = Σ(allocation_i × utilization_i × is_recursive_i) ÷ vault_TVL
```

Where `utilization_i = market.borrowed ÷ market.supplied`.

### True recursion (View A headline)

```
true_recursion = (weighted_recursion × deployed_USD) ÷ (deployed_USD + idle_USD)
```

This is the share of Ethena's *entire* backing that is sitting in a recursive loop, not just the share of deployed-in-lending money.

### Ethena-stack classification

- **TIER_1**: USDe, sUSDe, USDtb, sUSDtb (Ethena-issued)
- **PT-***: any Pendle Principal Token wrapping a TIER_1 asset (regex `^PT-.+-\d{1,2}[A-Z]{3}\d{4}$`)
- **TIER_2**: USDC, USDT, USDT0, USDM, USDm, USDS, PYUSD, mUSD (counterpart stables)

A market is "recursive" when either its collateral or its loan asset is in TIER_1 or PT.

## Coverage

- **11 Ethena wallets** (`config/wallets.ts`).
- **5 chains**: Ethereum, Base, Mantle, Plasma, MegaETH.
- **Aave V3** — all 5 chains.
- **Morpho Blue** — Ethereum and Base. Both V1 (MetaMorpho) and V2 vaults. V2 adapters chain through to underlying V1 vaults transparently.
- **Idle balances** — Ethereum mainnet (validated to match Debank's bundle total). The dashboard probed the other four chains and the wallets hold ≈$0 of trusted stables there.

### Not tracked: ~13% off-chain (CEX-delegated) backing

Ethena's backing splits roughly **~87% on-chain / ~13% delegated to centralised exchanges**. The CEX portion sits at Binance, Bybit, Coinbase International, Deribit, OKX, Bitget as collateral for the perp shorts that earn the funding-rate spread (the delta-neutral basis trade) and is **not visible on-chain**. View A surfaces a footnote linking to [`app.ethena.fi/dashboards/transparency`](https://app.ethena.fi/dashboards/transparency) for the full notional including that slice. We attempted a direct Ethena-API integration earlier; their CDN blocks Vercel's serverless egress IPs, so the dashboard takes the honest-disclaimer path instead.

## Data sources

| Source                                     | What for                                                              |
|--------------------------------------------|-----------------------------------------------------------------------|
| TokenLogic API (`api.tokenlogic.xyz`)      | Aave V3 user positions (`/internal/aave/user-positions/latest`) and reserve aggregates (`/v1/aave/markets/latest`) |
| Morpho Blue GraphQL (`blue-api.morpho.org`) | Vault positions, vault detail, V2 adapter resolution                  |
| Alchemy RPC (`*.g.alchemy.com`)            | On-chain `balanceOf` multicalls for idle wallet balances; `convertToAssets` for sUSDe/sUSDtb |

No paid data services beyond TokenLogic and Alchemy. Token prices are pegged 1:1 USD for stables (sUSDe and sUSDtb get unwrapped via ERC4626 `convertToAssets` to capture accrued yield).

## Architecture

- **Next.js 16** (App Router) + TypeScript + Tailwind 4
- **Server components** — all data fetching happens server-side per route render. No client-side data layer.
- **1-hour ISR** (`revalidate = 3600`) — first user after expiry triggers the cold render in the background; everyone else gets cached HTML in ~50ms.
- **`loading.tsx` skeletons** per route — the unlucky cold-render visitor sees a structural placeholder instead of a frozen page.
- **Stale-while-revalidate** — the "Updated X ago" pill in the header reflects when *this* route's cache was last filled (different routes have different cache ages).
- **Recharts** for donut charts.
- **viem** for on-chain reads (Multicall3 batching across the 5 chains via Alchemy).
- **Vitest** for unit tests (37 tests, schema validation + math + classifier).

## Local development

```bash
cp .env.example .env.local
# Fill in:
#   TOKENLOGIC_API_KEY — must have /internal/aave/* permission
#   ALCHEMY_KEY        — any tier; only multicall reads + RPC

pnpm install
pnpm dev
```

Tests:

```bash
pnpm test
```

Type check:

```bash
pnpm exec tsc --noEmit
```

## Project structure

```
app/
  page.tsx                              View A (footprint home)
  loading.tsx                           Skeleton fallback
  reserve/[chain]/[asset]/page.tsx      View B (Aave drilldown)
  vault/[chain]/[address]/page.tsx      Morpho vault drilldown
components/
  footprint-table.tsx                   View A row table
  idle-backing-table.tsx                Idle wallet balances aggregate
  data-age.tsx                          Live "Updated X ago" pill
  recursion-panel.tsx                   View B donut + breakdown
  reserve-tabs.tsx                      Depositors / borrowers / collateral
  vault-allocation-panel.tsx            Vault drilldown allocation table
  ...
config/
  wallets.ts                            11 Ethena wallet allowlist
  markets.ts                            5 Aave V3 markets (chain → marketKey)
  tokens.ts                             Symbol-tier classifiers
  idle-tokens.ts                        Per-chain stablecoin address whitelist
  env.ts                                Zod-validated env schema
lib/
  tokenlogic/                           Aave data adapters
    client.ts, positions.ts, markets.ts, schemas.ts
  morpho/                               Morpho data adapters
    client.ts, positions.ts             (V1 + V2 vault resolution)
  onchain/                              On-chain idle balance fetcher
    clients.ts, balances.ts
  recursion/                            Math
    classify.ts                         Symbol → bucket
    attribute.ts                        Multi-collateral pro-rata
    score.ts                            Per-reserve recursion score
  views/                                Page-level data composition
    footprint.ts                        loadFootprint() — View A
    reserve.ts                          loadReserveView() — View B
    vault.ts                            loadVaultView() — vault drilldown
tests/                                  Vitest specs (37 tests)
```

## Performance notes

The dashboard runs on Vercel's Hobby tier (10s function cap). Two concessions:

- **Aave borrower walks are sampled** to one page (10k borrowers per market). For large markets (Ethereum, Base) the recursion score becomes a sample — surfaced as `*` next to the percentage.
- **Cold-load on cache miss is 8-15s** for View A. The 1h ISR + stale-while-revalidate hides this from all but one visitor per hour per route.

If we ever upgrade to Pro, removing the sample cap and adding a Vercel Cron warmer would eliminate both compromises.

## Known limits

- **TokenLogic indexer staleness on MegaETH** — at the time of writing, 39 orphan USDm borrowers are missing supply data, which slightly understates recursion on the USDm reserve. The data team is working on it.
- **MegaETH chainId mismatch** — TokenLogic indexes the chain at chainId 6342; Alchemy's `megaeth-mainnet` endpoint returns 4326 (likely a different MegaETH variant). The dashboard avoids this conflict by only doing on-chain reads on the chains where it's needed (idle balances are entirely on Ethereum).
- **Idle balance scope** — Ethereum-only by design. The other four chains were probed and hold ~$0 of the curated stables; if that ever changes the per-chain entry in `config/idle-tokens.ts` can be repopulated.
- **TokenLogic schema drift** — TL has shipped silent type changes on the user-positions and markets endpoints (e.g. number → comma-separated string, `lastUpdated` flipping to `null`). The zod parsers in `lib/tokenlogic/` use permissive helpers (`numericLike`, `NumberArrayOrCsv`) that accept multiple encodings. **Read [`docs/tokenlogic-api.md`](docs/tokenlogic-api.md) before adding new endpoint calls** and prefer the same pattern over bare `z.number()`.

## Validation

The dashboard's idle-backing total has been cross-checked against the Debank "Wallet" bundle view for the 11 wallets — the two figures match within rounding when the dashboard's curated stablecoin list is in sync with what the wallets actually hold.

The recursion math has been hand-verified end-to-end for a handful of representative cases (notably Sentora PYUSD Core V2: 80.17% on the dashboard, 80.17% from a standalone live API replay).

## License

Internal TokenLogic project.
