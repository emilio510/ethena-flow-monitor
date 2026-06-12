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
2. **Valuation (amended twice after reconnaissance — see below):**
   - Stables (USDG, PYUSD, USDC, USDe) hard-pegged 1:1.
   - **JAAA priced via the Alchemy Prices API using its Base (EVM) contract** as
     the price proxy: `0x5a0f93d040de44e78f251b03c43be9cf317dcf64` on
     `base-mainnet` → $1.03757 (live). JAAA is the Janus Henderson Anemoy AAA
     CLO fund, tokenized on both Base and Solana at the same NAV; it has a
     market price on Base but none on Solana (Jupiter returns `{}`).
   - **No Jupiter dependency.** After excluding vault-shares and dust, the only
     valued tokens at these two addresses are stables (peg) + JAAA (Alchemy
     proxy price), so the Jupiter price API is not needed.

## Reconnaissance findings (2026-06-12, live Alchemy + Jupiter)

Actual on-chain holdings (`getTokenAccountsByOwner`, both token programs):

| Owner | Mint | Amount | Identity |
|---|---|---|---|
| `C23FGx…` | `Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc` | 250,930,298 (6 dp) | **jleUSDG vault-share token** (= `JUPITER_ETHENA_LENDING_VAULT` in `lib/solana/fluid.ts`). Represents the Jupiter Lend position **already counted** by `buildJupiterRow`. |
| `C23FGx…` | `2u1tsz…` | 0.35 | dust stable |
| `4FaQc6…` | `AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG` | 192,821,471.94 (6 dp) | **JAAA** — RWA, held directly, **never counted today**. |
| `4FaQc6…` | `EPjFWdd5…` (USDC) | 0.0029 | dust |
| `4FaQc6…` | `2u1tsz…` | 0.03 | dust |

**Consequences:**

- The two addresses are **not symmetric**. `4FaQc6` adds ~$193M of
  never-counted JAAA. `C23FGx`'s real holding is the **jleUSDG vault-share
  token** — the position is already in the footprint, so it must be **excluded**
  (allowlist registry never lists it) or it double-counts ~$251M.
- **JAAA price (resolved):** JAAA is the same fund on Base and Solana. Its Base
  contract `0x5a0f93d040de44e78f251b03c43be9cf317dcf64` (decimals 6, "Janus
  Henderson Anemoy AAA CLO Fund Token") is **not** ERC4626 (no `convertToAssets`),
  but the **Alchemy Prices API** prices it at **$1.03757** (2026-06-12, live).
  This matches the snapshot-implied ~$1.036. Use that price for the Solana JAAA
  amount. Ethena also holds ~48.2M JAAA on Base at `0x2d4d2a…7bb4` (the snapshot's
  second JAAA entry, ~$49.94M) — out of scope here, but the same price applies.
- The reconciliation tolerance is `max($10M, 3% × ethenaUsd)` ≈ $6M on JAAA;
  the live Alchemy price lands the on-chain figure within tolerance → verified.

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
  - `SolanaIdleToken { symbol; mint; decimals; pricing }` where `pricing` is a
    discriminated union: `{ kind: "peg" }` (hard $1), or `{ kind: "proxyPrice";
    network: string; address: string; approx?: boolean }` (price this token via
    a reference EVM contract through the Alchemy Prices API).
  - `SOLANA_IDLE_TOKENS` is an **allowlist** keyed by mint: USDG/PYUSD/USDC/USDe
    (`peg`); JAAA (`proxyPrice` → `base-mainnet` /
    `0x5a0f93d040de44e78f251b03c43be9cf317dcf64`, `approx: true`). Mints not
    listed are ignored — so vault-share mints are excluded by construction.
  - `EXCLUDED_MINTS: Record<string,string>` — documents *why* specific mints are
    deliberately kept out (e.g. `Bd2wJsmaF3YKC6f…` → "jleUSDG vault share —
    already counted by buildJupiterRow; valuing here double-counts"). Defensive
    documentation; the allowlist already excludes them.
- **`lib/solana/rpc.ts`** — Solana JSON-RPC helper. `getTokenAccountsByOwner`
  (`encoding: jsonParsed`) per (owner, programId) across both token programs.
  Reuses `SolanaApiError` / `SolanaTimeoutError` from `lib/solana/client.ts`.
  `server-only`.
- **`lib/onchain/prices.ts`** — Alchemy Prices API client (chain-agnostic, also
  reusable for EVM later). `fetchTokenPrices([{network, address}])` → POST
  `https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/by-address`,
  zod-validated → `Map<"network:address", number>` (response:
  `data[].prices[].value` as a string → `Number`). `server-only`.
- **`lib/solana/balances.ts`** — `getEthenaSolanaIdleBalances()`:
  1. For each `SOLANA_WALLETS` entry, fetch token accounts across both programs.
  2. Filter to the `SOLANA_IDLE_TOKENS` allowlist; sum raw amount per mint.
  3. Value per `pricing.kind`: `peg` → `amount × 1`; `proxyPrice` → `amount ×
     fetchTokenPrices(...)` for the referenced `{network,address}`, and if the
     price is absent, **exclude the token + `console.warn` + record a failure**
     (never `?? 0`). Proxy prices for all `proxyPrice` mints are fetched in one
     batched Alchemy Prices call.
  4. Aggregate per symbol → `IdleBalanceRow[]` (reuse the existing type; carry an
     `approx` flag for proxy-priced rows so the UI can footnote it), plus
     per-wallet USD (`walletIdleUsd`-shaped) and `failures`.
  `server-only`. Partial-data tolerant via `Promise.allSettled`.

### Modified

- **`lib/views/footprint.ts` (`loadFootprint`)** — call
  `getEthenaSolanaIdleBalances()` in parallel with the existing readers
  (`Promise.allSettled`, like `getEthenaSolanaPositions`). **Switch the two
  Solana `WalletInventoryRow`s to on-chain totals** (`walletTotalUsd`, replacing
  the snapshot value): `4FaQc6` ≈ $200M (JAAA, idle bucket), `C23FGx` ≈ $251M
  (jleUSDG, deployed bucket). `apiLabel` from snapshot counterparty, `label`
  from `KNOWN_SOLANA_WALLET_LABELS`. Thread a `failedSolanaBalances` field
  through `FootprintResult`.
- **Accounting buckets (registry `bucket`):** `idle` = base asset → folds into
  `idle`/reconciliation/inventory; `deployed` = vault-share already counted by a
  footprint row (jleUSDG via `buildJupiterRow`) → inventory total ONLY, never
  idle/reconciliation. Replaces the earlier blunt vault-share exclusion and is
  what lets the inventory show on-chain totals without double-counting.
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
  mints (`Bd2wJsmaF3YKC6f…`) and dust excluded; valuation (peg vs proxyPrice);
  failure paths (RPC down, proxy price missing → token excluded, not zeroed).
- **prices.test.ts** — Alchemy Prices response parsing (`data[].prices[].value`
  string → number); missing-address handling (returns no entry, not 0).
- **reconciliation** — extend existing coverage: JAAA nets on-chain and the gap
  closes within tolerance; no double-count of USDG/PYUSD against protocol rows.

## Infra

- Reuses `ALCHEMY_KEY` for **both** the Solana RPC endpoint and the Alchemy
  Prices API — **no new secret**, no new dependency, no Vercel env change.
- Reads run live at ISR time (idle reads are not snapshotted) — **no change to
  `scripts/refresh-flows.ts`**.

## Out of scope

- A dedicated Solana wallet drilldown page.
- On-chain reading of *deployed* Solana positions (already covered by the
  protocol-API footprint rows).
- Backfilling historical Solana balances.
