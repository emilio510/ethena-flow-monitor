import { describe, it, expect } from "vitest"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"

describe("fmtUsd", () => {
  it("formats large numbers with M/B suffixes", () => {
    expect(fmtUsd(500_000_000)).toBe("$500.00M")
    expect(fmtUsd(1_500_000_000)).toBe("$1.50B")
    expect(fmtUsd(1_234.56)).toBe("$1.23K")
    expect(fmtUsd(0.5)).toBe("$0.50")
  })
})

describe("fmtPct", () => {
  it("formats percentages", () => {
    expect(fmtPct(0.833)).toBe("83.30%")
    expect(fmtPct(0.001)).toBe("0.10%")
    expect(fmtPct(1)).toBe("100.00%")
  })
})

describe("shortAddr", () => {
  it("returns first 6 + last 4 with ellipsis", () => {
    expect(shortAddr("0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c")).toBe("0xb873...313c")
  })
})
