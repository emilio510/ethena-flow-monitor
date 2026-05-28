import { z } from "zod"

/** Only flows of at least this USD value are recorded. */
export const FLOW_MIN_USD = 1_000_000
/** Rolling retention window for the flows ledger. */
export const FLOW_WINDOW_DAYS = 90
/** Seconds between the Unix epoch (1970) and the Ripple epoch (2000). */
export const RIPPLE_EPOCH_OFFSET = 946_684_800

export const FlowChainSchema = z.enum(["xrpl", "ethereum"])
export type FlowChain = z.infer<typeof FlowChainSchema>

export const ClassificationSchema = z.enum(["redeem", "rebalance", "external"])
export type Classification = z.infer<typeof ClassificationSchema>

export const ConfidenceSchema = z.enum(["high", "low"])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const FlowSchema = z.object({
  chain: FlowChainSchema,
  txHash: z.string(),
  timestamp: z.number(), // unix seconds
  from: z.string(),
  to: z.string(),
  asset: z.string(),
  amountUsd: z.number(),
  classification: ClassificationSchema,
  confidence: ConfidenceSchema,
  reason: z.string(),
})
export type Flow = z.infer<typeof FlowSchema>

/** A flow before classification — scanners emit these. */
export type RawFlow = Pick<
  Flow,
  "chain" | "txHash" | "timestamp" | "from" | "to" | "asset" | "amountUsd"
>

export const DiscoveredWalletSchema = z.object({
  address: z.string(),
  chain: FlowChainSchema,
  discoveredVia: z.string(), // txHash that introduced it
  firstSeen: z.number(),
  status: z.literal("quarantined"),
})
export type DiscoveredWallet = z.infer<typeof DiscoveredWalletSchema>

export const FlowsFileSchema = z.array(FlowSchema)
export const DiscoveredWalletsFileSchema = z.array(DiscoveredWalletSchema)
