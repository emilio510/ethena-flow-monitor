import { describe, it, expect } from "vitest"
import { buildReconciliation } from "@/lib/views/reconciliation"
import type { BackingSnapshot } from "@/lib/ethena"
import type { FootprintRow } from "@/lib/views/footprint"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

/** Minimal snapshot builder — one strategy, one counterparty, given assets. */
function snapshot(
  assets: { asset: string; value: number }[],
  noAssetCounterparties: { counterparty: string; value: number }[] = [],
): BackingSnapshot {
  return {
    timestamp: 1_779_000_000,
    strategies: [
      {
        strategy: "Liquid Stables",
        aprMin: null,
        aprMax: null,
        percentOfTotal: 100,
        value: assets.reduce((s, a) => s + a.value, 0),
        addressEntries: [],
        counterparties: [
          {
            counterparty: "X",
            aprMin: null,
            aprMax: null,
            percentOfTotal: 100,
            value: assets.reduce((s, a) => s + a.value, 0),
            addressEntries: [],
            assets: assets.map((a) => ({
              asset: a.asset,
              value: a.value,
              percentOfTotal: 0,
              aprMin: null,
              aprMax: null,
              addressEntries: [],
            })),
          },
          ...noAssetCounterparties.map((c) => ({
            counterparty: c.counterparty,
            aprMin: null,
            aprMax: null,
            percentOfTotal: 0,
            value: c.value,
            addressEntries: [],
            assets: [],
          })),
        ],
      },
    ],
  } as BackingSnapshot
}

const idle = (rows: { symbol: string; totalUsd: number }[]): IdleBalanceRow[] =>
  rows.map((r) => ({ ...r, isErc4626: false }))

describe("buildReconciliation", () => {
  it("flags an asset as verified when on-chain matches within tolerance", () => {
    const snap = snapshot([{ asset: "PYUSD", value: 600_000_000 }])
    const r = buildReconciliation(snap, [], idle([{ symbol: "PYUSD", totalUsd: 599_000_000 }]))
    const pyusd = r.rows.find((x) => x.asset === "PYUSD")!
    expect(pyusd.status).toBe("verified")
    expect(pyusd.gapUsd).toBe(1_000_000)
  })

  it("flags a large positive gap as an unverified gap", () => {
    const snap = snapshot([{ asset: "USDT", value: 364_000_000 }])
    const r = buildReconciliation(snap, [], idle([{ symbol: "USDT", totalUsd: 227_000_000 }]))
    const usdt = r.rows.find((x) => x.asset === "USDT")!
    expect(usdt.status).toBe("gap")
    expect(usdt.gapUsd).toBe(137_000_000)
    expect(usdt.note).toMatch(/omnibus/i)
  })

  it("marks RLUSD and custodial BTC/ETH as off-chain (structural, not error)", () => {
    const snap = snapshot([
      { asset: "RLUSD", value: 300_000_000 },
      { asset: "BTC", value: 13_000_000 },
    ])
    const r = buildReconciliation(snap, [], [])
    expect(r.rows.find((x) => x.asset === "RLUSD")!.status).toBe("off-chain")
    expect(r.rows.find((x) => x.asset === "BTC")!.status).toBe("off-chain")
  })

  it("keys a no-asset counterparty by name and marks CBAM off-chain", () => {
    const snap = snapshot(
      [{ asset: "USDC", value: 100_000_000 }],
      [{ counterparty: "CBAM", value: 10_000_000 }],
    )
    const r = buildReconciliation(snap, [], [])
    const cbam = r.rows.find((x) => x.asset === "CBAM")!
    expect(cbam.ethenaUsd).toBe(10_000_000)
    expect(cbam.status).toBe("off-chain")
  })

  it("sums deployed positions and idle balances on our side", () => {
    const snap = snapshot([{ asset: "USDtb", value: 900_000_000 }])
    const deployed: FootprintRow[] = [
      {
        protocol: "AAVE V3",
        chain: "ethereum",
        marketKey: "m",
        reserveSymbol: "USDtb",
        ethenaSuppliedUsd: 250_000_000,
        isAnomalyBorrow: false,
      },
    ]
    const r = buildReconciliation(snap, deployed, idle([{ symbol: "USDtb", totalUsd: 650_000_000 }]))
    const usdtb = r.rows.find((x) => x.asset === "USDtb")!
    expect(usdtb.onchainUsd).toBe(900_000_000) // 250M deployed + 650M idle
    expect(usdtb.status).toBe("verified")
  })

  it("drops dust rows below $1M on both sides", () => {
    const snap = snapshot([
      { asset: "USDC", value: 100_000_000 },
      { asset: "USDS", value: 100 },
    ])
    const r = buildReconciliation(snap, [], idle([{ symbol: "USDS", totalUsd: 100 }]))
    expect(r.rows.some((x) => x.asset === "USDS")).toBe(false)
  })

  it("excludes anomaly-borrow rows from the on-chain side", () => {
    const snap = snapshot([{ asset: "USDC", value: 100_000_000 }])
    const deployed: FootprintRow[] = [
      {
        protocol: "AAVE V3",
        chain: "ethereum",
        marketKey: "m",
        reserveSymbol: "USDC",
        ethenaSuppliedUsd: -5_000_000,
        isAnomalyBorrow: true,
      },
    ]
    const r = buildReconciliation(snap, deployed, idle([{ symbol: "USDC", totalUsd: 100_000_000 }]))
    expect(r.rows.find((x) => x.asset === "USDC")!.onchainUsd).toBe(100_000_000)
  })
})
