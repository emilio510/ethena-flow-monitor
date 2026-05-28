import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
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
  it("caps rendered rows to the limit and notes the total", () => {
    const many = Array.from({ length: 150 }, (_, i) => mk({ txHash: "0x" + i, timestamp: 1779800000 + i }))
    render(<FlowsTable flows={many} limit={50} />)
    expect(screen.getAllByRole("row")).toHaveLength(50 + 1) // +1 header row
    expect(screen.getByText(/showing 50 of 150/i)).toBeInTheDocument()
  })
})
