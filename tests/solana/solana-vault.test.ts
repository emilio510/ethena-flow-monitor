import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const SOLANA_FIXTURES = path.join(__dirname, "fixtures")
const ETHENA_FIXTURES = path.join(__dirname, "..", "ethena", "fixtures")

const read = (dir: string, file: string) =>
  JSON.parse(readFileSync(path.join(dir, file), "utf8"))

const backing = read(ETHENA_FIXTURES, "backing-assets.json")
const kvault = read(SOLANA_FIXTURES, "kamino-vault-metrics.json")
const kreserves = read(SOLANA_FIXTURES, "kamino-reserves-metrics.json")
const fluidLending = read(SOLANA_FIXTURES, "fluid-lending-tokens.json")
const fluidBorrowing = read(SOLANA_FIXTURES, "fluid-borrowing-vaults.json")

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }
}

/** Route each outbound fetch to the right fixture by URL. */
function stubRoutedFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes("app.ethena.fi")) return jsonResponse(backing)
      if (u.includes("/kvaults/")) return jsonResponse(kvault)
      if (u.includes("reserves/metrics")) return jsonResponse(kreserves)
      if (u.includes("fluid.io") && u.includes("lending")) return jsonResponse(fluidLending)
      if (u.includes("fluid.io") && u.includes("borrowing")) return jsonResponse(fluidBorrowing)
      throw new Error(`unexpected fetch in test: ${u}`)
    }),
  )
}

describe("pairRisk", () => {
  it("derives current LTV, health factor and leverage from collateral + debt", async () => {
    const { pairRisk } = await import("@/lib/views/solana-vault")
    // $279.3M USDe collateral, $251.03M USDG debt, 94% liquidation threshold.
    const r = pairRisk(279_300_000, 251_030_000, 0.94)
    expect(r.currentLtv).toBeCloseTo(0.8988, 3)
    expect(r.healthFactor).toBeCloseTo(1.0458, 3)
    expect(r.leverage).toBeCloseTo(9.88, 1)
  })

  it("treats a zero-debt position as unlevered with no health constraint", async () => {
    const { pairRisk } = await import("@/lib/views/solana-vault")
    const r = pairRisk(100, 0, 0.94)
    expect(r.currentLtv).toBe(0)
    expect(r.healthFactor).toBeNull()
    expect(r.leverage).toBe(1)
  })

  it("returns null leverage when debt fully consumes collateral", async () => {
    const { pairRisk } = await import("@/lib/views/solana-vault")
    const r = pairRisk(100, 100, 0.94)
    expect(r.currentLtv).toBe(1)
    expect(r.leverage).toBeNull()
  })
})

describe("resolveSolanaProtocol / isSolanaVaultAddress", () => {
  it("maps the two known vault addresses, rejects others", async () => {
    const { resolveSolanaProtocol, isSolanaVaultAddress } = await import(
      "@/lib/views/solana-vault"
    )
    const { KAMINO_ETHENA_PRIME_VAULT } = await import("@/lib/solana/kamino")
    const { JUPITER_ETHENA_LENDING_VAULT } = await import("@/lib/solana/fluid")
    expect(resolveSolanaProtocol(KAMINO_ETHENA_PRIME_VAULT)).toBe("KAMINO")
    expect(resolveSolanaProtocol(JUPITER_ETHENA_LENDING_VAULT)).toBe("JUPITER LEND")
    expect(resolveSolanaProtocol("not-a-vault")).toBeNull()
    expect(isSolanaVaultAddress(KAMINO_ETHENA_PRIME_VAULT)).toBe(true)
    expect(isSolanaVaultAddress("not-a-vault")).toBe(false)
  })
})

describe("loadSolanaVaultView — Kamino", () => {
  it("dust-filters the 6-reserve market down to USDe + USDG", async () => {
    stubRoutedFetch()
    const { loadSolanaVaultView } = await import("@/lib/views/solana-vault")
    const { KAMINO_ETHENA_PRIME_VAULT } = await import("@/lib/solana/kamino")
    const view = await loadSolanaVaultView(KAMINO_ETHENA_PRIME_VAULT)

    expect(view.protocol).toBe("KAMINO")
    // PYUSD / sUSDe / USDT / USDC are sub-$1M dust — filtered out.
    expect(view.composition.length).toBe(2)
    expect(view.composition.every((r) => r.kind === "reserve")).toBe(true)
    expect(new Set(view.composition.map((r) => r.label))).toEqual(new Set(["USDe", "USDG"]))
    // Reserve rows carry utilization, not pair metrics.
    const usdg = view.composition.find((r) => r.label === "USDG")!
    expect(usdg.utilization).toBeGreaterThan(0.9)
    expect(usdg.currentLtv).toBeNull()
    expect(usdg.isOutflowLeg).toBe(true)
  })
})

describe("loadSolanaVaultView — Jupiter", () => {
  it("shows only the USDG-borrow leg with pair risk metrics", async () => {
    stubRoutedFetch()
    const { loadSolanaVaultView } = await import("@/lib/views/solana-vault")
    const { JUPITER_ETHENA_LENDING_VAULT } = await import("@/lib/solana/fluid")
    const view = await loadSolanaVaultView(JUPITER_ETHENA_LENDING_VAULT)

    expect(view.protocol).toBe("JUPITER LEND")
    // WSOL→USDe is a different market; WSOL→USDG is dust. Only USDe→USDG.
    expect(view.composition.length).toBe(1)
    const pair = view.composition[0]!
    expect(pair.kind).toBe("pair")
    expect(pair.label).toBe("USDe → USDG")
    expect(pair.isOutflowLeg).toBe(true)

    // The bug fix: this row carries currentLtv (debt/collateral), NOT a
    // utilization that conflates the two.
    expect(pair.utilization).toBeNull()
    expect(pair.currentLtv).toBeGreaterThan(0)
    expect(pair.currentLtv).toBeLessThan(1) // overcollateralised
    expect(pair.healthFactor).toBeGreaterThan(1) // solvent
    expect(pair.leverage).toBeGreaterThan(1)

    // currentLtv must sit below the liquidation threshold.
    expect(pair.currentLtv!).toBeLessThan(pair.liquidationThreshold!)
  })

  it("vault-level utilization stays ~100% (USDG pool fully lent)", async () => {
    stubRoutedFetch()
    const { loadSolanaVaultView } = await import("@/lib/views/solana-vault")
    const { JUPITER_ETHENA_LENDING_VAULT } = await import("@/lib/solana/fluid")
    const view = await loadSolanaVaultView(JUPITER_ETHENA_LENDING_VAULT)
    expect(view.utilization).toBeGreaterThan(0.95)
  })
})
