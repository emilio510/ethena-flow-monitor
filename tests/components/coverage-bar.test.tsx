import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CoverageBar } from "@/components/ui/coverage-bar"

describe("CoverageBar", () => {
  it("renders ok fill class when coverage >= 0.95", () => {
    const { container } = render(<CoverageBar value={100} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill).toBeDefined()
    expect(fill.dataset.tone).toBe("ok")
  })

  it("renders warn tone for 80-94% coverage", () => {
    const { container } = render(<CoverageBar value={85} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.dataset.tone).toBe("warn")
  })

  it("renders risk tone below 80% coverage", () => {
    const { container } = render(<CoverageBar value={60} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.dataset.tone).toBe("risk")
  })

  it("clamps width to 100% when over-reported", () => {
    const { container } = render(<CoverageBar value={120} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.style.width).toBe("100%")
  })

  it("renders 0% width when reported is zero", () => {
    const { container } = render(<CoverageBar value={0} reported={0} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.style.width).toBe("0%")
  })
})
