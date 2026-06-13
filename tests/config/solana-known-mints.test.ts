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

  it("SOLANA_PEG_MINTS contains USDC", () => {
    const symbol = SOLANA_PEG_MINTS["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]
    expect(symbol).toBe("USDC")
  })

  it("SOLANA_DENY_MINTS contains the known dust stable", () => {
    const reason = SOLANA_DENY_MINTS["2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"]
    expect(reason).toBeDefined()
    expect(typeof reason).toBe("string")
  })
})
