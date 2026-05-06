import { isTier1Symbol, isTier2Symbol, isPtSymbol } from "@/config/tokens"

export type Bucket = "TIER_1" | "TIER_2" | "PT" | "OTHER"

export function classify(symbol: string): Bucket {
  if (isPtSymbol(symbol)) return "PT"
  if (isTier1Symbol(symbol)) return "TIER_1"
  if (isTier2Symbol(symbol)) return "TIER_2"
  return "OTHER"
}

export function isEthenaStack(b: Bucket): boolean {
  return b === "TIER_1" || b === "PT"
}
