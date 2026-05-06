export const TIER_1_SYMBOLS = new Set(["USDe", "sUSDe", "USDtb", "sUSDtb"])

export const TIER_2_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "USDT0",
  "USDM",
  "USDm",
  "USDS",
  "PYUSD",
  "mUSD",
])

export function isTier1Symbol(symbol: string): boolean {
  return TIER_1_SYMBOLS.has(symbol)
}

export function isTier2Symbol(symbol: string): boolean {
  return TIER_2_SYMBOLS.has(symbol)
}

export function isPtSymbol(symbol: string): boolean {
  return /^PT-.+-\d{1,2}[A-Z]{3}\d{4}$/.test(symbol)
}
