import { describe, it, expect } from "vitest"
import { classifyFlow, classifyNewAddress, type DestHoldings } from "@/lib/flows/classify"
import { buildKnownWalletSet, USDE_MINT_REDEEM } from "@/config/flows"
import { RLUSD_ISSUER } from "@/config/xrpl"
import { ETHENA_XRPL_WALLETS } from "@/config/xrpl"
import type { RawFlow } from "@/lib/flows/types"

const known = buildKnownWalletSet([])
const base: RawFlow = {
  chain: "xrpl", txHash: "h", timestamp: 1, from: ETHENA_XRPL_WALLETS[0],
  to: "rDest", asset: "RLUSD", amountUsd: 5_000_000,
}

describe("classifyFlow", () => {
  it("flags a send to the redeem sink as redeem/high", () => {
    const r = classifyFlow({ ...base, to: RLUSD_ISSUER }, known, null)
    expect(r).toMatchObject({ classification: "redeem", confidence: "high" })
  })
  it("flags a send to a known Ethena wallet as rebalance/high", () => {
    const r = classifyFlow({ ...base, to: ETHENA_XRPL_WALLETS[1] }, known, null)
    expect(r).toMatchObject({ classification: "rebalance", confidence: "high" })
  })
  it("flags a probable-Ethena new address as rebalance with the probe's confidence", () => {
    const probe = { isProbableEthena: true, confidence: "high" as const, reason: "single RLUSD trust line" }
    const r = classifyFlow(base, known, probe)
    expect(r).toMatchObject({ classification: "rebalance", confidence: "high", reason: "single RLUSD trust line" })
  })
  it("flags an unrecognized destination as external/low", () => {
    const probe = { isProbableEthena: false, confidence: "low" as const, reason: "holds non-Ethena tokens: SHIB" }
    const r = classifyFlow(base, known, probe)
    expect(r).toMatchObject({ classification: "external", confidence: "low" })
  })
  it("normalizes EVM destination case when checking the known set", () => {
    const evmKnown = buildKnownWalletSet([
      { address: "0xAaaa000000000000000000000000000000000001", chain: "ethereum", discoveredVia: "x", firstSeen: 0, status: "quarantined" },
    ])
    const r = classifyFlow(
      { ...base, chain: "ethereum", to: "0xAAAA000000000000000000000000000000000001", asset: "USDe" },
      evmKnown, null,
    )
    expect(r.classification).toBe("rebalance")
  })
})

describe("classifyNewAddress", () => {
  it("XRPL single RLUSD trust line is high-confidence Ethena", () => {
    const h: DestHoldings = { chain: "xrpl", tokens: ["RLUSD"], trustLineCount: 1 }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: true, confidence: "high" })
  })
  it("EVM holding only Ethena stables is probable but low-confidence", () => {
    const h: DestHoldings = { chain: "ethereum", tokens: ["USDe", "USDC"] }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: true, confidence: "low" })
  })
  it("any non-Ethena token makes it not-probable", () => {
    const h: DestHoldings = { chain: "ethereum", tokens: ["USDe", "PEPE"] }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: false })
  })
  it("empty holdings are not probable", () => {
    const h: DestHoldings = { chain: "xrpl", tokens: [], trustLineCount: 0 }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: false })
  })
})
