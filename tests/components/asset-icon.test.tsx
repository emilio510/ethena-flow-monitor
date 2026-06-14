import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AssetIcon } from "@/components/asset-icon"

describe("AssetIcon", () => {
  it("renders the vendored logo img for a known symbol", () => {
    const { container } = render(<AssetIcon symbol="USDe" />)
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/icons/assets/usde.svg")
  })

  it("falls back to a letter pill for an unknown symbol (no broken img)", () => {
    const { container, getByText } = render(<AssetIcon symbol="JAAA" />)
    expect(container.querySelector("img")).toBeNull()
    expect(getByText("J")).toBeDefined()
  })

  it("strips a PT- prefix in the fallback letter", () => {
    const { getByText } = render(<AssetIcon symbol="PT-sUSDe-25JUN2026" />)
    expect(getByText("S")).toBeDefined()
  })

  it("handles empty symbol gracefully", () => {
    const { container } = render(<AssetIcon symbol="" />)
    expect(container.firstChild).toBeDefined()
  })
})
