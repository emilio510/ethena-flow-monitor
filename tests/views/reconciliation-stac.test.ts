import { describe, it, expect } from "vitest"
import { buildReconciliation } from "@/lib/views/reconciliation"
import type { BackingSnapshot } from "@/lib/ethena"
import type { FootprintRow } from "@/lib/views/footprint"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

// Minimal snapshot: only JAAA reported. STAC not in snapshot (snapshot lag).
const snapshotWithoutStac = {
  timestamp: "2026-06-13T00:00:00Z",
  strategies: [
    {
      strategy: "RWA",
      value: 200_000_000,
      counterparties: [
        {
          counterparty: "",
          value: 200_000_000,
          assets: [{ asset: "JAAA", value: 200_000_000 }],
          addressEntries: [],
        },
      ],
    },
  ],
} as unknown as BackingSnapshot

// STAC idle row from auto-discovery (~$250M)
const STAC_USD = 249_977_000 // ~244961.28 STAC × $1020.44

describe("reconciliation — STAC ours-only (snapshot lag)", () => {
  it("STAC present in idle rows but absent from snapshot → ours-only row with negative gap", () => {
    const deployed: FootprintRow[] = []
    const idle: IdleBalanceRow[] = [
      { symbol: "STAC", totalUsd: STAC_USD, isErc4626: false, approx: true },
      { symbol: "JAAA", totalUsd: 199_700_000, isErc4626: false, approx: true },
    ]

    const recon = buildReconciliation(snapshotWithoutStac, deployed, idle)

    const stacRow = recon.rows.find((r) => r.asset === "STAC")
    expect(stacRow, "STAC should appear as a reconciliation row").toBeDefined()

    // Ethena reported $0 for STAC (not in snapshot)
    expect(stacRow?.ethenaUsd).toBe(0)

    // On-chain we see ~$250M
    expect(stacRow?.onchainUsd).toBeCloseTo(STAC_USD, -3)

    // Gap is negative (on-chain > reported)
    expect(stacRow?.gapUsd).toBeCloseTo(-STAC_USD, -3)

    // Status is "gap" with the snapshot-lag note
    expect(stacRow?.status).toBe("gap")
    expect(stacRow?.note).toContain("snapshot lag")
  })

  it("JAAA still verifies independently when STAC is also present", () => {
    const idle: IdleBalanceRow[] = [
      { symbol: "STAC", totalUsd: STAC_USD, isErc4626: false, approx: true },
      { symbol: "JAAA", totalUsd: 199_700_000, isErc4626: false, approx: true },
    ]
    const recon = buildReconciliation(snapshotWithoutStac, [], idle)
    const jaaaRow = recon.rows.find((r) => r.asset === "JAAA")
    expect(jaaaRow?.status).toBe("verified")
  })

  it("STAC does not appear as a row when it is below the MIN_ROW_USD floor", () => {
    // If STAC somehow had only $500k on-chain, it should be filtered out
    const idle: IdleBalanceRow[] = [
      { symbol: "STAC", totalUsd: 500_000, isErc4626: false, approx: true },
    ]
    const recon = buildReconciliation(snapshotWithoutStac, [], idle)
    const stacRow = recon.rows.find((r) => r.asset === "STAC")
    // Below $1M floor — should not appear
    expect(stacRow).toBeUndefined()
  })
})
