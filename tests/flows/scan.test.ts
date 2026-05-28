import { describe, it, expect } from "vitest"
import { runScan, type ScanDeps } from "@/lib/flows/scan"
import { RLUSD_ISSUER, ETHENA_XRPL_WALLETS } from "@/config/xrpl"
import type { RawFlow } from "@/lib/flows/types"
import type { DestHoldings } from "@/lib/flows/classify"

const NOW = 1_780_000_000
const ts = NOW - 1000

function deps(over: Partial<ScanDeps>): ScanDeps {
  return {
    scanXrpl: async () => [],
    scanEvm: async () => [],
    probe: async () => ({ chain: "xrpl", tokens: [], trustLineCount: 0 } as DestHoldings),
    ...over,
  }
}

describe("runScan", () => {
  it("classifies a redeem (to issuer) without probing", async () => {
    const raw: RawFlow = { chain: "xrpl", txHash: "R1", timestamp: ts, from: ETHENA_XRPL_WALLETS[0], to: RLUSD_ISSUER, asset: "RLUSD", amountUsd: 5_000_000 }
    const { flows } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({ scanXrpl: async () => [raw] }),
    )
    expect(flows[0]).toMatchObject({ classification: "redeem", confidence: "high" })
  })
  it("classifies a probable new XRPL address as rebalance/high and promotes it", async () => {
    const raw: RawFlow = { chain: "xrpl", txHash: "R2", timestamp: ts, from: ETHENA_XRPL_WALLETS[0], to: "rFRESH", asset: "RLUSD", amountUsd: 80_000_000 }
    const { flows, discovered } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({
        scanXrpl: async () => [raw],
        probe: async () => ({ chain: "xrpl", tokens: ["RLUSD"], trustLineCount: 1 }),
      }),
    )
    expect(flows[0]).toMatchObject({ classification: "rebalance", confidence: "high" })
    expect(discovered).toHaveLength(1)
    expect(discovered[0].address).toBe("rFRESH")
  })
  it("classifies a noisy new address as external/low and does NOT promote", async () => {
    const raw: RawFlow = { chain: "ethereum", txHash: "0xR3", timestamp: ts, from: "0xfrom", to: "0xexchange", asset: "USDe", amountUsd: 5_000_000 }
    const { flows, discovered } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({
        scanEvm: async () => [raw],
        probe: async () => ({ chain: "ethereum", tokens: ["USDe", "WETH", "PEPE"] }),
      }),
    )
    expect(flows[0]).toMatchObject({ classification: "external", confidence: "low" })
    expect(discovered).toHaveLength(0)
  })
  it("survives a scanner that throws (logs, returns the other chain's flows)", async () => {
    const raw: RawFlow = { chain: "xrpl", txHash: "R4", timestamp: ts, from: ETHENA_XRPL_WALLETS[0], to: RLUSD_ISSUER, asset: "RLUSD", amountUsd: 5_000_000 }
    const { flows } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({ scanXrpl: async () => [raw], scanEvm: async () => { throw new Error("rpc down") } }),
    )
    expect(flows).toHaveLength(1)
  })
})
