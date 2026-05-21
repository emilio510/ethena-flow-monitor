import { describe, it, expect } from "vitest"
import {
  ETHENA_WALLETS,
  MONITORED_WALLETS,
  RESERVE_FUND_WALLET,
  isEthenaWallet,
  isReserveFundWallet,
} from "@/config/wallets"

describe("ETHENA_WALLETS", () => {
  it("contains 10 unique lowercased backing addresses (reserve fund excluded)", () => {
    expect(ETHENA_WALLETS).toHaveLength(10)
    expect(new Set(ETHENA_WALLETS).size).toBe(10)
    for (const a of ETHENA_WALLETS) {
      expect(a).toMatch(/^0x[0-9a-f]{40}$/)
    }
  })

  it("does not include the reserve-fund wallet", () => {
    expect(ETHENA_WALLETS as readonly string[]).not.toContain(RESERVE_FUND_WALLET)
  })
})

describe("MONITORED_WALLETS", () => {
  it("is the backing wallets plus the reserve fund", () => {
    expect(MONITORED_WALLETS).toHaveLength(ETHENA_WALLETS.length + 1)
    expect(MONITORED_WALLETS as readonly string[]).toContain(RESERVE_FUND_WALLET)
  })
})

describe("isEthenaWallet", () => {
  it("matches case-insensitively", () => {
    expect(isEthenaWallet("0xB8734A14fbd4aa2D44e6AA830405fFC861BA313C")).toBe(true)
    expect(isEthenaWallet("0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c")).toBe(true)
  })

  it("returns false for unknown addresses and the reserve fund", () => {
    expect(isEthenaWallet("0x0000000000000000000000000000000000000000")).toBe(false)
    expect(isEthenaWallet(RESERVE_FUND_WALLET)).toBe(false)
  })
})

describe("isReserveFundWallet", () => {
  it("matches only the reserve-fund wallet, case-insensitively", () => {
    expect(isReserveFundWallet(RESERVE_FUND_WALLET)).toBe(true)
    expect(isReserveFundWallet(RESERVE_FUND_WALLET.toUpperCase())).toBe(true)
    expect(isReserveFundWallet(ETHENA_WALLETS[0])).toBe(false)
  })
})
