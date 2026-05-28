import { isRedeemSink } from "@/config/flows"
import type { RawFlow, Classification, Confidence, FlowChain } from "./types"

/** Holdings of a destination address, used to judge whether it is Ethena custody. */
export interface DestHoldings {
  chain: FlowChain
  /** XRPL: decoded trust-line currency symbols. EVM: ERC20 symbols with nonzero balance. */
  tokens: string[]
  /** XRPL only: number of trust lines on the account. */
  trustLineCount?: number
}

export interface DestProbe {
  isProbableEthena: boolean
  confidence: Confidence
  reason: string
}

export interface ClassifyResult {
  classification: Classification
  confidence: Confidence
  reason: string
}

/** Token symbols that count as Ethena-family stables. */
const ETHENA_STABLES = new Set(["RLUSD", "USDe", "sUSDe", "USDtb", "sUSDtb", "USDC", "USDT"])

/** Judge whether a never-before-seen destination looks like Ethena custody.
 *  Pure + testable; this is the domain-judgment seam. */
export function classifyNewAddress(h: DestHoldings): DestProbe {
  const onlyEthena = h.tokens.length > 0 && h.tokens.every((t) => ETHENA_STABLES.has(t))
  if (!onlyEthena) {
    return {
      isProbableEthena: false,
      confidence: "low",
      reason: `holds non-Ethena tokens: ${h.tokens.join(", ") || "none"}`,
    }
  }
  if (h.chain === "xrpl" && h.trustLineCount === 1) {
    return { isProbableEthena: true, confidence: "high", reason: "single RLUSD trust line — Ethena-custody pattern" }
  }
  return { isProbableEthena: true, confidence: "low", reason: `holds only Ethena stables (${h.tokens.join(", ")})` }
}

/** Classify one raw flow. `knownWallets` is normalized (EVM lowercase, XRPL as-is).
 *  `probe` is the destination judgment, or null when the destination is a sink
 *  or already known (no probe needed). */
export function classifyFlow(
  flow: RawFlow,
  knownWallets: Set<string>,
  probe: DestProbe | null,
): ClassifyResult {
  if (isRedeemSink(flow.chain, flow.to)) {
    return { classification: "redeem", confidence: "high", reason: "sent to redeem/burn sink" }
  }
  const toKey = flow.chain === "ethereum" ? flow.to.toLowerCase() : flow.to
  if (knownWallets.has(toKey)) {
    return { classification: "rebalance", confidence: "high", reason: "sent to a known Ethena wallet" }
  }
  if (probe?.isProbableEthena) {
    return { classification: "rebalance", confidence: probe.confidence, reason: probe.reason }
  }
  return {
    classification: "external",
    confidence: "low",
    reason: probe?.reason ?? "destination has no Ethena-custody signal",
  }
}
