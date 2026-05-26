import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HeroMeter } from "@/components/ui/hero-meter"

describe("HeroMeter", () => {
  it("renders label and percentage", () => {
    const { getByText } = render(
      <HeroMeter
        label="Recursive exposure"
        ratio={0.204}
        rightCaption="$1.31B of $6.42B"
      />,
    )
    expect(getByText("Recursive exposure")).toBeDefined()
    expect(getByText("20.4")).toBeDefined()
    expect(getByText("$1.31B of $6.42B")).toBeDefined()
  })

  it("adds pulse class when ratio exceeds threshold", () => {
    const { container } = render(
      <HeroMeter
        label="x"
        ratio={0.25}
        rightCaption=""
        threshold={0.2}
      />,
    )
    const value = container.querySelector("[data-meter-value]") as HTMLElement
    expect(value.dataset.pulse).toBe("true")
  })

  it("does not pulse when ratio is at or below threshold", () => {
    const { container } = render(
      <HeroMeter label="x" ratio={0.2} rightCaption="" threshold={0.2} />,
    )
    const value = container.querySelector("[data-meter-value]") as HTMLElement
    expect(value.dataset.pulse).toBe("false")
  })

  it("clamps bar fill to 100% even with ratio > 1", () => {
    const { container } = render(
      <HeroMeter label="x" ratio={1.5} rightCaption="" />,
    )
    const fill = container.querySelector("[data-meter-fill]") as HTMLElement
    expect(fill.style.getPropertyValue("--efm-fill-to")).toBe("100%")
  })
})
