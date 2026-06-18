import { describe, it, expect } from "vitest"
import { buildReconciliation } from "@/lib/views/reconciliation"
import type { BackingSnapshot } from "@/lib/ethena"
import type { FootprintRow } from "@/lib/views/footprint"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

// Ethena reports the Maple position as the "Maple Institutional" counterparty
// under Institutional Lending — no asset breakdown, just a value.
const ETHENA_MAPLE_USD = 50_038_375

// We verify the same position on-chain via the MPLhysUSDC1 ERC4626 share.
const ONCHAIN_MAPLE_USD = 50_020_000

const snapshotWithMaple = {
  timestamp: "2026-06-13T00:00:00Z",
  strategies: [
    {
      strategy: "Institutional Lending",
      value: ETHENA_MAPLE_USD,
      counterparties: [
        {
          counterparty: "Maple Institutional",
          value: ETHENA_MAPLE_USD,
          assets: [],
          addressEntries: [],
        },
      ],
    },
  ],
} as unknown as BackingSnapshot

describe("reconciliation — Maple Institutional ↔ MPLhysUSDC1 dedup", () => {
  it("folds the on-chain MPLhysUSDC1 balance into the Maple Institutional row", () => {
    const deployed: FootprintRow[] = []
    const idle: IdleBalanceRow[] = [
      { symbol: "MPLhysUSDC1", totalUsd: ONCHAIN_MAPLE_USD, isErc4626: true, approx: false },
    ]

    const recon = buildReconciliation(snapshotWithMaple, deployed, idle)

    // Single reconciled row keyed by the Ethena counterparty name.
    const mapleRow = recon.rows.find((r) => r.asset === "Maple Institutional")
    expect(mapleRow, "Maple Institutional row should exist").toBeDefined()
    expect(mapleRow?.ethenaUsd).toBe(ETHENA_MAPLE_USD)
    expect(mapleRow?.onchainUsd).toBeCloseTo(ONCHAIN_MAPLE_USD, -3)

    // The on-chain balance reconciles → verified, no false gap.
    expect(mapleRow?.status).toBe("verified")

    // No stray MPLhysUSDC1 row — it was folded into Maple Institutional.
    expect(recon.rows.find((r) => r.asset === "MPLhysUSDC1")).toBeUndefined()
  })
})
