import { describe, it, expect } from "vitest"
import { UserPositionRow } from "@/lib/tokenlogic/schemas"

describe("UserPositionRow", () => {
  it("parses a single-asset row", () => {
    const raw = {
      protocol: "aave_v3",
      chain: "plasma",
      market_key: "plasma-core-v3",
      market_label: "Core",
      user_address: "0xABC",
      wallet_label: null,
      latest_block_day: { value: "2026-05-06" },
      supply_reserve_symbols: ["USDT0"],
      supply_reserve_amount: 100,
      supply_reserve_amount_usd: 99.5,
      total_supply_amount_usd: 99.5,
      borrow_reserve_symbols: [],
      borrow_reserve_amount: 0,
      borrow_reserve_amount_usd: 0,
      total_borrow_amount_usd: 0,
      health_factor: null,
      net_apy: 0.04,
      net_usd_per_day: 0.5,
      days_to_liquidation: null,
    }
    const parsed = UserPositionRow.parse(raw)
    expect(parsed.supplies).toEqual([{ symbol: "USDT0", amount: 100, amountUsd: 99.5 }])
    expect(parsed.borrows).toEqual([])
    expect(parsed.totalSupplyUsd).toBe(99.5)
    expect(parsed.latestBlockDay).toBe("2026-05-06")
    expect(parsed.userAddress).toBe("0xabc")
  })

  it("parses a multi-asset row", () => {
    const raw = {
      protocol: "aave_v3",
      chain: "ethereum",
      market_key: "ethereum-core-v3",
      market_label: "Core",
      user_address: "0xdef",
      wallet_label: null,
      latest_block_day: { value: "2026-05-06" },
      supply_reserve_symbols: ["PT-srUSDe-25JUN2026", "PT-srUSDe-2APR2026"],
      supply_reserve_amount: [0.5, 3],
      supply_reserve_amount_usd: [0.5, 3],
      total_supply_amount_usd: 3.5,
      borrow_reserve_symbols: [],
      borrow_reserve_amount: 0,
      borrow_reserve_amount_usd: 0,
      total_borrow_amount_usd: 0,
      health_factor: null,
      net_apy: 0,
      net_usd_per_day: 0,
      days_to_liquidation: null,
    }
    const parsed = UserPositionRow.parse(raw)
    expect(parsed.supplies).toHaveLength(2)
    expect(parsed.supplies[0]).toEqual({ symbol: "PT-srUSDe-25JUN2026", amount: 0.5, amountUsd: 0.5 })
  })

  it("parses a borrower row with multi-collateral and HF", () => {
    const raw = {
      protocol: "aave_v3",
      chain: "plasma",
      market_key: "plasma-core-v3",
      market_label: "Core",
      user_address: "0xghi",
      wallet_label: null,
      latest_block_day: { value: "2026-05-06" },
      supply_reserve_symbols: ["USDT0", "USDe", "syrupUSDT"],
      supply_reserve_amount: [0.000001, 283, 2377599],
      supply_reserve_amount_usd: [0.000001, 283, 2676893],
      total_supply_amount_usd: 2677177.32,
      borrow_reserve_symbols: ["USDT0"],
      borrow_reserve_amount: 2407767,
      borrow_reserve_amount_usd: 2407503,
      total_borrow_amount_usd: 2407503,
      health_factor: 1.022944,
      net_apy: -0.4149,
      net_usd_per_day: -299.64,
      days_to_liquidation: 182.385836,
    }
    const parsed = UserPositionRow.parse(raw)
    expect(parsed.supplies).toHaveLength(3)
    expect(parsed.borrows).toEqual([{ symbol: "USDT0", amount: 2407767, amountUsd: 2407503 }])
    expect(parsed.healthFactor).toBe(1.022944)
  })
})
