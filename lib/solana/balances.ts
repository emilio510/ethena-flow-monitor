// lib/solana/balances.ts
import "server-only"
import type { IdleBalanceRow } from "@/lib/onchain/balances"
import { SOLANA_WALLETS } from "@/config/solana-wallets"
import { SOLANA_IDLE_TOKENS, type SolanaIdleToken } from "@/config/solana-idle-tokens"
import { fetchTokenPrices, priceKey, type TokenRef } from "@/lib/onchain/prices"
import { fetchJupiterPrices } from "./prices"
import { getTokenBalancesByOwner } from "./rpc"

/** Holdings valued below this (USD) are dropped as dust. */
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

/**
 * Read SPL balances at SOLANA_WALLETS and value them per the registry.
 *  - idle-bucket assets (JAAA, stables) → `rows` + `totalUsd` (reconciliation).
 *  - deployed-bucket assets (jleUSDG vault share) → counted ONLY in
 *    `walletTotalUsd` (inventory), never in `rows`, so the Jupiter footprint
 *    row is not double-counted.
 *
 * Pricing: peg → $1; proxyPrice (JAAA) → Alchemy Prices via its Base contract;
 * jupiter (jleUSDG) → Jupiter price API. Partial-tolerant: a per-wallet RPC
 * failure skips that wallet; a missing price EXCLUDES the token (never 0) and
 * records a failure.
 */
export async function getEthenaSolanaIdleBalances(): Promise<SolanaIdleResult> {
  const failures: SolanaIdleResult["failures"] = []

  // 1. Read balances per wallet (partial-tolerant).
  const perWallet = await Promise.allSettled(
    SOLANA_WALLETS.map(async (address) => ({
      address,
      balances: await getTokenBalancesByOwner(address),
    })),
  )

  // 2. Sum raw amounts per (wallet, allowlisted mint).
  const rawByWalletMint = new Map<string, Map<string, bigint>>()
  perWallet.forEach((r, i) => {
    const address = SOLANA_WALLETS[i]!
    if (r.status === "rejected") {
      failures.push({ source: `rpc:${address}`, reason: reasonOf(r.reason) })
      return
    }
    const byMint = new Map<string, bigint>()
    for (const b of r.value.balances) {
      if (!SOLANA_IDLE_TOKENS[b.mint]) continue // allowlist: drops dust + unknown
      byMint.set(b.mint, (byMint.get(b.mint) ?? BigInt(0)) + b.rawAmount)
    }
    rawByWalletMint.set(address, byMint)
  })

  // 3. Collect held mints, then batch-fetch prices by source.
  const heldMints = new Set<string>()
  for (const byMint of rawByWalletMint.values()) for (const m of byMint.keys()) heldMints.add(m)

  const proxyRefs: TokenRef[] = []
  const jupiterMints: string[] = []
  for (const mint of heldMints) {
    const p = SOLANA_IDLE_TOKENS[mint]!.pricing
    if (p.kind === "proxyPrice") proxyRefs.push({ network: p.network, address: p.address })
    else if (p.kind === "jupiter") jupiterMints.push(mint)
  }

  let proxyPrices = new Map<string, number>()
  if (proxyRefs.length > 0) {
    try {
      proxyPrices = await fetchTokenPrices(proxyRefs)
    } catch (err) {
      failures.push({ source: "alchemy-prices", reason: reasonOf(err) })
    }
  }
  let jupiterPrices = new Map<string, number>()
  if (jupiterMints.length > 0) {
    try {
      jupiterPrices = await fetchJupiterPrices(jupiterMints)
    } catch (err) {
      failures.push({ source: "jupiter-prices", reason: reasonOf(err) })
    }
  }

  // 4. Value -> idle-bucket per-symbol rows + per-wallet all-bucket total.
  const bySymbol = new Map<string, { usd: number; approx: boolean }>()
  const walletTotalUsd: SolanaIdleResult["walletTotalUsd"] = []

  for (const [address, byMint] of rawByWalletMint) {
    let walletUsd = 0
    for (const [mint, raw] of byMint) {
      const tok = SOLANA_IDLE_TOKENS[mint]!
      const priced = valueToken(tok, raw, proxyPrices, jupiterPrices)
      if (priced === null) {
        console.warn(`[ethena-flow-monitor] no price for ${tok.symbol} (${mint}) — excluding`)
        failures.push({ source: `price:${tok.symbol}`, reason: "missing price" })
        continue
      }
      if (priced.usd < MIN_DUST_USD) continue
      walletUsd += priced.usd // inventory total: every bucket
      if (tok.bucket === "idle") {
        const prev = bySymbol.get(tok.symbol)
        bySymbol.set(tok.symbol, {
          usd: (prev?.usd ?? 0) + priced.usd,
          approx: (prev?.approx ?? false) || priced.approx,
        })
      }
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

/** Returns null when a required price is missing (caller excludes the token). */
function valueToken(
  tok: SolanaIdleToken,
  raw: bigint,
  proxyPrices: Map<string, number>,
  jupiterPrices: Map<string, number>,
): { usd: number; approx: boolean } | null {
  const amount = Number(raw) / 10 ** tok.decimals
  switch (tok.pricing.kind) {
    case "peg":
      return { usd: amount, approx: false }
    case "proxyPrice": {
      const price = proxyPrices.get(priceKey(tok.pricing.network, tok.pricing.address))
      return price === undefined ? null : { usd: amount * price, approx: tok.pricing.approx ?? false }
    }
    case "jupiter": {
      const price = jupiterPrices.get(tok.mint)
      return price === undefined ? null : { usd: amount * price, approx: false }
    }
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
