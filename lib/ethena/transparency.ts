import "server-only"
import { z } from "zod"
import { ethenaFetch } from "./client"

const StatusResp = z.object({
  totalBackingAssetsInUsd: z.number(),
  totalReserveFundInUsd: z.number(),
  totalTokenSupplyInUsd: z.number(),
})

const CollateralPosition = z.object({
  asset: z.string(),
  exchange: z.string(),
  usdAmount: z.number().nullable(),
})

const PositionsResp = z.object({
  collateral: z.array(CollateralPosition),
})

/** Ethena's API uses "Unallocated" for backing not held at a centralised
 *  exchange — i.e. the on-chain / treasury portion. Filtering it out leaves
 *  only the CEX-delegated funding-rate-harvest positions. */
const UNALLOCATED = "Unallocated"

/** Pretty-print mapping for exchange names that aren't self-explanatory. */
const EXCHANGE_LABELS: Record<string, string> = {
  INTX: "Coinbase Intl",
}

export interface EthenaExchangeRow {
  exchange: string
  usd: number
}

export interface EthenaBackingResult {
  /** Ethena's official total notional ($3.97B at the time of writing). */
  totalBackingUsd: number
  /** Reserve fund (insurance fund) — surfaced for completeness. */
  reserveFundUsd: number
  /** Total USDe + USDtb supply Ethena's API reports. */
  tokenSupplyUsd: number
  /** Delegated to centralised exchanges for funding-rate harvest. */
  delegatedUsd: number
  /** Ethena's own "Unallocated" total — should match our independently-
   *  measured on-chain figure (deployed in lending + idle in wallets) within
   *  rounding. Useful as a cross-check. */
  undelegatedReportedUsd: number
  byExchange: EthenaExchangeRow[]
  /** True when the upstream API failed; the rest of the fields will be 0
   *  and the UI should hide the section gracefully. */
  failed: boolean
}

/** Fetch Ethena's transparency feed in one shot. Failure-tolerant — if the
 *  upstream is down we return a zeroed result and the caller can render the
 *  on-chain-only view without crashing. */
export async function getEthenaBacking(): Promise<EthenaBackingResult> {
  try {
    const [statusRaw, positionsRaw] = await Promise.all([
      ethenaFetch<unknown>("/api/collateralization/status"),
      ethenaFetch<unknown>("/api/positions/current/collateral"),
    ])
    const status = StatusResp.parse(statusRaw)
    const positions = PositionsResp.parse(positionsRaw)

    const byExchangeMap = new Map<string, number>()
    for (const c of positions.collateral) {
      const usd = c.usdAmount ?? 0
      if (usd <= 0) continue
      byExchangeMap.set(c.exchange, (byExchangeMap.get(c.exchange) ?? 0) + usd)
    }

    const undelegatedReportedUsd = byExchangeMap.get(UNALLOCATED) ?? 0
    const byExchange: EthenaExchangeRow[] = [...byExchangeMap.entries()]
      .filter(([e]) => e !== UNALLOCATED)
      .map(([e, u]) => ({ exchange: EXCHANGE_LABELS[e] ?? e, usd: u }))
      .sort((a, b) => b.usd - a.usd)
    const delegatedUsd = byExchange.reduce((a, r) => a + r.usd, 0)

    return {
      totalBackingUsd: status.totalBackingAssetsInUsd,
      reserveFundUsd: status.totalReserveFundInUsd,
      tokenSupplyUsd: status.totalTokenSupplyInUsd,
      delegatedUsd,
      undelegatedReportedUsd,
      byExchange,
      failed: false,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(
      `[ethena-flow-monitor] ethena transparency fetch failed: ${reason}`,
    )
    return {
      totalBackingUsd: 0,
      reserveFundUsd: 0,
      tokenSupplyUsd: 0,
      delegatedUsd: 0,
      undelegatedReportedUsd: 0,
      byExchange: [],
      failed: true,
    }
  }
}
