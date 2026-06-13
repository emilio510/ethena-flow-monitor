/**
 * Tests for auditUntrackedHoldings.
 *
 * The function is alert-only — it must NEVER affect backing totals.
 * BigInt literals use BigInt("...") call form (ES2017 target).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
  vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://api.tokenlogic.xyz")
})

// ─── Token / wallet fixtures ──────────────────────────────────────────────────

const WALLET_A = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"

// A fictional ERC-4626 vault backed by USDC (stable underlying)
const ERC4626_ADDR = "0xaaaa000000000000000000000000000000000001"
const USDC_UNDERLYING = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" // USDC mainnet (in KNOWN_STABLE_UNDERLYINGS)

// A fictional priced ERC-20 (not ERC-4626)
const PRICED_TOKEN_ADDR = "0xbbbb000000000000000000000000000000000002"

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/** Stub alchemy_getTokenBalances to return a fixed set of token balances. */
function stubGetTokenBalances(
  balances: Array<{ contractAddress: string; tokenBalance: string }>,
) {
  vi.doMock("@/lib/onchain/clients", () => ({
    getAlchemyUrl: vi.fn(() => "https://eth-mainnet.g.alchemy.com/v2/test-key"),
    getPublicClient: vi.fn(() => ({
      multicall: vi.fn(async ({ contracts }: { contracts: Array<{ functionName: string; args?: readonly unknown[] }> }) => {
        // Default: all fail (not ERC-4626)
        return contracts.map(() => ({ status: "failure" as const, error: new Error("not ERC-4626") }))
      }),
    })),
  }))

  // Intercept global fetch for alchemy_getTokenBalances
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({
      result: { tokenBalances: balances },
    }),
  })))
}

/** Override the multicall in the client mock for ERC-4626 probes. */
function stubErc4626Multicall(
  erc4626Address: string,
  underlyingAddress: string,
  convertedRaw: bigint,
  tokenSymbol: string,
) {
  vi.doMock("@/lib/onchain/clients", () => ({
    getAlchemyUrl: vi.fn(() => "https://eth-mainnet.g.alchemy.com/v2/test-key"),
    getPublicClient: vi.fn(() => ({
      multicall: vi.fn(
        async ({
          contracts,
        }: {
          contracts: Array<{ address: string; functionName: string; args?: readonly unknown[] }>
        }) => {
          return contracts.map((c) => {
            if (c.address.toLowerCase() !== erc4626Address.toLowerCase()) {
              return { status: "failure" as const, error: new Error("unknown address") }
            }
            if (c.functionName === "asset") {
              return { status: "success" as const, result: underlyingAddress }
            }
            if (c.functionName === "convertToAssets") {
              return { status: "success" as const, result: convertedRaw }
            }
            if (c.functionName === "decimals") {
              return { status: "success" as const, result: BigInt("6") }
            }
            if (c.functionName === "symbol") {
              return { status: "success" as const, result: tokenSymbol }
            }
            return { status: "failure" as const, error: new Error("unexpected") }
          })
        },
      ),
    })),
  }))
}

function stubPrices(map: Map<string, number>) {
  vi.doMock("@/lib/onchain/prices", () => ({
    fetchTokenPrices: vi.fn().mockResolvedValue(map),
    priceKey: (network: string, address: string) => `${network}:${address.toLowerCase()}`,
  }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auditUntrackedHoldings — ERC-4626 stable path", () => {
  it("returns a finding for an ERC-4626 stable vault > $1M not in the exclusion set", async () => {
    // 2_000_000 USDC (6 decimals) underlying — $2M
    const convertedRaw = BigInt("2000000") * BigInt("1000000")

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tokenBalances: [
            { contractAddress: ERC4626_ADDR, tokenBalance: "0x0000000000000000000000000000000000000000000000000000000077359400" },
          ],
        },
      }),
    })))

    stubErc4626Multicall(ERC4626_ADDR, USDC_UNDERLYING, convertedRaw, "TestVault")
    stubPrices(new Map())

    const { auditUntrackedHoldings } = await import("@/lib/onchain/untracked-audit")
    const findings = await auditUntrackedHoldings(new Set<string>())

    const f = findings.find((x) => x.address === ERC4626_ADDR.toLowerCase())
    expect(f).toBeDefined()
    expect(f!.kind).toBe("erc4626-stable")
    expect(f!.valueUsd).toBeCloseTo(2_000_000, 0)
    expect(f!.symbol).toBe("TestVault")
  })

  it("does NOT return a finding when the address is in the exclusion set", async () => {
    const convertedRaw = BigInt("2000000") * BigInt("1000000")

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tokenBalances: [
            { contractAddress: ERC4626_ADDR, tokenBalance: "0x0000000000000000000000000000000000000000000000000000000077359400" },
          ],
        },
      }),
    })))

    stubErc4626Multicall(ERC4626_ADDR, USDC_UNDERLYING, convertedRaw, "TestVault")
    stubPrices(new Map())

    const exclude = new Set<string>([ERC4626_ADDR.toLowerCase()])

    const { auditUntrackedHoldings } = await import("@/lib/onchain/untracked-audit")
    const findings = await auditUntrackedHoldings(exclude)

    expect(findings.find((x) => x.address === ERC4626_ADDR.toLowerCase())).toBeUndefined()
  })

  it("does NOT return a finding for ERC-4626 stable value below $1M", async () => {
    // 500_000 USDC — below $1M threshold
    const convertedRaw = BigInt("500000") * BigInt("1000000")

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tokenBalances: [
            { contractAddress: ERC4626_ADDR, tokenBalance: "0x0000000000000000000000000000000000000000000000000000000077359400" },
          ],
        },
      }),
    })))

    stubErc4626Multicall(ERC4626_ADDR, USDC_UNDERLYING, convertedRaw, "TestVault")
    stubPrices(new Map())

    const { auditUntrackedHoldings } = await import("@/lib/onchain/untracked-audit")
    const findings = await auditUntrackedHoldings(new Set<string>())

    expect(findings.find((x) => x.address === ERC4626_ADDR.toLowerCase())).toBeUndefined()
  })
})

describe("auditUntrackedHoldings — priced token path", () => {
  it("returns a finding for a priced non-ERC-4626 token > $1M", async () => {
    // Raw balance: 1_000_000e18 (18-decimal token) @ $2 = $2M
    const rawHex = "0x" + (BigInt("1000000") * BigInt("10") ** BigInt("18")).toString(16).padStart(64, "0")

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tokenBalances: [
            { contractAddress: PRICED_TOKEN_ADDR, tokenBalance: rawHex },
          ],
        },
      }),
    })))

    // Not ERC-4626: multicall returns failures
    vi.doMock("@/lib/onchain/clients", () => ({
      getAlchemyUrl: vi.fn(() => "https://eth-mainnet.g.alchemy.com/v2/test-key"),
      getPublicClient: vi.fn(() => ({
        multicall: vi.fn(async ({ contracts }: { contracts: unknown[] }) =>
          contracts.map(() => ({ status: "failure" as const, error: new Error("not ERC-4626") })),
        ),
      })),
    }))

    stubPrices(
      new Map([["eth-mainnet:" + PRICED_TOKEN_ADDR.toLowerCase(), 2.0]]),
    )

    const { auditUntrackedHoldings } = await import("@/lib/onchain/untracked-audit")
    const findings = await auditUntrackedHoldings(new Set<string>())

    const f = findings.find((x) => x.address === PRICED_TOKEN_ADDR.toLowerCase())
    expect(f).toBeDefined()
    expect(f!.kind).toBe("priced")
    expect(f!.valueUsd).toBeGreaterThan(1_000_000)
  })

  it("flags a 6-decimal priced token with balance worth ≥$1M (would have been missed under 1e18 hardcode)", async () => {
    // 1_500_000 USDC (6-decimal token) @ $1 = $1.5M
    // raw balance = 1_500_000 * 10**6
    const rawBalance = BigInt("1500000") * BigInt("1000000") // 1.5e12 = 1_500_000_000_000
    const rawHex = "0x" + rawBalance.toString(16).padStart(64, "0")

    // Under the old 1e18 hardcode: 1.5e12 / 1e18 * $1 = $0.0015 — below $1M, no alert.
    // With real 6 decimals:        1.5e12 / 1e6  * $1 = $1.5M   — above $1M, alert fires.

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tokenBalances: [
            { contractAddress: PRICED_TOKEN_ADDR, tokenBalance: rawHex },
          ],
        },
      }),
    })))

    // Not ERC-4626: first multicall (erc4626ProbeAbi with 4 functions) fails;
    // second multicall (decimals-only) returns 6.
    vi.doMock("@/lib/onchain/clients", () => ({
      getAlchemyUrl: vi.fn(() => "https://eth-mainnet.g.alchemy.com/v2/test-key"),
      getPublicClient: vi.fn(() => ({
        multicall: vi.fn(
          async ({
            contracts,
          }: {
            contracts: Array<{ functionName: string; args?: readonly unknown[] }>
          }) => {
            // 4-function ERC-4626 probe → all fail
            if (contracts.length === 4) {
              return contracts.map(() => ({ status: "failure" as const, error: new Error("not ERC-4626") }))
            }
            // 1-function decimals() call → return 6
            return [{ status: "success" as const, result: BigInt("6") }]
          },
        ),
      })),
    }))

    stubPrices(
      new Map([["eth-mainnet:" + PRICED_TOKEN_ADDR.toLowerCase(), 1.0]]),
    )

    const { auditUntrackedHoldings } = await import("@/lib/onchain/untracked-audit")
    const findings = await auditUntrackedHoldings(new Set<string>())

    const f = findings.find((x) => x.address === PRICED_TOKEN_ADDR.toLowerCase())
    expect(f).toBeDefined()
    expect(f!.kind).toBe("priced")
    expect(f!.valueUsd).toBeCloseTo(1_500_000, 0)
  })

  it("does NOT return a finding when the token has no price and is not ERC-4626", async () => {
    // Same large balance — but no price available, so no finding
    const rawHex = "0x" + (BigInt("1000000") * BigInt("10") ** BigInt("18")).toString(16).padStart(64, "0")

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          tokenBalances: [
            { contractAddress: PRICED_TOKEN_ADDR, tokenBalance: rawHex },
          ],
        },
      }),
    })))

    vi.doMock("@/lib/onchain/clients", () => ({
      getAlchemyUrl: vi.fn(() => "https://eth-mainnet.g.alchemy.com/v2/test-key"),
      getPublicClient: vi.fn(() => ({
        multicall: vi.fn(async ({ contracts }: { contracts: unknown[] }) =>
          contracts.map(() => ({ status: "failure" as const, error: new Error("not ERC-4626") })),
        ),
      })),
    }))

    // No price available
    stubPrices(new Map())

    const { auditUntrackedHoldings } = await import("@/lib/onchain/untracked-audit")
    const findings = await auditUntrackedHoldings(new Set<string>())

    expect(findings.find((x) => x.address === PRICED_TOKEN_ADDR.toLowerCase())).toBeUndefined()
  })
})
