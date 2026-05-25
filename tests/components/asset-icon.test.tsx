import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AssetIcon } from "@/components/ui/asset-icon"

describe("AssetIcon", () => {
  it("renders the first letter uppercase", () => {
    const { getByText } = render(<AssetIcon symbol="usde" />)
    expect(getByText("U")).toBeDefined()
  })

  it("handles empty symbol gracefully", () => {
    const { container } = render(<AssetIcon symbol="" />)
    expect(container.firstChild).toBeDefined()
  })
})
