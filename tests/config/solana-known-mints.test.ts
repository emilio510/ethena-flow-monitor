import { describe, it, expect } from "vitest"
import {
  SOLANA_DEPLOYED_MINTS,
  SOLANA_PEG_MINTS,
  SOLANA_DENY_MINTS,
} from "@/config/solana-known-mints"

describe("solana-known-mints", () => {
  it("SOLANA_DEPLOYED_MINTS contains jleUSDG with Jupiter pricing", () => {
    const entry = SOLANA_DEPLOYED_MINTS["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"]
    expect(entry).toBeDefined()
    expect(entry.symbol).toBe("jleUSDG")
    expect(entry.price.kind).toBe("jupiter")
  })

  it("SOLANA_PEG_MINTS contains USDC and USDG (Global Dollar)", () => {
    expect(SOLANA_PEG_MINTS["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]).toBe("USDC")
    // USDG was wrongly deny-listed as dust; it is a real $1 stablecoin.
    expect(SOLANA_PEG_MINTS["2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"]).toBe("USDG")
  })

  it("does NOT deny-list USDG (2u1tsz) — it is a real stablecoin, not spam", () => {
    expect(SOLANA_DENY_MINTS["2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"]).toBeUndefined()
  })
})
