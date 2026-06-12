import { describe, it, expect } from "vitest"
import {
  SOLANA_WALLETS,
  KNOWN_SOLANA_WALLET_LABELS,
  isSolanaWallet,
} from "@/config/solana-wallets"

describe("solana-wallets config", () => {
  it("lists the two Ethena Solana addresses", () => {
    expect(SOLANA_WALLETS).toContain("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")
    expect(SOLANA_WALLETS).toContain("C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L")
  })

  it("is case-sensitive (base58 — never lowercased)", () => {
    expect(isSolanaWallet("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")).toBe(true)
    expect(isSolanaWallet("4faqc6qz5skfjcdf64mkcxrhtccsnarzcr1xumpnrbtn")).toBe(false)
  })

  it("labels the RWA wallet", () => {
    expect(KNOWN_SOLANA_WALLET_LABELS["4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"]).toMatch(/JAAA/)
  })
})
