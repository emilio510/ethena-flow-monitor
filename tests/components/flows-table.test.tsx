import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FlowsTable } from "@/components/flows-table"
import type { Flow } from "@/lib/flows/types"

const mk = (over: Partial<Flow>): Flow => ({
  chain: "ethereum", txHash: "0xH", timestamp: 1779800000, from: "0xfrom", to: "0xto",
  asset: "USDe", amountUsd: 5_000_000, classification: "external", confidence: "low", reason: "r", ...over,
})

const flows: Flow[] = [
  mk({ chain: "xrpl", txHash: "H1", timestamp: 1779801840, from: "r4vFWRRZBXsWipgCLJBs6EqnMh7MRHbhyp", to: "rfxRtJ3apsuJs5TauCHCZB7ab4C1WvoBs", asset: "RLUSD", amountUsd: 80_000_000, classification: "rebalance", confidence: "high", reason: "known" }),
  mk({ txHash: "0xH2", to: "0xexchange00000000000000000000000000000000", amountUsd: 5_000_000, classification: "external", confidence: "low" }),
]

describe("FlowsTable", () => {
  it("renders one row per flow with amount and classification", () => {
    render(<FlowsTable flows={flows} />)
    expect(screen.getByText("$80.00M")).toBeInTheDocument()
    expect(screen.getByText("rebalance")).toBeInTheDocument()
    expect(screen.getByText("external")).toBeInTheDocument()
  })
  it("marks low-confidence rows with a 'low confidence' tag", () => {
    render(<FlowsTable flows={flows} />)
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument()
  })
  it("renders an empty state when there are no flows", () => {
    render(<FlowsTable flows={[]} />)
    expect(screen.getByText(/no flows/i)).toBeInTheDocument()
  })
  it("paginates 50 rows per page and pages through with Next", () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      mk({ txHash: "0x" + i, timestamp: 1779800000 + i }),
    )
    render(<FlowsTable flows={many} />)
    // first page: 50 rows + header
    expect(screen.getAllByRole("row")).toHaveLength(50 + 1)
    expect(screen.getByText(/1–50 of 150/)).toBeInTheDocument()
    expect(screen.getByText(/Page 1 \/ 3/)).toBeInTheDocument()
    expect(screen.getByText(/150 flows/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Next/i }))
    expect(screen.getByText(/51–100 of 150/)).toBeInTheDocument()
    expect(screen.getByText(/Page 2 \/ 3/)).toBeInTheDocument()
  })

  it("links each flow's tx and addresses to the chain explorer", () => {
    render(<FlowsTable flows={flows} />)
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    // ethereum tx → etherscan, xrpl tx → xrpscan
    expect(links).toContain("https://etherscan.io/tx/0xH2")
    expect(links).toContain("https://xrpscan.com/tx/H1")
  })
})
