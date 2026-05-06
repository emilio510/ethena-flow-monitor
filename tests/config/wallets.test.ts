import { describe, it, expect } from "vitest"
import { ETHENA_WALLETS, isEthenaWallet } from "@/config/wallets"

describe("ETHENA_WALLETS", () => {
  it("contains 11 unique lowercased addresses", () => {
    expect(ETHENA_WALLETS).toHaveLength(11)
    expect(new Set(ETHENA_WALLETS).size).toBe(11)
    for (const a of ETHENA_WALLETS) {
      expect(a).toMatch(/^0x[0-9a-f]{40}$/)
    }
  })
})

describe("isEthenaWallet", () => {
  it("matches case-insensitively", () => {
    expect(isEthenaWallet("0xB8734A14fbd4aa2D44e6AA830405fFC861BA313C")).toBe(true)
    expect(isEthenaWallet("0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c")).toBe(true)
  })

  it("returns false for unknown addresses", () => {
    expect(isEthenaWallet("0x0000000000000000000000000000000000000000")).toBe(false)
  })
})
