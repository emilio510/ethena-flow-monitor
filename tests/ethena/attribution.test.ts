import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { BackingSnapshot } from "@/lib/ethena/schemas"
import {
  classifyAddress,
  custodialValue,
  flattenWallets,
  totalBacking,
} from "@/lib/ethena/attribution"

const snapshot = BackingSnapshot.parse(
  JSON.parse(
    readFileSync(path.join(__dirname, "fixtures", "backing-assets.json"), "utf8"),
  ),
)

describe("classifyAddress", () => {
  it.each([
    ["custodial", "custodial"],
    ["mixed", "mixed"],
    ["0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c", "evm"],
    ["C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L", "solana"],
    ["3AYoePduLTgydPt6cXHgj5R8eczY3kmjKx", "btc"],
    ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "btc"],
    ["", "unknown"],
  ] as const)("classifies %s as %s", (input, kind) => {
    expect(classifyAddress(input)).toBe(kind)
  })
})

describe("totalBacking", () => {
  it("sums to roughly the headline figure", () => {
    const total = totalBacking(snapshot)
    // Fixture snapshot was ~$4.446B at capture time.
    expect(total).toBeGreaterThan(4_000_000_000)
    expect(total).toBeLessThan(5_000_000_000)
  })
})

describe("custodialValue", () => {
  it("captures Crypto Basis and Institutional Lending only", () => {
    const custodial = custodialValue(snapshot)
    const cryptoBasis = snapshot.strategies.find((s) => s.strategy === "Crypto Basis")!
    const institutional = snapshot.strategies.find((s) => s.strategy === "Institutional Lending")!
    const expected = cryptoBasis.value + institutional.value
    expect(Math.abs(custodial - expected)).toBeLessThan(1)
  })

  it("excludes DeFi Lending and Liquid Stables (they have on-chain anchors or aggregate entries)", () => {
    const custodial = custodialValue(snapshot)
    const total = totalBacking(snapshot)
    // Custodial portion should be a small slice (~1%) of the total.
    expect(custodial / total).toBeLessThan(0.05)
  })
})

describe("flattenWallets", () => {
  it("emits one row per (address, chainSlug, asset) leaf with an addressEntry", () => {
    const rows = flattenWallets(snapshot)
    expect(rows.length).toBeGreaterThan(0)
    // Every row carries a non-zero value (we skip aggregate-only assets).
    for (const row of rows) {
      expect(row.value).toBeGreaterThan(0)
      expect(row.address.length).toBeGreaterThan(0)
      expect(row.chainSlug.length).toBeGreaterThan(0)
    }
  })

  it("includes the 0xb8734a14… treasury wallet across multiple chains", () => {
    const rows = flattenWallets(snapshot)
    const treasuryChains = new Set(
      rows
        .filter(
          (r) => r.address.toLowerCase() === "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
        )
        .map((r) => r.chainSlug),
    )
    // The fixture shows this wallet on ethereum + plasma + mantle + megaeth.
    expect(treasuryChains.size).toBeGreaterThanOrEqual(3)
  })

  it("does not emit rows for purely-custodial counterparties", () => {
    const rows = flattenWallets(snapshot)
    const labels = new Set(rows.map((r) => r.counterparty))
    expect(labels.has("INTX")).toBe(false)
  })
})
