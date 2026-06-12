# On-chain Solana wallet balance tracking — Design

Date: 2026-06-12
Status: Approved (pending implementation plan)

## Problem

The dashboard independently verifies Ethena's self-reported backing by reading
actual balances **on-chain** for EVM wallets (`config/wallets.ts` →
`lib/onchain/balances.ts` → reconciliation). The Solana side does **no on-chain
reads**: it takes Ethena's snapshot dollar value by counterparty *name*
("Kamino" / "Jupiter") and enriches it with protocol REST APIs.

Two public Ethena Solana addresses are therefore untracked on-chain:

| Address | Snapshot location | Status today |
|---|---|---|
| `C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L` | `DeFi Lending` → Kamino (Sentora) + Jupiter (Bitwise) | Dollars already flow into the footprint via counterparty-name match, but the address is never read on-chain and never shown as an address. |
| `4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN` | `RWA` → JAAA (~$200M) | **Completely dropped.** `extractSolanaLegs` only handles `"DeFi Lending"` + Kamino/Jupiter, so the RWA Solana leg never appears. |

## Goal

Read **actual SPL token balances** at the two addresses and feed them into the
existing **reconciliation** "on-chain verified" side, mirroring the EVM
idle-balance pipeline. This:

- makes the Solana USDG/PYUSD figures genuinely independent of Ethena's snapshot, and
- surfaces the dropped **JAAA (~$200M RWA)** leg so it reconciles instead of reading as a 100% gap.

Scope is reconciliation + monitored-wallet inventory. **No new UI page.**

## Key decisions (locked during brainstorming)

1. **Transport:** raw Solana JSON-RPC via `fetch` against Alchemy
   `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`. **No new
   dependency** (no `@solana/web3.js`) — matches the house style (Kamino/Fluid/
   Ethena are all raw `fetch`). The pasted Solana key is the **same** value as
   the existing `ALCHEMY_KEY`, so this is a path swap with **no new env var**.
2. **Valuation:** stables (USDG, PYUSD, USDC, USDe) hard-pegged 1:1; non-stable
   tokens (JAAA, and any future ones) priced via the **Jupiter price API**
   (`lite-api.jup.ag/price`). Fully independent of Ethena's snapshot.

## Correctness invariants

- **Double-count guard.** When a Solana address *supplies* USDG into
  Kamino/Jupiter, the wallet holds **vault-share tokens** (kTokens / jleUSDG
  receipts), not raw USDG — the underlying sits in the protocol. A raw-mint
  idle read therefore naturally excludes deployed amounts and will not
  double-count against the protocol-API footprint rows. The curated mint
  registry **includes only base assets** (USDG/PYUSD/USDC/USDe/sUSDe/JAAA) and
  **excludes vault-share mints**. Implementation MUST verify the two addresses'
  actual holdings against this assumption (recorded RPC fixture).
- **Two token programs.** Solana has legacy SPL Token *and* Token-2022. PYUSD on
  Solana is Token-2022, so the reader MUST query **both** program IDs or it will
  silently miss balances.
- **No silent value degradation.** Per house rules, no `?? 0` on value math. A
  missing Jupiter price → the token is **excluded** from totals and a loud
  `console.warn` + `failure` entry is recorded. Never value at 0.

## Components

### New

- **`config/solana-wallets.ts`**
  - `SOLANA_WALLETS` — the two addresses (base58 `as const`).
  - `KNOWN_SOLANA_WALLET_LABELS: Record<string,string>` — `C23FGx…` → "Solana
    DeFi omnibus (Sentora/Bitwise)", `4FaQc6…` → "RWA — JAAA (Securitize)".
  - `isSolanaWallet(addr)` helper.
- **`config/solana-idle-tokens.ts`**
  - `SolanaIdleToken { symbol; mint; decimals; peg?: 1 }`.
  - `SOLANA_IDLE_TOKENS` keyed by mint: USDG, PYUSD, USDC, USDe, sUSDe (`peg: 1`)
    + JAAA (priced). JAAA's mint is discovered at impl time by querying the
    wallet's token accounts. Excludes vault-share mints (see invariant).
- **`lib/solana/rpc.ts`** — Solana JSON-RPC helper. `getTokenAccountsByOwner`
  (`encoding: jsonParsed`) per (owner, programId) across both token programs.
  Reuses `SolanaApiError` / `SolanaTimeoutError` from `lib/solana/client.ts`.
  `server-only`.
- **`lib/solana/prices.ts`** — Jupiter price client. `fetchSolanaPrices(mints)`
  → zod-validated `Map<mint, number>`. Stables short-circuit to 1:1 before any
  network call. `server-only`.
- **`lib/solana/balances.ts`** — `getEthenaSolanaIdleBalances()`:
  1. For each `SOLANA_WALLETS` entry, fetch token accounts across both programs.
  2. Filter to `SOLANA_IDLE_TOKENS`; sum raw amount per mint.
  3. Value: stable → `amount × 1`; else `amount × jupiterPrice(mint)`; missing
     price → exclude + record failure.
  4. Aggregate per symbol → `IdleBalanceRow[]` (reuse the existing type), plus
     per-wallet USD (`walletIdleUsd`-shaped) and `failures`.
  `server-only`. Partial-data tolerant via `Promise.allSettled`.

### Modified

- **`lib/views/footprint.ts` (`loadFootprint`)** — call
  `getEthenaSolanaIdleBalances()` in parallel with the existing readers
  (`Promise.allSettled`, like `getEthenaSolanaPositions`). Add the two Solana
  addresses to `WalletInventoryRow[]` (`chain: "solana"`, `apiLabel` from
  snapshot counterparty / known label, `totalUsd` = Solana idle USD). Thread a
  `failedSolanaBalances` field through `FootprintResult`.
- **`lib/views/reconciliation.ts` (`buildReconciliation`)** — merge the Solana
  idle rows into the `idle` argument so they net on the on-chain side by symbol.
  JAAA flips from a structural gap to verified within tolerance; USDG/PYUSD
  on-chain side becomes independent. (JAAA is **removed** from `OFF_CHAIN` if it
  was implicitly there — confirm it is not currently listed.)

## Error handling

- Solana RPC failure (timeout / non-200) → `SolanaApiError`/`SolanaTimeoutError`,
  caught at `loadFootprint`, recorded in `failedSolanaBalances`, never blanks EVM
  data.
- Jupiter price failure → per-mint exclusion + loud warn + failure entry.
- All consistent with the existing `failed` / `failures` partial-tolerance
  patterns.

## Testing (TDD) — new `tests/solana/`

- **balances.test.ts** — parse a recorded `getTokenAccountsByOwner` jsonParsed
  fixture covering both token programs; correct per-mint summation; vault-share
  mints excluded; valuation (peg vs Jupiter price); failure paths (RPC down,
  price missing → token excluded, not zeroed).
- **prices.test.ts** — stables short-circuit (no network); Jupiter response
  parsing; missing-mint handling.
- **reconciliation** — extend existing coverage: JAAA nets on-chain and the gap
  closes within tolerance; no double-count of USDG/PYUSD against protocol rows.

## Infra

- Reuses `ALCHEMY_KEY` (Alchemy Solana endpoint) — **no new secret**, no Vercel
  env change. Jupiter price API is keyless.
- Reads run live at ISR time (idle reads are not snapshotted) — **no change to
  `scripts/refresh-flows.ts`**.

## Out of scope

- A dedicated Solana wallet drilldown page.
- On-chain reading of *deployed* Solana positions (already covered by the
  protocol-API footprint rows).
- Backfilling historical Solana balances.
