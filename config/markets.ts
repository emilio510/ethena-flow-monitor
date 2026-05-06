export const CHAINS = ["ethereum", "base", "mantle", "plasma", "megaeth"] as const
export type Chain = (typeof CHAINS)[number]

export function isChain(value: unknown): value is Chain {
  return typeof value === "string" && (CHAINS as readonly string[]).includes(value)
}

export interface Market {
  chain: Chain
  marketKey: string
  marketLabel: string
  chainId: number
}

export const MARKETS: Market[] = [
  { chain: "ethereum", marketKey: "ethereum-core-v3", marketLabel: "Core", chainId: 1 },
  { chain: "base",     marketKey: "base-core-v3",     marketLabel: "Core", chainId: 8453 },
  { chain: "mantle",   marketKey: "mantle-core-v3",   marketLabel: "Core", chainId: 5000 },
  { chain: "plasma",   marketKey: "plasma-core-v3",   marketLabel: "Core", chainId: 9745 },
  { chain: "megaeth",  marketKey: "megaeth-core-v3",  marketLabel: "Core", chainId: 6342 },
]

const BY_KEY = new Map(MARKETS.map((m) => [m.marketKey, m]))
const BY_CHAIN = new Map(MARKETS.map((m) => [m.chain, m]))

export function getMarket(key: string): Market | undefined {
  return BY_KEY.get(key)
}

export function marketKeyForChain(chain: Chain): string {
  const m = BY_CHAIN.get(chain)
  if (!m) throw new Error(`Unknown chain: ${chain}`)
  return m.marketKey
}
