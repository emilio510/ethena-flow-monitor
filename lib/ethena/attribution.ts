import type { AddressEntry, BackingSnapshot } from "./schemas"

export type AddressKind = "evm" | "solana" | "btc" | "custodial" | "mixed" | "unknown"

/**
 * Tag a raw address string so consumers can branch without regex.
 * "custodial" and "mixed" are Ethena's sentinels; the rest are pattern matches.
 */
export function classifyAddress(raw: string): AddressKind {
  if (raw === "custodial") return "custodial"
  if (raw === "mixed") return "mixed"
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return "evm"
  // Bitcoin: P2PKH (1…), P2SH (3…), Bech32 (bc1…). 26-62 chars covers them.
  if (/^(bc1[a-z0-9]{6,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(raw)) return "btc"
  // Solana: base58, 32-44 chars (excludes 0, O, I, l).
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) return "solana"
  return "unknown"
}

export type FlatWallet = {
  address: string
  chainSlug: string
  strategy: string
  counterparty: string | null
  asset: string
  /** $ value Ethena attributes to this exact (address, chain, asset). */
  value: number
}

/**
 * Walk the snapshot and emit one row per (wallet, chain, asset) tuple.
 * Counterparties without `addressEntries[]` (pure-custodial INTX, or aggregated
 * "mixed" rows on Liquid Stables) are omitted — they have no on-chain anchor to
 * verify against. Use {@link custodialValue} to recover that bucket.
 */
export function flattenWallets(snapshot: BackingSnapshot): FlatWallet[] {
  const rows: FlatWallet[] = []
  for (const strategy of snapshot.strategies) {
    for (const cp of strategy.counterparties) {
      for (const asset of cp.assets) {
        const entries: AddressEntry[] =
          asset.addressEntries.length > 0 ? asset.addressEntries : cp.addressEntries
        for (const entry of entries) {
          // Skip entries without a chainSlug (BTC P2SH, custodial omnibus) —
          // they have no on-chain cross-check.
          if (!entry.chainSlug) continue
          rows.push({
            address: entry.address,
            chainSlug: entry.chainSlug,
            strategy: strategy.strategy,
            counterparty: cp.counterparty ?? null,
            asset: asset.asset,
            // Asset-level value is per-chain. If we fell back to the
            // counterparty's addressEntries we'd double-count — emit only
            // when the asset itself carries an entry.
            value: asset.addressEntries.length > 0 ? asset.value : 0,
          })
        }
      }
    }
  }
  return rows
}

export function totalBacking(snapshot: BackingSnapshot): number {
  return snapshot.strategies.reduce((sum, s) => sum + s.value, 0)
}

function hasVerifiableEntry(entries: { chainSlug?: string }[]): boolean {
  return entries.some((e) => !!e.chainSlug)
}

/**
 * USD value Ethena attributes to legs the project's EVM/Solana tooling can't
 * reconcile. Covers both:
 *  - pure custodial (Crypto Basis on Copper — no addresses anywhere)
 *  - BTC-anchored (CBAM's two P2SH wallets — on-chain but not on a chain we read)
 *
 * Useful as a "trust-Ethena" KPI tile so the on-chain verifier badge isn't
 * misleadingly red when the gap is just BTC + Copper.
 */
export function custodialValue(snapshot: BackingSnapshot): number {
  let total = 0
  for (const strategy of snapshot.strategies) {
    for (const cp of strategy.counterparties) {
      const cpVerifiable = hasVerifiableEntry(cp.addressEntries)
      for (const asset of cp.assets) {
        if (!cpVerifiable && !hasVerifiableEntry(asset.addressEntries)) {
          total += asset.value
        }
      }
      // Counterparties with no asset breakdown still hold value. Credit it
      // only when the counterparty itself has no verifiable entries either.
      if (cp.assets.length === 0 && !cpVerifiable) {
        total += cp.value
      }
    }
  }
  return total
}
