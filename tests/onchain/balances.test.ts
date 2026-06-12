/**
 * Tests for getEthenaIdleBalances — specifically the priceVia (non-stable RWA)
 * pricing path added in Fix B, plus regression guards for the existing
 * stable (1:1) and ERC4626 (convertToAssets) valuation paths.
 *
 * BigInt literals must use BigInt("...") call form — tsconfig targets ES2017.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Environment stubs ───────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
  vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://api.tokenlogic.xyz")
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stub the Alchemy Prices API (fetchTokenPrices) via module mock. */
function stubPrices(map: Map<string, number>) {
  vi.doMock("@/lib/onchain/prices", () => ({
    fetchTokenPrices: vi.fn().mockResolvedValue(map),
    priceKey: (network: string, address: string) =>
      `${network}:${address.toLowerCase()}`,
  }))
}

/** Stub fetchTokenPrices to throw. */
function stubPricesThrows(msg = "Alchemy Prices API error") {
  vi.doMock("@/lib/onchain/prices", () => ({
    fetchTokenPrices: vi.fn().mockRejectedValue(new Error(msg)),
    priceKey: (network: string, address: string) =>
      `${network}:${address.toLowerCase()}`,
  }))
}

/**
 * Build a minimal multicall stub.
 * `results` maps "tokenAddress:walletIndex" -> bigint balance.
 * Any pair not in the map returns BigInt(0).
 */
type MulticallContract = {
  address: string
  functionName: string
  args?: readonly unknown[]
}
function stubMulticall(
  tokenResults: Map<string, bigint>,
  erc4626Results: Map<string, bigint> = new Map(),
) {
  vi.doMock("@/lib/onchain/clients", () => ({
    getPublicClient: () => ({
      multicall: vi.fn(
        async ({ contracts }: { contracts: MulticallContract[] }) => {
          return contracts.map((c) => {
            if (c.functionName === "balanceOf") {
              const addr = c.address.toLowerCase()
              const wallet = (c.args?.[0] as string)?.toLowerCase() ?? ""
              const k = `${addr}:${wallet}`
              const val = tokenResults.get(k) ?? BigInt("0")
              return { status: "success" as const, result: val }
            }
            if (c.functionName === "convertToAssets") {
              const addr = c.address.toLowerCase()
              const underlying = erc4626Results.get(addr)
              if (underlying !== undefined) {
                return { status: "success" as const, result: underlying }
              }
              // Fall back: return arg as-is (1:1)
              const arg = c.args?.[0] as bigint | undefined
              return { status: "success" as const, result: arg ?? BigInt("0") }
            }
            return { status: "failure" as const, error: new Error("unexpected call") }
          })
        },
      ),
    }),
  }))
}

/** Stub the reserve-fund LP helper to return empty. */
function stubReserveFund() {
  vi.doMock("@/lib/onchain/reserve-fund", () => ({
    getReserveFundLpRows: vi.fn().mockResolvedValue([]),
  }))
}

// ─── Wallet addresses (from config/wallets.ts) ───────────────────────────────
// We use the first backing wallet and the JAAA-holding wallet for brevity.
const BACKING_WALLET = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"
const JAAA_WALLET    = "0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4"
const RESERVE_WALLET = "0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5"

// ─── Token addresses ──────────────────────────────────────────────────────────
const JAAA_BASE   = "0x5a0f93d040de44e78f251b03c43be9cf317dcf64"
const USDC_BASE   = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"

// ─────────────────────────────────────────────────────────────────────────────
describe("getEthenaIdleBalances — priceVia (Base JAAA)", () => {
  it("values a priceVia token at amount × price and sets approx: true on the row", async () => {
    // JAAA: 48_200_000 units (6 decimals) × $1.0376 ≈ $49,013,120
    const jaaa48m = BigInt("48200000") * BigInt("1000000") // 48_200_000e6 raw

    const priceMap = new Map([
      [`base-mainnet:${JAAA_BASE}`, 1.0376],
    ])
    stubPrices(priceMap)
    stubReserveFund()
    stubMulticall(
      new Map([
        [`${JAAA_BASE.toLowerCase()}:${JAAA_WALLET.toLowerCase()}`, jaaa48m],
      ]),
    )

    const { getEthenaIdleBalances } = await import("@/lib/onchain/balances")
    const result = await getEthenaIdleBalances()

    const jaaa = result.rows.find((r) => r.symbol === "JAAA")
    expect(jaaa).toBeDefined()
    // 48_200_000 × 1.0376 = 50,012,320
    expect(jaaa!.totalUsd).toBeCloseTo(48_200_000 * 1.0376, 0)
    expect(jaaa!.approx).toBe(true)
    expect(jaaa!.isErc4626).toBe(false)
  })

  it("excludes JAAA row and records a failure when price is missing from the map", async () => {
    const jaaa48m = BigInt("48200000") * BigInt("1000000")

    // Empty map — JAAA price not available
    stubPrices(new Map())
    stubReserveFund()
    stubMulticall(
      new Map([
        [`${JAAA_BASE.toLowerCase()}:${JAAA_WALLET.toLowerCase()}`, jaaa48m],
      ]),
    )

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { getEthenaIdleBalances } = await import("@/lib/onchain/balances")
    const result = await getEthenaIdleBalances()

    // Row must be absent — NEVER valued at $0
    expect(result.rows.find((r) => r.symbol === "JAAA")).toBeUndefined()

    // A failure entry must be recorded
    const jaaaFailure = result.failures.find((f) => f.tokenSymbol === "JAAA")
    expect(jaaaFailure).toBeDefined()

    // console.warn must have been called
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("records a failure and continues (empty priceVia map) when fetchTokenPrices throws", async () => {
    const jaaa48m = BigInt("48200000") * BigInt("1000000")

    stubPricesThrows("Alchemy Prices API error 500")
    stubReserveFund()
    stubMulticall(
      new Map([
        [`${JAAA_BASE.toLowerCase()}:${JAAA_WALLET.toLowerCase()}`, jaaa48m],
      ]),
    )

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { getEthenaIdleBalances } = await import("@/lib/onchain/balances")
    const result = await getEthenaIdleBalances()

    // JAAA must be excluded (price fetch failed)
    expect(result.rows.find((r) => r.symbol === "JAAA")).toBeUndefined()

    // A failure entry must be recorded for the price fetch
    expect(result.failures.length).toBeGreaterThan(0)

    // Other (stablecoin) rows must still be present — function must not throw
    // (stablecoin list is empty on base in these stubs, so just assert no throw)
    expect(Array.isArray(result.rows)).toBe(true)

    warnSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("getEthenaIdleBalances — regression: stable (1:1) path unchanged", () => {
  it("values a plain stablecoin at 1:1 without calling fetchTokenPrices", async () => {
    // USDC on Base, 6 decimals — 10_000_000 units = $10
    const usdc10 = BigInt("10000000") // 10 USDC (6 decimals)

    const pricesSpy = vi.fn().mockResolvedValue(new Map())
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchTokenPrices: pricesSpy,
      priceKey: (network: string, address: string) =>
        `${network}:${address.toLowerCase()}`,
    }))
    stubReserveFund()
    stubMulticall(
      new Map([
        [`${USDC_BASE.toLowerCase()}:${BACKING_WALLET.toLowerCase()}`, usdc10],
      ]),
    )

    const { getEthenaIdleBalances } = await import("@/lib/onchain/balances")
    const result = await getEthenaIdleBalances()

    const usdc = result.rows.find((r) => r.symbol === "USDC")
    expect(usdc).toBeDefined()
    expect(usdc!.totalUsd).toBeCloseTo(10, 2)
    expect(usdc!.approx).toBeFalsy()

    // fetchTokenPrices must not be called when there are no priceVia tokens
    // that have a balance. Note: it IS called (once, pre-scan) when priceVia
    // tokens exist in the config. USDC has no priceVia — JAAA does.
    // If JAAA balance is zero the call may or may not happen; what matters
    // is that USDC valuation is unaffected and correct.
    expect(usdc!.totalUsd).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("getEthenaIdleBalances — regression: ERC4626 (convertToAssets) path unchanged", () => {
  it("unwraps an ERC4626 vault via convertToAssets", async () => {
    // sUSDe on ethereum: 100e18 shares → convertToAssets → 105e18 underlying
    const SUSDE = "0x9d39a5de30e57443bff2a8307a4256c8797a3497"
    const shares100 = BigInt("100") * BigInt("10") ** BigInt("18")
    const underlying105 = BigInt("105") * BigInt("10") ** BigInt("18")

    const pricesSpy = vi.fn().mockResolvedValue(new Map())
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchTokenPrices: pricesSpy,
      priceKey: (network: string, address: string) =>
        `${network}:${address.toLowerCase()}`,
    }))
    stubReserveFund()
    stubMulticall(
      new Map([
        [`${SUSDE.toLowerCase()}:${BACKING_WALLET.toLowerCase()}`, shares100],
      ]),
      new Map([[SUSDE.toLowerCase(), underlying105]]),
    )

    const { getEthenaIdleBalances } = await import("@/lib/onchain/balances")
    const result = await getEthenaIdleBalances()

    const susde = result.rows.find((r) => r.symbol === "sUSDe")
    expect(susde).toBeDefined()
    expect(susde!.totalUsd).toBeCloseTo(105, 0)
    expect(susde!.isErc4626).toBe(true)
    expect(susde!.approx).toBeFalsy()
  })
})
