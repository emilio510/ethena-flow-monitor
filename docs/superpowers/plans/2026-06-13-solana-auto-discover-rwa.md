# Solana auto-discovered RWA tracking — Spec + Plan

Date: 2026-06-13
Status: Approved (user chose auto-discover + count-STAC-as-snapshot-lag)

## Problem
The Solana balance reader uses a **hardcoded mint allowlist** (`config/solana-idle-tokens.ts`). It has gone stale three times: USDG→PYUSD rotation on Kamino, and now a brand-new **STAC** position. STAC ("Securitize Tokenized AAA CLO Fund", mint `u49MwZqu4bHRHRsciaBarHK7JZDYGxuaNnwyMBdEKYk`, Token-2022, decimals 6) sits at wallet `4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN` — 244,961.28 units (100% of supply) ≈ **$250M** at NAV **$1,020.44** — and is completely untracked. Ethena's snapshot does NOT report STAC yet (only JAAA $200M Solana + $50M Base).

## Goal
Stop hardcoding RWA mints. **Auto-discover** every token a Solana wallet holds, identify each via the DAS `getAsset` API, and price via the Alchemy Prices **by-symbol** endpoint (which prices STAC and JAAA where by-address/Jupiter return nothing). A small known-mints config remains ONLY for the two cases that need domain knowledge: vault-share/deployed tokens and explicit stable pegs. STAC, JAAA, and any future RWA then track automatically. STAC is counted on-chain and surfaces in reconciliation as "on-chain exceeds reported — snapshot lag".

## Confirmed building blocks (live 2026-06-13)
- DAS `getAsset` (Alchemy Solana RPC, `method: "getAsset"`, `params: {id: mint}`) → `result.content.metadata.{name, symbol}`. For `u49Mw…`: name "Securitize Tokenized AAA CLO Fund", symbol "STAC".
- Alchemy Prices by-symbol: `GET https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/by-symbol?symbols=STAC&symbols=JAAA` → `data[].{symbol, prices[].value}`. STAC $1020.44, JAAA $1.03757. (by-address returns "Price not found" for these Solana mints — by-symbol is the working path.)
- jleUSDG (`Bd2w…`) priced by Jupiter by-address ($1.002); it is a deployed-bucket vault share.

## Design

### Known-mints config — `config/solana-known-mints.ts` (replaces `solana-idle-tokens.ts`)
Small, purposeful overrides for what auto-discovery cannot infer:
```ts
// Vault-share / receipt tokens whose underlying position is already counted by
// a footprint row. DEPLOYED bucket: wallet-inventory total only, never idle/recon.
export const SOLANA_DEPLOYED_MINTS: Record<string, { symbol: string; price: { kind: "jupiter" } }> = {
  Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc: { symbol: "jleUSDG", price: { kind: "jupiter" } },
}
// Stablecoins valued at a hard $1 peg (more robust than a live symbol lookup).
export const SOLANA_PEG_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  // add USDG / PYUSD / USDe Solana mints here as confirmed
}
// Known spam/dust mints to skip outright (optional; the $-dust floor also catches these).
export const SOLANA_DENY_MINTS: Record<string, string> = {
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "sub-dollar dust stable",
}
```

### Identity — `lib/solana/das.ts` (new)
`fetchAssetIdentities(mints: string[]) -> Map<mint, { symbol: string; name: string }>`. One DAS `getAsset` call per mint (small N). `server-only`. Reuses the Solana RPC URL/error classes. A failed/empty identity → mint omitted from the map (caller treats as unidentified).

### Pricing — extend `lib/onchain/prices.ts`
Add `fetchPricesBySymbol(symbols: string[]) -> Map<symbolUpper, number>` hitting the by-symbol endpoint, zod-validated (`data[].symbol`, `data[].prices[].value`). Absent/zero → omitted (never 0). Keep the existing by-address `fetchTokenPrices`.

### Orchestrator — rewrite `lib/solana/balances.ts`
`getEthenaSolanaIdleBalances()`:
1. Per wallet, `getTokenBalancesByOwner` (both token programs) → holdings. Partial-tolerant (`Promise.allSettled`).
2. Drop zero balances and `SOLANA_DENY_MINTS`.
3. Classify each held mint:
   - in `SOLANA_DEPLOYED_MINTS` → **deployed** bucket; price via Jupiter by-address; symbol from the map.
   - in `SOLANA_PEG_MINTS` → **idle** bucket; price = $1; symbol from the map.
   - else → **auto**: identify via DAS (`fetchAssetIdentities`); price via `fetchPricesBySymbol(identity.symbol)`. If identified AND priced → **idle** bucket, `approx: true`. If NOT identified or NOT priced → **exclude** + `console.warn` + push a `failures` entry tagged for triage (so an unknown large holding is loud, never silently $0 or silently valued).
4. Value = `amount × price`. Drop holdings worth < `$1` (dust) AFTER pricing (cannot pre-filter by unit count — STAC is only 244,961 units but ~$250M).
5. Aggregate idle rows per symbol (`IdleBalanceRow[]`, `approx` carried); per-wallet `walletTotalUsd` across all buckets (idle + deployed); `failures[]`.

Batch the DAS calls and the by-symbol price calls (collect all auto-mints/symbols across wallets, one round each).

### No other module changes
`footprint.ts` already folds idle rows + uses `walletTotalUsd` for inventory (shipped). `reconciliation.ts` already handles an ours-only asset (STAC: ethena $0, onchain $250M, gap −$250M, note "On-chain exceeds reported — snapshot lag"). No change needed there — STAC flows through as designed once it's an idle row.

## Safety / correctness invariants
- **No silent zero:** missing price or identity → exclude + warn + failure. Never `?? 0`, never value at 0.
- **No double-count:** deployed-bucket (jleUSDG) stays out of idle/reconciliation; only base/RWA idle assets feed them.
- **Spam resistance:** deny-list + post-pricing `$1` dust floor + only auto-value tokens that are BOTH DAS-identified AND by-symbol-priced; auto-priced rows flagged `approx`.
- **No hardcoded RWA mint:** STAC/JAAA/future RWAs are discovered, not listed. Only vault-shares + stable pegs (domain-knowledge cases) stay in the small known-mints config.

## Tasks (TDD; independent math review before merge)
1. `config/solana-known-mints.ts` — the three maps. Delete/replace `config/solana-idle-tokens.ts` (update any imports). Tests: maps contain jleUSDG (deployed), USDC (peg), 2u1tsz (deny).
2. `lib/solana/das.ts` — `fetchAssetIdentities`. Test: parse a recorded `getAsset` response for STAC → `{symbol:"STAC", name:"Securitize…"}`; unidentified mint → omitted.
3. `lib/onchain/prices.ts` — `fetchPricesBySymbol`. Test: parse by-symbol fixture (STAC $1020.44, JAAA $1.03757); missing symbol omitted; empty input → no fetch.
4. `lib/solana/balances.ts` — rewrite to auto-discovery. Tests (mock rpc/das/prices): STAC (unknown mint) → identified + by-symbol priced → idle row ~$250M, `approx:true`; jleUSDG → deployed (inventory only, not in `rows`); USDC dust → dropped (<$1); an unidentified/unpriced mint with a big balance → excluded + failure + warn (NOT valued). `walletTotalUsd` includes deployed + idle.
5. Reconciliation assertion: with STAC in idle and absent from the snapshot, STAC reconciles as ours-only (gap −$250M, "snapshot lag").
6. Verify — full suite + tsc + build + live smoke (STAC ~$250M appears; JAAA still ~$200M; both via auto-discovery; reconciliation shows STAC snapshot-lag; jleUSDG inventory-only).

## Out of scope
- Auto-discovering EVM RWA (the Base JAAA leg stays via the `priceVia` config already shipped). Revisit if an EVM RWA rotates similarly.
- Persisting/alerting on newly-discovered unidentified holdings beyond the `failures` log (good future follow-up: a "new untracked holding" alert).
