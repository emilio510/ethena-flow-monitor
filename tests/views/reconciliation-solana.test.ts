import { describe, it, expect } from "vitest"
import { buildReconciliation } from "@/lib/views/reconciliation"
import type { BackingSnapshot } from "@/lib/ethena"
import type { FootprintRow } from "@/lib/views/footprint"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

// Minimal snapshot: RWA strategy reporting JAAA, plus a USDG DeFi-lending leg.
const snapshot = {
  timestamp: "2026-06-12T00:00:00Z",
  strategies: [
    {
      strategy: "RWA",
      value: 200_000_000,
      counterparties: [
        { counterparty: "", value: 200_000_000, assets: [{ asset: "JAAA", value: 200_000_000 }], addressEntries: [] },
      ],
    },
  ],
} as unknown as BackingSnapshot

describe("reconciliation with Solana idle JAAA", () => {
  it("nets JAAA on the on-chain side and verifies it", () => {
    const deployed: FootprintRow[] = []
    const idle: IdleBalanceRow[] = [
      { symbol: "JAAA", totalUsd: 199_700_000, isErc4626: false, approx: true },
    ]
    const recon = buildReconciliation(snapshot, deployed, idle)
    const jaaa = recon.rows.find((r) => r.asset === "JAAA")!
    expect(jaaa.onchainUsd).toBeCloseTo(199_700_000, 0)
    // gap = 300k, tolerance = max(10M, 3% * 200M = 6M) -> verified
    expect(jaaa.status).toBe("verified")
  })

  it("does not double-count: JAAA appears once on the on-chain side", () => {
    const recon = buildReconciliation(
      snapshot,
      [],
      [{ symbol: "JAAA", totalUsd: 199_700_000, isErc4626: false, approx: true }],
    )
    const jaaaRows = recon.rows.filter((r) => r.asset === "JAAA")
    expect(jaaaRows).toHaveLength(1)
  })
})
