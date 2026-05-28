# Ethena Flow Tracker — Design

**Date:** 2026-05-28
**Status:** Approved (pending spec review)

## Problem

Ethena routinely moves backing collateral between custody wallets, redeems
stablecoins, and spins up brand-new addresses on every chain. Today we discover
these moves only by manually querying the ledger (e.g. the 2026-05-26 trace that
found ~150M RLUSD leaving the two known XRPL wallets into two fresh addresses).
We need this to be automatic: detect large outflows from Ethena's monitored
wallets, classify each one, surface them in the dashboard, and keep the trail
alive as funds hop into new addresses — without ever silently inflating the
verified backing total.

## Goals (v1)

- Detect **outflows ≥ $1,000,000** from the monitored Ethena wallet set.
- Cover **XRPL + EVM (Ethereum)**. Solana is explicitly out of scope for v1.
- **Auto-classify** each flow: `redeem` | `rebalance` | `external`, each with a
  `high` | `low` confidence.
- Auto-promote probable new Ethena addresses into the **scan set** so the next
  run follows their outflows too — but **quarantine** them from the backing /
  reconciliation total until a human confirms them in `config/`.
- Render a **recent-flows table** (rolling last 90 days) at the bottom of the
  dashboard, low-confidence classifications shown with a visible warning.
- Run as a **daily batch** in the existing launchd refresh job; commit results
  as static JSON read by the Vercel build.

## Non-Goals (v1)

- Inflows / mints (only outflows from the monitored set).
- Solana flow tracking (its backing is locked in recursive Kamino/Jupiter
  vaults — movement is within-protocol, not wallet-to-wallet).
- Real-time / sub-daily freshness.
- Auto-promoting any address into the **backing total** (always manual).
- Multi-hop graph visualisation (the table is flat; hops appear as separate
  rows across runs as discovered wallets enter the scan set).

## Architecture

Chosen approach: **daily batch in the launchd job → committed JSON → static
read on Vercel**, mirroring the existing backing-snapshot pattern. The
Cloudflare block only affects Ethena's own API; all on-chain reads (XRPL
`account_tx`, EVM via Alchemy, public RPCs) work from anywhere, but the batch
still lives in the residential-IP job because tx-history scans are slow and
rate-limited — a poor fit for a serverless request, an ideal fit for a nightly
job whose git history doubles as an audit trail.

Rejected alternatives:
- **Vercel cron + KV/Postgres** — new infra + cost + serverless-timeout risk;
  abandons the committed-snapshot model that already works.
- **Live scan per page load** — heavy, rate-limited, and stateless, so it cannot
  detect "new since last run", which is the core requirement.

### Scan set vs backing set (the quarantine guarantee)

Two distinct wallet lists, enforced by *which module imports which*, not by a
runtime flag:

- **Scan set** = `config` wallets + `data/ethena-discovered-wallets.json`.
  Consumed only by the flow scanners. Grows automatically.
- **Backing set** = `config` wallets only (`ETHENA_WALLETS`,
  `RESERVE_FUND_WALLET`, `ETHENA_XRPL_WALLETS`). Consumed by the existing
  backing readers (`getEthenaRlusdHoldings`, `lib/onchain/balances.ts`).
  **Unchanged by this feature.**

A discovered wallet therefore appears in the flows table and feeds the next
scan, but cannot affect the reconciliation total until hand-promoted into
`config/`.

## Data Model

`data/ethena-flows.json` — append-only ledger, deduped by `txHash`:

```ts
interface Flow {
  chain: "xrpl" | "ethereum"
  txHash: string
  timestamp: number            // unix seconds
  from: string                 // a scan-set wallet (lowercased for EVM)
  to: string                   // destination (base58 case-preserved for XRPL)
  asset: string                // "RLUSD" | "USDe" | "USDtb" | "USDC" | "USDT" | ...
  amountUsd: number            // >= 1_000_000
  classification: "redeem" | "rebalance" | "external"
  confidence: "high" | "low"
  reason: string               // human-readable justification
}
```

`data/ethena-discovered-wallets.json` — auto-promoted scan-set members:

```ts
interface DiscoveredWallet {
  address: string
  chain: "xrpl" | "ethereum"
  discoveredVia: string        // txHash that introduced it
  firstSeen: number            // unix seconds
  status: "quarantined"        // v1 only ever writes "quarantined"
}
```

Both files are written by the batch and read via static import behind the
`process.env.VERCEL` branch, exactly like the backing snapshot.

## Components

Each is a small, independently testable unit following the existing pure-reader
shape in `lib/onchain/`.

- **`lib/flows/types.ts`** — `Flow`, `DiscoveredWallet`, zod schemas. Asset and
  threshold constants.
- **`lib/flows/xrpl-flows.ts`** — for each XRPL scan-set wallet, call
  `account_tx` (paged, bounded to last 90 days), keep `Payment`s where
  `Account == wallet` and `Amount` is an Ethena-family issued currency
  ≥ threshold. Returns raw (unclassified) flows.
- **`lib/flows/evm-flows.ts`** — for each EVM scan-set wallet, call Alchemy
  `alchemy_getAssetTransfers` (`category: ["erc20"]`, `fromAddress: wallet`,
  `contractAddresses:` Ethena-family stable list, `fromBlock` ≈ 90 days ago),
  keep transfers with USD value ≥ threshold. Returns raw flows.
- **`lib/flows/classify.ts`** — pure `classifyFlow(flow, knownWallets,
  destProbe) -> { classification, confidence, reason }`. Contains
  `classifyNewAddress()`, the domain-judgment heuristic (see below).
- **`lib/flows/scan.ts`** — orchestrator: load scan set, run both scanners,
  classify, dedupe-merge into the existing ledger, prune to 90 days, promote
  high-confidence new `rebalance` destinations into the discovered-wallets file.
- **`scripts/refresh-flows.ts`** — node entrypoint that calls `scan.ts` and
  writes both JSON files.
- **`components/FlowsTable.tsx`** — bottom-of-page table using the monochrome
  design primitives (`GlassCard`, `SectionHead`, `Tag`).

## Classification Rules

Applied in order; first match wins:

1. `to` is a burn/redeem sink → **redeem**, `high`.
   - XRPL: `to == RLUSD_ISSUER` (sending an issued currency back to its issuer
     burns it).
   - EVM: `to == 0xe349…` (USDe MintRedeem contract) or a known burn address.
2. `to` ∈ known Ethena wallets (config backing set + already-discovered set) →
   **rebalance**, `high`.
3. `to` is new → `classifyNewAddress(to, chain, destProbe)`:
   - Probe the destination's holdings (XRPL `account_lines`, EVM token balances).
   - **Probable Ethena custody** (heuristic — see Insight) → **rebalance**.
     Confidence `high` only when the signal is strong (e.g. XRPL
     single-trustline purity + funded by the sending wallet); otherwise `low`.
   - **No Ethena-like signal** → **external**, `low`.

`reason` always records the deciding signal (e.g. `"dest holds only RLUSD
trustline, funded by r4vF…"` or `"dest holds 6 unrelated tokens — external"`).

Low confidence is a first-class visual state: the table renders it as a warning
tag, never as a silent assertion. This is what makes auto-classification safe.

### `classifyNewAddress()` — domain-judgment seam

This function encodes "what makes an address look like Ethena custody". v1
heuristic signals:

- **XRPL**: destination has exactly one trust line and it is an Ethena-family
  issued currency (single-trustline purity); bonus signal if the funding tx came
  from a scan-set wallet.
- **EVM**: destination's ERC20 balances are exclusively Ethena-family stables
  (no unrelated tokens); bonus signal if low/zero outbound history.

Output is `{ isProbableEthena: boolean, confidence: "high" | "low", reason }`.
The surrounding fetch/merge/render code is scaffolded; this ~10-line judgment
function is authored by the user during implementation.

## Promotion Logic

After classification, for each flow classified `rebalance` whose `to` is new:

- Always **record** it in the flows ledger.
- If `confidence == high`, **append** `to` to
  `data/ethena-discovered-wallets.json` with `status: "quarantined"` (idempotent
  — dedupe by address+chain). Low-confidence rebalances and all `external` flows
  are recorded but never promoted, so a weak guess never silently widens the scan
  set.

Discovered wallets are read into the scan set on the next run; they are never
read by the backing readers.

## Refresh Job Integration

`scripts/refresh-and-push.sh` is restructured so the snapshot refresh and the
flows scan are **independent steps**:

- Each step runs regardless of the other's outcome (the flows scan does not
  depend on Ethena's Cloudflare-gated API).
- A transient RPC/fetch failure in either step exits that step non-zero
  **without** overwriting existing data — same fail-safe guard (`git diff
  --quiet`) already used for the snapshot.
- Files are staged after both steps run; whatever changed (snapshot only, flows
  only, or both) is committed together in one commit. The invariant is that a
  partial failure leaves the failed step's prior data untouched — never a
  half-written file.

No change to the launchd plist schedule (daily 09:00 local).

## Frontend

`components/FlowsTable.tsx`, mounted at the bottom of `app/page.tsx`. Reads
`data/ethena-flows.json` statically. Shows the rolling last-90-days window,
newest first. Columns:

- **Date** (UTC) · **Chain** · **From** (labelled via `KNOWN_WALLET_LABELS`,
  else truncated) · **To** (labelled / truncated, with discovered-wallet badge) ·
  **Asset** · **Amount (USD)** · **Classification** (`Tag`: redeem / rebalance /
  external) · **Confidence** (warning `Tag` when `low`).

Styling strictly via existing design primitives (`GlassCard`, `SectionHead`,
`Tag`) — no new tokens. No emojis (icons/shapes only).

## Error Handling

- Each scanner wraps its per-wallet RPC calls; a single wallet's failure is
  logged and skipped, not fatal, so one bad address never voids the whole run.
- Network/RPC timeouts use the existing `AbortSignal.timeout` pattern.
- The batch exits non-zero on a total scanner failure but leaves prior committed
  data intact.
- USD valuation: dollar-pegged stables valued at face (balance == USD), matching
  the existing XRPL reader's assumption; the asset list is restricted to pegged
  stables so this holds.

## Testing

- `lib/flows/classify.test.ts` — table-driven: redeem (issuer/MintRedeem),
  internal rebalance, new-pure-address rebalance (high + low), external, and
  reason-string assertions. Classifier is written TDD-first.
- `lib/flows/xrpl-flows.test.ts` / `evm-flows.test.ts` — scanners against
  fixture RPC responses (including a sub-threshold tx that must be filtered out,
  and a non-Payment / non-erc20 entry that must be ignored).
- `lib/flows/scan.test.ts` — dedupe-merge, 90-day prune, and promotion
  (high-confidence promotes; low-confidence does not).
- Target ≥ 80% coverage per project standard.

## New Files / Changed Files

New:
- `lib/flows/types.ts`, `xrpl-flows.ts`, `evm-flows.ts`, `classify.ts`,
  `scan.ts` (+ test files)
- `scripts/refresh-flows.ts`
- `components/FlowsTable.tsx`
- `data/ethena-flows.json`, `data/ethena-discovered-wallets.json` (seeded with
  the 2026-05-26 RLUSD flows + the two discovered wallets)

Changed:
- `scripts/refresh-and-push.sh` (add independent flows step)
- `app/page.tsx` (mount `FlowsTable`)
- `config/xrpl.ts` (add the two confirmed 2026-05-26 destinations to
  `ETHENA_XRPL_WALLETS` — these are human-confirmed, so they join the *backing*
  set, not just the discovered set)

## Open Questions

None blocking. Future passes: Solana coverage, inflow/mint tracking, exchange
deposit-address labelling to sharpen the `external` call.
