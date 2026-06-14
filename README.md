# Ethena Flow Monitor

An independent, on-chain verification dashboard for **Ethena's USDe backing**. It answers one question a treasury team actually cares about:

> **Can we independently verify, from chain data, that the assets backing USDe really exist — and how much of that backing is levered in recursive DeFi loops?**

It does this without trusting Ethena's own numbers: every figure on the headline is reconstructed from on-chain reads, then *reconciled against* Ethena's reported backing so any discrepancy is visible and explained rather than hidden.

**Live:** https://ethena-flow-monitor.vercel.app

---

## 1. What it does, in one paragraph

Ethena issues USDe / sUSDe / USDtb against a multi-asset reserve. Some of that reserve sits idle in wallets, some is supplied into lending markets (Aave, Morpho, Kamino, Jupiter Lend), some is in tokenized RWAs (JAAA, STAC), and a slice is delegated off-chain to exchanges as margin for the delta-neutral hedge. This dashboard walks all the **on-chain** pieces wallet-by-wallet, sums them into an independently-verified backing figure, compares it both to **Ethena's reported backing** (per-asset reconciliation) and to the **live on-chain USDe circulating supply**, and separately scores how much of that backing is tied up in **recursive lending loops** (USDe → collateral → borrow stables → buy more USDe).

The headline number is **our number**, not Ethena's: `on-chain verified backing + the one off-chain slice only a custodian can attest`.

---

## 2. The headline (View A — `/`)

```
Total backing  =  on-chain verified  +  off-chain custodial
               =  (deployed in lending + idle balances + RWA)  +  (Copper / BTC-anchored, from Ethena's snapshot)
```

- **On-chain verified** — everything we read ourselves: Aave/Morpho supplies, Kamino/Jupiter Lend positions, idle stables, Solana RWAs, XRPL RLUSD.
- **Off-chain custodial** — the BTC/ETH/RLUSD margin held at custodians (Copper et al.). Not readable on-chain, so it is taken from Ethena's snapshot and clearly labelled as the *only* non-independently-verified component.

Alongside the headline:

| Element | Meaning |
|---|---|
| **vs $X USDe circulating supply** | Live on-chain `totalSupply` of USDe (mainnet OFT = global supply). The honest denominator. |
| **covers Y%** | `ourTotalBacking ÷ usdeSupply` — how close our independently-verified backing comes to the coins actually in circulation. |
| **Ethena reports $Z** | Ethena's own reported total, shown for reference only. |
| **Recursive exposure** (hero meter) | `recursiveUsd ÷ USDe supply` — the share of all circulating USDe that is sitting in a recursive loop. |

**KPI strip:** Custodial / off-chain · Deployed in lending · Idle backing · Non-recursive backing.

---

## 3. The panels below the headline

| Panel | Component | What it shows |
|---|---|---|
| **Footprint table** | `footprint-table.tsx` | One row per (chain, protocol, reserve/vault) where a monitored wallet has a *deployed* position. Clickable → Aave reserve drilldown or Morpho/Solana vault drilldown. Columns: Chain · Protocol · Reserve/Vault · Ethena Supplied · Share · Recursion. |
| **Idle backing** | `token-balance-table.tsx` | Per-token aggregate of non-deployed stablecoin balances across the wallets. |
| **Reserve fund** | `token-balance-table.tsx` | The insurance wallet's holdings, shown for completeness but **excluded from every backing total** (Ethena excludes it too). |
| **Per-asset reconciliation** | `reconciliation-panel.tsx` | Ethena-reported vs our on-chain read, per asset, with the gap and a verified/gap status. This is the trust anchor — see §6. |
| **Monitored wallets — source of truth** | `monitored-wallets-table.tsx` | Every address the dashboard treats as Ethena's, with full (untruncated) addresses, role (backing vs reserve fund), and the label Ethena discloses each under. Total is **backing-only**; the reserve fund is shown as a separate sub-line. |
| **Untracked holdings — needs triage** | (alert-only) | Any EVM token position >$1M on a monitored wallet that is *not* in the curated allowlist. Never counted in backing; flagged so a stale allowlist can't silently understate backing. |
| **Recent flows** | `flows-table.tsx` | Outflows ≥ $1M over the last 90 days, classified (redeem / rebalance / external), paginated, with Etherscan/XRPL explorer links on every address and tx. |

### Drilldowns

- **Aave reserve** (`/reserve/{chain}/{asset}`) — walks every borrower in the market, computes the share of borrows collateralised by Ethena-stack assets, and splits it in a donut by collateral symbol. Tabs: Top depositors · Top borrowers (stacked supply/borrow bars) · Used as collateral.
- **Morpho vault** (`/vault/{chain}/{address}`) — TVL, Ethena's share, recursion score, per-market allocation, depositors. Handles both V1 (MetaMorpho) and V2 vaults (V2 adapters are followed through to their underlying V1 vaults and re-synthesised into one allocation).
- **Solana vault** — Kamino kvaults and Jupiter Lend positions, with composition breakdown.

---

## 4. Coverage (what's monitored)

- **11 Ethena backing wallets** + **1 reserve-fund wallet** (`config/wallets.ts`).
- **2 Solana wallets** (`config/solana-wallets.ts`) — positions auto-discovered, see §5.
- **5 XRPL addresses** (`config/xrpl.ts`) — RLUSD.
- **EVM chains:** Ethereum, Base, Mantle, Plasma, MegaETH.
- **Protocols:** Aave V3 (all EVM chains) · Morpho Blue (Ethereum + Base, V1 & V2) · Kamino + Jupiter Lend (Solana) · tokenized RWAs (JAAA, STAC on Solana/Base).

---

## 5. How the data is gathered ("how it does it")

### 5.1 On-chain reads (the verified core)

All page data is fetched **server-side per render** — there is no client data layer. EVM reads go through Alchemy via viem Multicall3 batching. sUSDe / sUSDtb are unwrapped via ERC4626 `convertToAssets` so accrued yield is captured; other stables are pegged 1:1.

### 5.2 Independent USDe supply read

`lib/onchain/usde-supply.ts` reads USDe `totalSupply` on mainnet directly. USDe is a lock-release LayerZero OFT, so mainnet `totalSupply` **is** the global circulating supply (validated against DefiLlama — do *not* sum per-chain balances). Returns `null` on read failure, never `0`, so a failed read degrades loudly instead of silently zeroing the denominator.

### 5.3 Solana auto-discovery

Rather than hardcode Solana positions (which go stale), `lib/solana/` discovers them: `getTokenAccountsByOwner` across **both** the SPL Token and Token-2022 programs, then values each mint via Alchemy Prices (by-address and by-symbol), DAS `getAsset`, and Jupiter's price API. Known mints are classified in `config/solana-known-mints.ts` (deployed / peg / RWA). This is how STAC, JAAA, Kamino and Jupiter Lend positions are picked up without a manual edit each time Ethena rotates.

### 5.4 Ethena snapshot (custodial + reconciliation source)

The page needs Ethena's reported figures for two things only: the **off-chain custodial slice** (which is genuinely unreadable on-chain) and the **per-asset reconciliation** target. Ethena's API cannot be fetched from Vercel — their Cloudflare anti-bot layer blocks serverless egress IPs. So:

- Production reads a **committed snapshot**, `data/ethena-snapshot.json`.
- A local **launchd cron** (`scripts/com.ethena-flow.refresh.plist` → `scripts/refresh-and-push.sh`) refreshes it daily: it runs `node --experimental-strip-types scripts/refresh-ethena-snapshot.ts` (NOT `npx tsx` — that crashes on Node 25 with an esbuild `TransformError`), then commits and pushes so Vercel redeploys with fresh data.
- The flows file (`data/ethena-flows.json`) refreshes the same way via `scripts/refresh-flows.ts`.

Because the snapshot is daily and the on-chain reads are live, the two can diverge for fast-moving assets — which the reconciliation panel surfaces honestly rather than papering over (see §6).

### 5.5 Data sources

| Source | Used for |
|---|---|
| TokenLogic API (`api.tokenlogic.xyz`) | Aave V3 user positions + reserve aggregates. See [`docs/tokenlogic-api.md`](docs/tokenlogic-api.md) before touching `lib/tokenlogic/`. |
| Morpho Blue GraphQL (`blue-api.morpho.org`) | Vault positions, vault detail, V2 adapter resolution |
| Alchemy RPC + Prices (`*.g.alchemy.com`) | EVM `balanceOf` multicalls, ERC4626 unwraps, USDe supply, Solana RPC, token pricing |
| Solana DAS + Jupiter price API | Solana asset metadata + pricing fallback |
| Ethena transparency snapshot | Custodial slice + reconciliation target (committed, not live) |

---

## 6. The reconciliation — and what it has already taught us

The per-asset reconciliation (`lib/views/reconciliation.ts`) is the whole point: it puts Ethena's reported number next to our independent on-chain read for each asset, so any gap is named. Two non-obvious findings the team should know:

**(a) Ethena's API under-reports backing by ~$100M.** Two real positions are missing from their reported figures but captured by us:
- **Maple** ($50M) — their "Maple Institutional" line reads $0.
- **Morpho Steakhouse High-Yield USDC** ($50M) — their Morpho USDC figure counts only the *Prime* vault.

Adding these back to Ethena's reported total moves it from ~$4.38B to ~$4.48B, i.e. essentially the full USDe supply.

**(b) The residual ~$84M USDT/USDC gap to full supply is in-transit, not missing.** We chased it to ground:
- Every candidate address is already tracked; the disclosed custodial bucket holds only RLUSD/BTC/ETH; and the footprint already counts Aave-supplied USDT (held as `aEthUSDT`) back as USDT.
- On-chain tracing shows the "missing" USDT leaves the disclosed treasury wallets and **cycles through the delta-neutral settlement pipeline** — Aave supply, market-maker fan-out into dozens of $5–12M deposit addresses, and exchange margin. It is never parked at a static, monitorable location; the set of holding addresses changes daily.
- **Conclusion:** the gap is a **snapshot-lag / in-transit artifact**, not a missing wallet. Ethena's daily snapshot still attributes the USDT to disclosed addresses; by our live read-time it has moved. Our on-chain number is the *more current* figure. Chasing it to a wallet list is futile — the list goes stale the same day.

Net: independently-verified on-chain backing reconciles to **within ~$84–100M of the full USDe circulating supply**, and every remaining dollar of that gap is explained.

> **Recurring failure mode for reviewers:** hardcoded lists (deny-lists, address sets, snapshots) go stale and silently understate backing. Prefer auto-discovery + alert-on-untracked (§3) over hardcoding, and never apply a silent `?? 0` to a value input — return `null` and render "missing", or default loudly.

---

## 7. The recursion math

### Per-Aave-reserve recursion score
```
recursion_score = ethena_supply_share × ethena_collateral_borrow_share
ethena_supply_share            = $ supplied by Ethena wallets ÷ total reserve supply
ethena_collateral_borrow_share = $ borrowed against Ethena-stack collateral ÷ total attributed borrows
```
Multi-collateral borrowers are attributed pro-rata by USD (`lib/recursion/attribute.ts`).

### Per-Morpho-vault recursion
```
vault_recursion_share = Σ(allocation_i × utilization_i × is_recursive_i) ÷ vault_TVL
```
Idle vault liquidity is excluded — only borrowed money in recursive markets counts.

### Ethena-stack classification (`lib/recursion/classify.ts`)
- **TIER_1:** USDe, sUSDe, USDtb, sUSDtb (Ethena-issued)
- **PT-\*:** any Pendle Principal Token wrapping a TIER_1 asset (`^PT-.+-\d{1,2}[A-Z]{3}\d{4}$`)
- **TIER_2:** USDC, USDT, USDT0, USDM/USDm, USDS, PYUSD, mUSD (counterpart stables)

A market is "recursive" when its collateral or loan asset is TIER_1 or PT.

---

## 8. Architecture & stack

- **Next.js 16** (App Router) + TypeScript + **Tailwind 4**. ⚠️ This Next version has breaking changes vs training data — read `node_modules/next/dist/docs/` and `AGENTS.md` before writing framework code.
- **Server components only** — all fetching happens server-side per route render.
- **ISR `revalidate = 300`** (5 min) + `maxDuration = 90` — keeps the cache warm under traffic while letting a transient bad render heal within minutes. `loading.tsx` skeletons cover cold renders.
- **Design system:** refractive liquid glass (monochrome + cyan accent) via `components/ui/` (`glass-card`, `refractive-glass`, `hero-meter`).
- **recharts** for donuts; **viem** for on-chain reads; **zod** parsing pushed to the data boundary so pages receive fully-typed values.
- **Vitest** — **233 tests** (schema validation, recursion math, classifier, view composition).

---

## 9. Local development

```bash
cp .env.example .env.local
# Fill in:
#   TOKENLOGIC_API_KEY — needs /internal/aave/* permission
#   ALCHEMY_KEY        — any tier (multicall reads, prices, Solana RPC)

pnpm install
pnpm dev          # next dev --turbopack

pnpm test         # vitest run (233 tests)
pnpm exec tsc --noEmit
pnpm build        # always run before pushing 'use server' / framework changes
```

### Refreshing the committed data (snapshot + flows)
```bash
# Snapshot (custodial + reconciliation). Use node --experimental-strip-types, NOT tsx:
node --experimental-strip-types scripts/refresh-ethena-snapshot.ts

# Flows:
pnpm refresh:flows           # tsx --env-file=.env.local scripts/refresh-flows.ts

# Or the all-in-one the launchd cron runs (refresh + commit + push):
scripts/refresh-and-push.sh
```

---

## 10. Project structure

```
app/
  page.tsx                     View A (headline + all panels)
  reserve/[chain]/[asset]/     Aave reserve drilldown
  vault/[chain]/[address]/     Morpho / Solana vault drilldown
  loading.tsx, error.tsx, layout.tsx, globals.css

lib/
  ethena/        Ethena snapshot client, schemas, backing/custodial helpers, attribution
  onchain/       balances, clients, prices, usde-supply, reserve-fund, untracked-audit, xrpl
  solana/        rpc, balances, das, prices, kamino, fluid, positions (auto-discovery)
  tokenlogic/    Aave adapters (client, positions, markets, permissive zod schemas)
  morpho/        Morpho Blue adapters (V1 + V2 resolution)
  flows/         flow scan, classify, store, evm/xrpl flow builders
  recursion/     classify · attribute · score
  views/         footprint · reserve · vault · solana-vault · reconciliation (page composition)

config/
  wallets.ts            11 Ethena wallets + reserve-fund wallet + known labels
  solana-wallets.ts     Solana wallets
  solana-known-mints.ts deployed / peg / RWA mint classification
  xrpl.ts               XRPL addresses (RLUSD)
  markets.ts            5 Aave V3 markets + CHAINS
  tokens.ts             tier classifiers
  idle-tokens.ts        per-chain stablecoin allowlist (+ priceVia)
  reserve-fund.ts       reserve-fund LP definitions
  untracked-audit.ts    untracked-holdings alert config
  env.ts                zod-validated env

components/   tables, panels, icons (chain/asset logos), ui/ (glass design system)
scripts/      refresh-ethena-snapshot · refresh-flows · refresh-and-push.sh · launchd plist · sweeps
data/         ethena-snapshot.json · ethena-flows.json · discovered-wallets.json (committed)
docs/         tokenlogic-api.md + reference JSON + screenshots
```

---

## 11. Known limits

- **Custodial slice is not independently verified** — the off-chain (Copper/exchange) portion of backing comes from Ethena's snapshot, by necessity. It is always labelled as such.
- **Snapshot lag** — `data/ethena-snapshot.json` is daily; live on-chain reads can diverge from it for fast-moving treasury assets (this *is* the §6(b) gap). Refresh runs from a local cron, not Vercel.
- **Aave borrower walks are sampled** to one page per market on large markets; sampled recursion scores are flagged with `*`.
- **Two reconciliation totals differ by ~0.5%** — the per-asset reconciliation and the per-wallet "source of truth" total are computed by two different aggregation paths (per-asset with dust-filtering vs per-wallet with the Solana snapshot top-up); the ~$20M residual is an aggregation artifact, left as-is by decision.
- **TokenLogic schema drift** — TL has shipped silent type changes; `lib/tokenlogic/` uses permissive parsers (`numericLike`, `NumberArrayOrCsv`). Read [`docs/tokenlogic-api.md`](docs/tokenlogic-api.md) before adding endpoint calls.

---

## License

Internal TokenLogic project.
