import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

const STAC_MINT = "u49MwZqu4bHRHRsciaBarHK7JZDYGxuaNnwyMBdEKYk"
const JLEUSDG_MINT = "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const USDG_MINT = "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"
// A mint we can't identify or price — should be excluded + failure + warn
const MYSTERY_MINT = "MysteryMintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"

const FAQ = "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"
const C23 = "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L"

// STAC: 244961279015 base units, decimals 6 → 244961.279015 STAC × $1020.44 ≈ $249,977,xxx
const STAC_RAW = BigInt("244961279015")
const STAC_DECIMALS = 6
const STAC_PRICE = 1020.44
const STAC_EXPECTED_USD = (Number(STAC_RAW) / 10 ** STAC_DECIMALS) * STAC_PRICE

describe("getEthenaSolanaIdleBalances — STAC auto-discovery", () => {
  it("STAC (unknown mint) → DAS-identified + by-symbol priced → idle row ~$250M, approx:true", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          return [{ mint: STAC_MINT, rawAmount: STAC_RAW, decimals: STAC_DECIMALS }]
        }
        return []
      }),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[STAC_MINT, { symbol: "STAC", name: "Securitize Tokenized AAA CLO Fund" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map([["STAC", STAC_PRICE]])),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    const stacRow = res.rows.find((r) => r.symbol === "STAC")
    expect(stacRow, "STAC should appear as an idle row").toBeDefined()
    expect(stacRow?.totalUsd).toBeCloseTo(STAC_EXPECTED_USD, -3) // within ~$1k
    expect(stacRow?.approx).toBe(true)
    expect(res.failures).toHaveLength(0)
  })

  it("jleUSDG (DEPLOYED mint) → NOT in rows but counted in walletTotalUsd", async () => {
    const JLEUSDG_RAW = BigInt("250930298050455")
    const JLEUSDG_PRICE = 1.0020312
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === C23) {
          return [{ mint: JLEUSDG_MINT, rawAmount: JLEUSDG_RAW, decimals: 6 }]
        }
        return []
      }),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map([[JLEUSDG_MINT, JLEUSDG_PRICE]])),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    // jleUSDG must NOT appear as an idle row
    expect(res.rows.find((r) => r.symbol === "jleUSDG")).toBeUndefined()
    expect(res.totalUsd).toBe(0) // no idle rows

    // but must be counted in the wallet inventory
    const c23 = res.walletTotalUsd.find((w) => w.address === C23)
    expect(c23).toBeDefined()
    expect(c23?.totalUsd).toBeCloseTo(
      (Number(JLEUSDG_RAW) / 10 ** 6) * JLEUSDG_PRICE,
      0,
    )
  })

  it("USDC dust (0.0029 USD) → dropped after pricing (<$1 floor)", async () => {
    // 2900 base units, decimals 6 → $0.0029
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async () => [
        { mint: USDC_MINT, rawAmount: BigInt("2900"), decimals: 6 },
      ]),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows.find((r) => r.symbol === "USDC")).toBeUndefined()
    expect(res.totalUsd).toBe(0)
  })

  it("USDG (2u1tsz) is valued as a $1 peg stable, NOT denied", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) =>
        owner === C23
          ? // 1000 USDG (6 decimals) — previously wrongly deny-listed as dust.
            [{ mint: USDG_MINT, rawAmount: BigInt("1000000000"), decimals: 6 }]
          : [],
      ),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    const usdg = res.rows.find((r) => r.symbol === "USDG")
    expect(usdg).toBeDefined()
    expect(usdg!.totalUsd).toBeCloseTo(1000, 0)
    expect(res.failures).toHaveLength(0)
  })

  it("unidentified mint with big balance → excluded + failure entry + console.warn (NOT valued)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async () => [
        { mint: MYSTERY_MINT, rawAmount: BigInt("100000000000000"), decimals: 6 },
      ]),
    }))
    // DAS returns no identity for this mint
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map()),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows).toHaveLength(0)
    expect(res.totalUsd).toBe(0)
    expect(res.failures.length).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
  })

  it("unpriced-but-identified mint with big balance → excluded + failure entry + console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async () => [
        { mint: MYSTERY_MINT, rawAmount: BigInt("100000000000000"), decimals: 6 },
      ]),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      // DAS identifies it but by-symbol has no price
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[MYSTERY_MINT, { symbol: "MYSTERY", name: "Mystery Token" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map()), // empty — no price
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows).toHaveLength(0)
    expect(res.totalUsd).toBe(0)
    expect(res.failures.length).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
  })

  it("walletTotalUsd includes both idle and deployed value for a mixed wallet", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          return [
            { mint: STAC_MINT, rawAmount: STAC_RAW, decimals: STAC_DECIMALS },
            { mint: JLEUSDG_MINT, rawAmount: BigInt("1000000000"), decimals: 6 },
          ]
        }
        return []
      }),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[STAC_MINT, { symbol: "STAC", name: "Securitize Tokenized AAA CLO Fund" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map([["STAC", STAC_PRICE]])),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map([[JLEUSDG_MINT, 1.002]])),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    const faq = res.walletTotalUsd.find((w) => w.address === FAQ)
    expect(faq).toBeDefined()
    // Should include idle (STAC) + deployed (jleUSDG)
    const expectedIdle = STAC_EXPECTED_USD
    const expectedDeployed = (Number(BigInt("1000000000")) / 10 ** 6) * 1.002
    expect(faq?.totalUsd).toBeCloseTo(expectedIdle + expectedDeployed, -3)

    // jleUSDG still not in idle rows
    expect(res.rows.find((r) => r.symbol === "jleUSDG")).toBeUndefined()
    expect(res.rows.find((r) => r.symbol === "STAC")).toBeDefined()
  })
})

// Canonical-mint guard tests (SOLANA_RWA_MINTS)
// A spoofed mint claiming a known RWA symbol must be REJECTED.
// A genuinely new unknown symbol must route to failures (untracked alert).
const SPOOFED_STAC_MINT = "SpoofMintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

describe("getEthenaSolanaIdleBalances — canonical-mint guard", () => {
  it("STAC at its canonical mint → still valued idle ~$250M, approx:true (regression)", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          return [{ mint: STAC_MINT, rawAmount: STAC_RAW, decimals: STAC_DECIMALS }]
        }
        return []
      }),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[STAC_MINT, { symbol: "STAC", name: "Securitize Tokenized AAA CLO Fund" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map([["STAC", STAC_PRICE]])),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    const stacRow = res.rows.find((r) => r.symbol === "STAC")
    expect(stacRow, "canonical STAC must still produce an idle row").toBeDefined()
    expect(stacRow?.totalUsd).toBeCloseTo(STAC_EXPECTED_USD, -3)
    expect(stacRow?.approx).toBe(true)
    expect(res.failures).toHaveLength(0)
  })

  it("spoofed mint claiming 'STAC' → REJECTED: not in rows, failure recorded, console.warn called", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          // different mint, DAS claims symbol "STAC"
          return [{ mint: SPOOFED_STAC_MINT, rawAmount: STAC_RAW, decimals: STAC_DECIMALS }]
        }
        return []
      }),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[SPOOFED_STAC_MINT, { symbol: "STAC", name: "Fake STAC" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      // price call should NOT happen for the spoofed mint, but even if it does,
      // the result must not appear in rows
      fetchPricesBySymbol: vi.fn(async () => new Map([["STAC", STAC_PRICE]])),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows.find((r) => r.symbol === "STAC")).toBeUndefined()
    expect(res.totalUsd).toBe(0)
    expect(res.failures.length).toBeGreaterThan(0)
    const spoof = res.failures.find((f) => f.source.includes("spoof"))
    expect(spoof, "failure source must include 'spoof'").toBeDefined()
    expect(warn).toHaveBeenCalled()
  })

  it("genuinely new symbol 'FOO' (not in SOLANA_RWA_MINTS) → NOT valued, routed to failures as untracked, warn called", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const FOO_MINT = "FooMintCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          return [{ mint: FOO_MINT, rawAmount: BigInt("5000000000"), decimals: 6 }]
        }
        return []
      }),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[FOO_MINT, { symbol: "FOO", name: "Foo Protocol Token" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      // by-symbol returns a price for FOO — but it must still be excluded (untracked symbol)
      fetchPricesBySymbol: vi.fn(async () => new Map([["FOO", 10.0]])),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows.find((r) => r.symbol === "FOO")).toBeUndefined()
    expect(res.totalUsd).toBe(0)
    const untracked = res.failures.find((f) => f.source.includes("untracked"))
    expect(untracked, "failure source must include 'untracked'").toBeDefined()
    expect(warn).toHaveBeenCalled()
  })

  it("approx flag is sticky across wallet iterations — second wallet with same symbol preserves approx:true", async () => {
    // Two wallets each hold STAC (canonical mint). approx must be true on the aggregated row
    // regardless of wallet iteration order.
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async () => [
        { mint: STAC_MINT, rawAmount: BigInt("100000000000"), decimals: STAC_DECIMALS },
      ]),
    }))
    vi.doMock("@/lib/solana/das", () => ({
      fetchAssetIdentities: vi.fn(async () =>
        new Map([[STAC_MINT, { symbol: "STAC", name: "Securitize Tokenized AAA CLO Fund" }]]),
      ),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchPricesBySymbol: vi.fn(async () => new Map([["STAC", STAC_PRICE]])),
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () => new Map()),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    const stacRow = res.rows.find((r) => r.symbol === "STAC")
    expect(stacRow).toBeDefined()
    // approx must be sticky — true because the auto path produced it,
    // even when aggregated across wallets
    expect(stacRow?.approx).toBe(true)
  })
})
