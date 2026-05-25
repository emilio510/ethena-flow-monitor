import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GlassCard } from "@/components/ui/glass-card"

describe("GlassCard", () => {
  it("renders children and applies glass class", () => {
    const { getByText, container } = render(<GlassCard>hello</GlassCard>)
    expect(getByText("hello")).toBeDefined()
    expect(container.firstChild).toHaveClass("glass")
  })

  it("merges custom className", () => {
    const { container } = render(<GlassCard className="p-4">x</GlassCard>)
    expect(container.firstChild).toHaveClass("glass", "p-4")
  })
})
