import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Tag } from "@/components/ui/tag"

describe("Tag", () => {
  it("renders children", () => {
    const { getByText } = render(<Tag>verified</Tag>)
    expect(getByText("verified")).toBeDefined()
  })

  it("applies ok tone classes", () => {
    const { container } = render(<Tag tone="ok">ok</Tag>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain("color-ok")
  })

  it("applies risk tone classes", () => {
    const { container } = render(<Tag tone="risk">bad</Tag>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain("color-risk")
  })
})
