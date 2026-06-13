// lib/solana/balances.ts
import "server-only"
import type { IdleBalanceRow } from "@/lib/onchain/balances"
import { SOLANA_WALLETS } from "@/config/solana-wallets"
import {
  SOLANA_DEPLOYED_MINTS,
  SOLANA_PEG_MINTS,
  SOLANA_DENY_MINTS,
  SOLANA_RWA_MINTS,
} from "@/config/solana-known-mints"
import { fetchPricesBySymbol } from "@/lib/onchain/prices"
import { fetchJupiterPrices } from "./prices"
import { fetchAssetIdentities } from "./das"
import { getTokenBalancesByOwner } from "./rpc"

/** Holdings valued below this (USD) are dropped as dust — applied AFTER pricing,
 *  so large-unit-count tokens like STAC are not pre-filtered. */
const MIN_DUST_USD = 1

export interface SolanaIdleResult {
  /** Idle-bucket rows (base assets) — feed reconciliation + idle total. */
  rows: IdleBalanceRow[]
  /** Sum of `rows` (idle bucket only). */
  totalUsd: number
  /** Per-wallet on-chain total across ALL buckets (idle + deployed) — feeds the
   *  monitored-wallet inventory. Keyed by the exact base58 address. */
  walletTotalUsd: Array<{ address: string; totalUsd: number }>
  failures: Array<{ source: string; reason: string }>
}

/** Classification of a held mint into a processing bucket. */
type MintClass =
  | { kind: "deployed"; symbol: string }
  | { kind: "peg"; symbol: string }
  | { kind: "auto" }
  | { kind: "deny" }

function classifyMint(mint: string): MintClass {
  if (mint in SOLANA_DENY_MINTS) return { kind: "deny" }
  if (mint in SOLANA_DEPLOYED_MINTS)
    return { kind: "deployed", symbol: SOLANA_DEPLOYED_MINTS[mint]!.symbol }
  if (mint in SOLANA_PEG_MINTS) return { kind: "peg", symbol: SOLANA_PEG_MINTS[mint]! }
  return { kind: "auto" }
}

/**
 * Read SPL balances at SOLANA_WALLETS and auto-discover their identity + price.
 *
 * Classification per mint:
 *  - DENY_MINTS    → dropped silently.
 *  - DEPLOYED_MINTS → deployed bucket; priced via Jupiter (inventory only,
 *                     never in idle/reconciliation to avoid double-counting
 *                     the underlying position already in a footprint row).
 *  - PEG_MINTS     → idle bucket; price = $1.
 *  - everything else → "auto": identify via DAS getAsset, price via
 *                     fetchPricesBySymbol(symbol). BOTH must succeed or the
 *                     token is excluded (never valued at 0) and a failure entry
 *                     is pushed + console.warn emitted.
 *
 * Post-pricing dust floor: holdings worth < $1 are dropped (after valuation,
 * so large-NAV tokens with a small unit count — like STAC — are never skipped).
 *
 * Partial-tolerant: a per-wallet RPC failure skips that wallet and records a
 * failure entry. The batch DAS and by-symbol price calls cover all wallets in
 * one round each.
 */
export async function getEthenaSolanaIdleBalances(): Promise<SolanaIdleResult> {
  const failures: SolanaIdleResult["failures"] = []

  // ── 1. Read balances per wallet (partial-tolerant).
  const perWallet = await Promise.allSettled(
    SOLANA_WALLETS.map(async (address) => ({
      address,
      balances: await getTokenBalancesByOwner(address),
    })),
  )

  // ── 2. Classify every held mint; drop zero balances + DENY mints.
  //       Collect "auto" mints for batch DAS + by-symbol price lookups.
  type HeldEntry = {
    mint: string
    rawAmount: bigint
    decimals: number
    cls: MintClass
  }
  const perWalletHeld = new Map<string, HeldEntry[]>()
  const autoMints = new Set<string>() // mints needing DAS identification

  perWallet.forEach((r, i) => {
    const address = SOLANA_WALLETS[i]!
    if (r.status === "rejected") {
      failures.push({ source: `rpc:${address}`, reason: reasonOf(r.reason) })
      return
    }
    const held: HeldEntry[] = []
    for (const b of r.value.balances) {
      if (b.rawAmount === BigInt(0)) continue
      const cls = classifyMint(b.mint)
      if (cls.kind === "deny") continue
      held.push({ mint: b.mint, rawAmount: b.rawAmount, decimals: b.decimals, cls })
      if (cls.kind === "auto") autoMints.add(b.mint)
    }
    perWalletHeld.set(address, held)
  })

  // ── 3. Batch: identify auto mints via DAS + fetch Jupiter prices for deployed.
  const deployedMintAddresses = [...new Set(
    [...perWalletHeld.values()]
      .flat()
      .filter((e) => e.cls.kind === "deployed")
      .map((e) => e.mint),
  )]

  const [identities, jupiterPrices] = await Promise.all([
    autoMints.size > 0
      ? fetchAssetIdentities([...autoMints]).catch((err) => {
          failures.push({ source: "das", reason: reasonOf(err) })
          return new Map<string, { symbol: string; name: string }>()
        })
      : Promise.resolve(new Map<string, { symbol: string; name: string }>()),
    deployedMintAddresses.length > 0
      ? fetchJupiterPrices(deployedMintAddresses).catch((err) => {
          failures.push({ source: "jupiter-prices", reason: reasonOf(err) })
          return new Map<string, number>()
        })
      : Promise.resolve(new Map<string, number>()),
  ])

  // ── 4. Fetch by-symbol prices for all auto-identified symbols.
  const autoSymbols = [...new Set(
    [...autoMints]
      .map((m) => identities.get(m)?.symbol)
      .filter((s): s is string => s !== undefined),
  )]

  const symbolPrices =
    autoSymbols.length > 0
      ? await fetchPricesBySymbol(autoSymbols).catch((err) => {
          failures.push({ source: "alchemy-prices-by-symbol", reason: reasonOf(err) })
          return new Map<string, number>()
        })
      : new Map<string, number>()

  // ── 5. Value each held entry, aggregate idle rows + per-wallet totals.
  const bySymbol = new Map<string, { usd: number; approx: boolean }>()
  const walletTotalUsd: SolanaIdleResult["walletTotalUsd"] = []

  for (const [address, held] of perWalletHeld) {
    let walletUsd = 0

    for (const { mint, rawAmount, decimals, cls } of held) {
      const amount = Number(rawAmount) / 10 ** decimals

      if (cls.kind === "deployed") {
        const price = jupiterPrices.get(mint)
        if (price === undefined) {
          console.warn(
            `[ethena-flow-monitor] no Jupiter price for deployed ${cls.symbol} (${mint}) — excluding`,
          )
          failures.push({ source: `price:deployed:${cls.symbol}`, reason: "missing Jupiter price" })
          continue
        }
        const usd = amount * price
        if (usd < MIN_DUST_USD) continue
        walletUsd += usd // inventory only — NOT in idle rows
        continue
      }

      if (cls.kind === "peg") {
        const usd = amount // $1 per unit
        if (usd < MIN_DUST_USD) continue
        walletUsd += usd
        const prev = bySymbol.get(cls.symbol)
        bySymbol.set(cls.symbol, { usd: (prev?.usd ?? 0) + usd, approx: prev?.approx ?? false })
        continue
      }

      // "auto" — must have both identity AND price to be valued
      const identity = identities.get(mint)
      if (identity === undefined) {
        console.warn(
          `[ethena-flow-monitor] DAS could not identify mint ${mint} — excluding from valuation`,
        )
        failures.push({ source: `das:${mint}`, reason: "unidentified mint" })
        continue
      }

      const sym = identity.symbol.toUpperCase()

      // ── Canonical-mint guard ──────────────────────────────────────────────
      // If the symbol is a known RWA, the mint must match exactly. A different
      // mint claiming the same symbol is a spam/airdrop spoof: reject loudly.
      if (sym in SOLANA_RWA_MINTS) {
        if (mint !== SOLANA_RWA_MINTS[sym]) {
          console.warn(
            `[ethena-flow-monitor] spoof detected: mint ${mint} claims symbol ${sym} ` +
              `but canonical mint is ${SOLANA_RWA_MINTS[sym]} — excluding`,
          )
          failures.push({
            source: `spoof:${sym}`,
            reason: `non-canonical mint ${mint} claimed symbol ${sym}`,
          })
          continue
        }
        // Canonical mint — fall through to normal pricing below.
      } else {
        // Symbol is not in the approved RWA map. This is a genuinely-new asset.
        // Do NOT auto-value it; route to failures so a human can confirm.
        const approxUsd = symbolPrices.get(sym)
        const approxNote = approxUsd !== undefined ? ` (approx USD: ${(amount * approxUsd).toFixed(2)})` : ""
        console.warn(
          `[ethena-flow-monitor] untracked symbol ${sym} (mint ${mint})${approxNote} — ` +
            `add to SOLANA_RWA_MINTS to auto-value`,
        )
        failures.push({
          source: `untracked:${sym}`,
          reason: `symbol not in SOLANA_RWA_MINTS; mint ${mint}${approxNote}`,
        })
        continue
      }
      // ─────────────────────────────────────────────────────────────────────

      const price = symbolPrices.get(sym)
      if (price === undefined) {
        console.warn(
          `[ethena-flow-monitor] no by-symbol price for ${identity.symbol} (${mint}) — excluding`,
        )
        failures.push({ source: `price:${identity.symbol}`, reason: "missing by-symbol price" })
        continue
      }

      const usd = amount * price
      if (usd < MIN_DUST_USD) continue
      walletUsd += usd
      const prev = bySymbol.get(identity.symbol)
      bySymbol.set(identity.symbol, {
        usd: (prev?.usd ?? 0) + usd,
        // approx is sticky: once true, stays true regardless of iteration order
        approx: (prev?.approx ?? false) || true,
      })
    }

    walletTotalUsd.push({ address, totalUsd: walletUsd })
  }

  const rows: IdleBalanceRow[] = [...bySymbol.entries()]
    .map(([symbol, { usd, approx }]) => ({ symbol, totalUsd: usd, isErc4626: false, approx }))
    .sort((a, b) => b.totalUsd - a.totalUsd)

  return {
    rows,
    totalUsd: rows.reduce((a, r) => a + r.totalUsd, 0),
    walletTotalUsd,
    failures,
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
