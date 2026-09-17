import "server-only"
import type { Address } from "viem"
import { getPublicClient } from "./clients"

/** Rounds older than this are treated as missing. JAAA NAV heartbeat is 27h;
 *  3 days tolerates a weekend without accepting a dead feed. */
const MAX_NAV_AGE_SECONDS = 3 * 86_400

const aggregatorV3Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const

/**
 * Read Chainlink NAV feeds on Ethereum mainnet → SYMBOL → USD price.
 * A symbol is ABSENT (never 0) when its read fails, the answer is not positive,
 * or the round is older than MAX_NAV_AGE_SECONDS; each case warns.
 */
export async function fetchChainlinkNavPrices(
  feeds: Record<string, Address>,
  nowMs: number = Date.now(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const entries = Object.entries(feeds)
  if (entries.length === 0) return out

  const client = getPublicClient("ethereum")
  const nowSec = Math.floor(nowMs / 1000)

  await Promise.all(
    entries.map(async ([symbol, address]) => {
      try {
        const [decimals, round] = await Promise.all([
          client.readContract({ address, abi: aggregatorV3Abi, functionName: "decimals" }),
          client.readContract({ address, abi: aggregatorV3Abi, functionName: "latestRoundData" }),
        ])
        const [, answer, , updatedAt] = round
        const ageSec = nowSec - Number(updatedAt)
        if (answer <= BigInt(0)) {
          console.warn(`[ethena-flow-monitor] Chainlink NAV ${symbol}: non-positive answer ${answer} — excluding`)
          return
        }
        if (ageSec > MAX_NAV_AGE_SECONDS) {
          console.warn(`[ethena-flow-monitor] Chainlink NAV ${symbol}: stale round (${ageSec}s old) — excluding`)
          return
        }
        out.set(symbol.toUpperCase(), Number(answer) / 10 ** Number(decimals))
      } catch (err) {
        console.warn(
          `[ethena-flow-monitor] Chainlink NAV ${symbol} read failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }),
  )
  return out
}
