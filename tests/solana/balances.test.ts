import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

const C23 = "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L"
const FAQ = "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"

describe("getEthenaSolanaIdleBalances", () => {
  it("idle rows hold JAAA only; jleUSDG is deployed-bucket (inventory only)", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          return [
            { mint: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG", rawAmount: BigInt("192821471943242"), decimals: 6 },
            { mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", rawAmount: BigInt("32741"), decimals: 6 },
          ]
        }
        return [{ mint: "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc", rawAmount: BigInt("250930298050455"), decimals: 6 }]
      }),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchTokenPrices: vi.fn(async () =>
        new Map([["base-mainnet:0x5a0f93d040de44e78f251b03c43be9cf317dcf64", 1.03757]]),
      ),
      priceKey: (n: string, a: string) => `${n}:${a.toLowerCase()}`,
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () =>
        new Map([["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc", 1.0020312]]),
      ),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    // idle (reconciliation) side: JAAA only, NOT jleUSDG.
    expect(res.rows.map((r) => r.symbol).sort()).toEqual(["JAAA"])
    const jaaa = res.rows.find((r) => r.symbol === "JAAA")!
    expect(jaaa.totalUsd).toBeCloseTo(192821471.943242 * 1.03757, 0)
    expect(jaaa.approx).toBe(true)
    expect(res.totalUsd).toBeCloseTo(jaaa.totalUsd, 0)

    // inventory side: per-wallet on-chain total INCLUDING the deployed jleUSDG.
    const c23 = res.walletTotalUsd.find((w) => w.address === C23)!
    expect(c23.totalUsd).toBeCloseTo(250930298.050455 * 1.0020312, 0) // ~$251.4M
    const faq = res.walletTotalUsd.find((w) => w.address === FAQ)!
    expect(faq.totalUsd).toBeCloseTo(jaaa.totalUsd, 0) // ~$200M
  })

  it("excludes a token (does not zero it) when its price is missing", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async () => [
        { mint: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG", rawAmount: BigInt("192821471943242"), decimals: 6 },
      ]),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchTokenPrices: vi.fn(async () => new Map()), // no price returned
      priceKey: (n: string, a: string) => `${n}:${a.toLowerCase()}`,
    }))
    vi.doMock("@/lib/solana/prices", () => ({ fetchJupiterPrices: vi.fn(async () => new Map()) }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows.some((r) => r.symbol === "JAAA")).toBe(false)
    expect(res.failures.length).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
  })
})
