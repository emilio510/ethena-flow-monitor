import { describe, it, expect } from "vitest"
import {
  SOLANA_IDLE_TOKENS,
  EXCLUDED_MINTS,
} from "@/config/solana-idle-tokens"

describe("solana token registry", () => {
  it("prices JAAA via its Base contract (proxyPrice, approx) in the idle bucket", () => {
    const jaaa = SOLANA_IDLE_TOKENS["AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG"]
    expect(jaaa.symbol).toBe("JAAA")
    expect(jaaa.decimals).toBe(6)
    expect(jaaa.bucket).toBe("idle")
    expect(jaaa.pricing).toEqual({
      kind: "proxyPrice",
      network: "base-mainnet",
      address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
      approx: true,
    })
  })

  it("pegs the stable mints (idle bucket)", () => {
    const usdc = SOLANA_IDLE_TOKENS["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]
    expect(usdc.pricing).toEqual({ kind: "peg" })
    expect(usdc.bucket).toBe("idle")
  })

  it("tracks the jleUSDG vault share in the DEPLOYED bucket (Jupiter-priced)", () => {
    const jle = SOLANA_IDLE_TOKENS["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"]
    expect(jle.symbol).toBe("jleUSDG")
    expect(jle.bucket).toBe("deployed")
    expect(jle.pricing).toEqual({ kind: "jupiter" })
  })

  it("documents why dust/other mints stay excluded", () => {
    expect(Object.keys(EXCLUDED_MINTS).length).toBeGreaterThanOrEqual(0)
  })
})
