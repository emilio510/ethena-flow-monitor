import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SectionHead } from "@/components/ui/section-head"

describe("SectionHead", () => {
  it("renders title", () => {
    const { getByText } = render(<SectionHead title="Reconciliation" />)
    expect(getByText("Reconciliation")).toBeDefined()
  })

  it("renders subtitle when given", () => {
    const { getByText } = render(<SectionHead title="X" subtitle="hello" />)
    expect(getByText("hello")).toBeDefined()
  })

  it("renders status node when given", () => {
    const { getByText } = render(
      <SectionHead title="X" status={<span>BADGE</span>} />,
    )
    expect(getByText("BADGE")).toBeDefined()
  })
})
