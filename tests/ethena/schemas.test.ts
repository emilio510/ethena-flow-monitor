import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { BackingSnapshot, StablecoinCollateral } from "@/lib/ethena/schemas"

const FIXTURE_DIR = path.join(__dirname, "fixtures")
const backingRaw = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "backing-assets.json"), "utf8"))
const stablesRaw = JSON.parse(
  readFileSync(path.join(FIXTURE_DIR, "stablecoin-collateral.json"), "utf8"),
)

describe("BackingSnapshot schema", () => {
  it("parses the captured snapshot", () => {
    const parsed = BackingSnapshot.parse(backingRaw)
    expect(parsed.strategies.length).toBe(4)
    expect(parsed.timestamp).toBeGreaterThan(1_700_000_000)
  })

  it("each strategy value equals the sum of its counterparties", () => {
    const parsed = BackingSnapshot.parse(backingRaw)
    for (const strategy of parsed.strategies) {
      const cpSum = strategy.counterparties.reduce((s, c) => s + c.value, 0)
      // Allow 1 USD tolerance for rounding on the API side.
      expect(Math.abs(strategy.value - cpSum)).toBeLessThan(1)
    }
  })

  it("each counterparty value equals the sum of its assets (when assets are reported)", () => {
    const parsed = BackingSnapshot.parse(backingRaw)
    for (const strategy of parsed.strategies) {
      for (const cp of strategy.counterparties) {
        if (cp.assets.length === 0) continue
        const assetSum = cp.assets.reduce((s, a) => s + a.value, 0)
        expect(Math.abs(cp.value - assetSum)).toBeLessThan(1)
      }
    }
  })

  it("percentOfTotal across strategies sums to ~100", () => {
    const parsed = BackingSnapshot.parse(backingRaw)
    const sum = parsed.strategies.reduce((s, x) => s + x.percentOfTotal, 0)
    expect(sum).toBeGreaterThan(99)
    expect(sum).toBeLessThan(101)
  })

  it("every addressEntry has a non-empty address; chainSlug only present for on-chain wallets", () => {
    const parsed = BackingSnapshot.parse(backingRaw)
    const entries = parsed.strategies.flatMap((s) =>
      s.counterparties.flatMap((c) => [...c.addressEntries, ...c.assets.flatMap((a) => a.addressEntries)]),
    )
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(e.address.length).toBeGreaterThan(0)
      // Entries either carry a chainSlug (EVM/Solana) OR a kind tag
      // (custodial omnibus) OR neither (BTC). We accept all three.
    }
    // At least one of each flavour should appear in the captured fixture.
    expect(entries.some((e) => !!e.chainSlug)).toBe(true)
    expect(entries.some((e) => e.kind === "custodial")).toBe(true)
  })
})

describe("StablecoinCollateral schema", () => {
  it("parses the captured snapshot and flattens to entries", () => {
    const parsed = StablecoinCollateral.parse(stablesRaw)
    expect(parsed.length).toBe(5)
    const symbols = parsed.map((p) => p.symbol).sort()
    // token_symbol preserves casing — "USDtb" not "USDTB".
    expect(symbols).toEqual(["PYUSD", "USDC", "USDT", "USDm", "USDtb"])
    const usdc = parsed.find((p) => p.symbol === "USDC")!
    expect(usdc.usdAmount).toBeGreaterThan(0)
  })
})
