import { describe, it, expect } from "vitest"
import { mergeFlows, promoteWallets } from "@/lib/flows/store"
import { buildKnownWalletSet } from "@/config/flows"
import type { Flow } from "@/lib/flows/types"

const NOW = 1_780_000_000
const recent = (over: Partial<Flow>): Flow => ({
  chain: "xrpl", txHash: "H", timestamp: NOW - 1000, from: "rA", to: "rB",
  asset: "RLUSD", amountUsd: 5_000_000, classification: "rebalance", confidence: "high", reason: "r", ...over,
})

describe("mergeFlows", () => {
  it("dedupes by chain+txHash+to+asset and sorts newest first", () => {
    const a = recent({ txHash: "H1", timestamp: NOW - 2000 })
    const b = recent({ txHash: "H2", timestamp: NOW - 1000 })
    const dupOfA = recent({ txHash: "H1", timestamp: NOW - 2000 })
    const merged = mergeFlows([a], [b, dupOfA], NOW)
    expect(merged.map((f) => f.txHash)).toEqual(["H2", "H1"])
  })
  it("incoming wins on a key collision", () => {
    const existing = recent({ txHash: "H1", timestamp: NOW - 2000, reason: "stale" })
    const incoming = recent({ txHash: "H1", timestamp: NOW - 2000, reason: "fresh" })
    const merged = mergeFlows([existing], [incoming], NOW)
    expect(merged).toHaveLength(1)
    expect(merged[0].reason).toBe("fresh")
  })
  it("drops flows older than 90 days", () => {
    const old = recent({ txHash: "OLD", timestamp: NOW - 91 * 86_400 })
    const fresh = recent({ txHash: "NEW", timestamp: NOW - 1000 })
    const merged = mergeFlows([old], [fresh], NOW)
    expect(merged.map((f) => f.txHash)).toEqual(["NEW"])
  })
  it("keeps a flow at exactly the 90-day boundary", () => {
    const boundary = recent({ txHash: "EDGE", timestamp: NOW - 90 * 86_400 })
    const merged = mergeFlows([], [boundary], NOW)
    expect(merged.map((f) => f.txHash)).toEqual(["EDGE"])
  })
})

describe("promoteWallets", () => {
  const known = buildKnownWalletSet([])
  it("promotes high-confidence rebalance destinations to quarantined", () => {
    const flows = [recent({ chain: "xrpl", to: "rNEW", classification: "rebalance", confidence: "high", txHash: "P1" })]
    const out = promoteWallets([], flows, known, NOW)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ address: "rNEW", chain: "xrpl", discoveredVia: "P1", status: "quarantined" })
  })
  it("does NOT promote low-confidence, external, or high-confidence-external", () => {
    const flows = [
      recent({ to: "rLOW", confidence: "low", txHash: "P2" }),
      recent({ to: "rEXT", classification: "external", confidence: "low", txHash: "P3" }),
      // a high-confidence external must still be rejected by the classification guard
      recent({ to: "rEXTHIGH", classification: "external", confidence: "high", txHash: "P3b" }),
    ]
    expect(promoteWallets([], flows, known, NOW)).toHaveLength(0)
  })
  it("is idempotent — does not double-add an already-discovered address", () => {
    const flows = [recent({ to: "rNEW", confidence: "high", txHash: "P4" })]
    const existing = promoteWallets([], flows, known, NOW)
    const again = promoteWallets(existing, flows, known, NOW)
    expect(again).toHaveLength(1)
  })
})
