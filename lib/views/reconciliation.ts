import type { BackingSnapshot } from "@/lib/ethena"
import type { IdleBalanceRow } from "@/lib/onchain/balances"
import type { FootprintRow } from "./footprint"

/**
 * Per-asset reconciliation: what Ethena's API reports as backing vs what we
 * can independently verify on-chain (deployed lending positions + idle wallet
 * balances). The gap is the dashboard's honesty check — it itemises the
 * verifier badge.
 */
export type ReconciliationStatus = "verified" | "gap" | "off-chain"

export interface ReconciliationRow {
  asset: string
  /** $ Ethena's API attributes to this asset, across all strategies. */
  ethenaUsd: number
  /** $ we can see on-chain — deployed + idle, reserve fund already excluded. */
  onchainUsd: number
  /** ethenaUsd − onchainUsd. Positive = Ethena reports more than we verify. */
  gapUsd: number
  status: ReconciliationStatus
  note?: string
}

export interface Reconciliation {
  rows: ReconciliationRow[]
  ethenaTotal: number
  onchainTotal: number
  gapTotal: number
}

/**
 * Assets (or no-asset counterparties) that are structurally off-chain for
 * this dashboard — no reader exists, so a 100% gap is expected, not a bug.
 */
const OFF_CHAIN: Record<string, string> = {
  BTC: "Custodial (Copper) — delta-neutral basis",
  ETH: "Custodial (Copper) — delta-neutral basis",
  CBAM: "Institutional lending — BTC-anchored, off-chain",
}

/**
 * On-chain idle tokens that ARE an Ethena-reported counterparty position under
 * a different name. Ethena reports these as a counterparty with no asset
 * breakdown (keyed by counterparty name below); we independently verify them
 * on-chain via a token whose symbol differs. Fold the on-chain balance into the
 * Ethena key so the position reconciles to one verified row instead of two
 * offsetting false gaps.
 */
const IDLE_SYMBOL_ALIASES: Record<string, string> = {
  // Ethena: "Maple Institutional" counterparty (Institutional Lending, no asset
  // breakdown). On-chain: the MPLhysUSDC1 ERC4626 share in the backing wallet.
  MPLhysUSDC1: "Maple Institutional",
}

/** Rows below this on both sides are dust — not worth a line. */
const MIN_ROW_USD = 1_000_000

export function buildReconciliation(
  snapshot: BackingSnapshot,
  deployed: FootprintRow[],
  idle: IdleBalanceRow[],
): Reconciliation {
  // ── Ethena side: sum reported value per asset across every strategy.
  const ethena = new Map<string, number>()
  for (const strategy of snapshot.strategies) {
    for (const cp of strategy.counterparties) {
      if (cp.assets.length > 0) {
        for (const a of cp.assets) {
          ethena.set(a.asset, (ethena.get(a.asset) ?? 0) + a.value)
        }
      } else if (cp.value > 0) {
        // Counterparty with no asset breakdown (e.g. CBAM) — key by name.
        const key = cp.counterparty ?? "Other"
        ethena.set(key, (ethena.get(key) ?? 0) + cp.value)
      }
    }
  }

  // ── Our side: deployed lending positions + idle wallet balances.
  const ours = new Map<string, number>()
  for (const row of deployed) {
    if (row.isAnomalyBorrow) continue
    ours.set(row.reserveSymbol, (ours.get(row.reserveSymbol) ?? 0) + row.ethenaSuppliedUsd)
  }
  for (const row of idle) {
    const key = IDLE_SYMBOL_ALIASES[row.symbol] ?? row.symbol
    ours.set(key, (ours.get(key) ?? 0) + row.totalUsd)
  }

  const rows: ReconciliationRow[] = []
  for (const asset of new Set([...ethena.keys(), ...ours.keys()])) {
    const ethenaUsd = ethena.get(asset) ?? 0
    const onchainUsd = ours.get(asset) ?? 0
    if (ethenaUsd < MIN_ROW_USD && onchainUsd < MIN_ROW_USD) continue

    const gapUsd = ethenaUsd - onchainUsd
    let status: ReconciliationStatus
    let note: string | undefined

    if (asset in OFF_CHAIN) {
      status = "off-chain"
      note = OFF_CHAIN[asset]
    } else {
      // Tolerance scales with size — small assets get a flat $10M floor so
      // snapshot-vs-live timing skew doesn't flag everything.
      const tolerance = Math.max(10_000_000, ethenaUsd * 0.03)
      if (Math.abs(gapUsd) <= tolerance) {
        status = "verified"
      } else {
        status = "gap"
        note =
          gapUsd > 0
            ? "Unverified — likely custodian omnibus"
            : "On-chain exceeds reported — snapshot lag"
      }
    }
    rows.push({ asset, ethenaUsd, onchainUsd, gapUsd, status, note })
  }

  rows.sort((a, b) => b.ethenaUsd - a.ethenaUsd)
  return {
    rows,
    ethenaTotal: rows.reduce((s, r) => s + r.ethenaUsd, 0),
    onchainTotal: rows.reduce((s, r) => s + r.onchainUsd, 0),
    gapTotal: rows.reduce((s, r) => s + r.gapUsd, 0),
  }
}
