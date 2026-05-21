import "server-only"
import { erc20Abi, parseAbi, type Address } from "viem"
import { getPublicClient } from "./clients"
import { MONITORED_WALLETS, isReserveFundWallet } from "@/config/wallets"
import { IDLE_TOKENS, type IdleToken } from "@/config/idle-tokens"
import type { Chain } from "@/config/markets"

const erc4626Abi = parseAbi([
  "function convertToAssets(uint256 shares) view returns (uint256)",
])

export interface IdleBalanceRow {
  symbol: string
  /** USD value across all wallets and chains, summed.
   *  Stables: 1:1 USD. ERC4626 vaults: unwrapped via convertToAssets. */
  totalUsd: number
  /** Whether this row aggregates an ERC4626 vault (sUSDe, sUSDtb), so the UI
   *  can footnote the "underlying-asset equivalent" caveat. */
  isErc4626: boolean
}

export interface IdleBalanceResult {
  /** Idle balances of the backing wallets — counts toward total backing. */
  rows: IdleBalanceRow[]
  totalUsd: number
  /** Reserve-fund wallet balances — insurance, NOT backing. Shown separately. */
  reserveFundRows: IdleBalanceRow[]
  reserveFundTotalUsd: number
  failures: Array<{ chain: Chain; tokenSymbol: string; reason: string }>
  /** Chains we know are under-covered (config has no tokens listed). The UI
   *  can surface this so the headline isn't taken literally on chains we
   *  haven't researched yet. */
  uncoveredChains: Chain[]
}

interface ChainRows {
  /** Per-token USD for the backing wallets. */
  backing: IdleBalanceRow[]
  /** Per-token USD for the reserve-fund wallet. */
  reserveFund: IdleBalanceRow[]
}

/** Fetch idle (non-deployed) balances for every monitored wallet across each
 *  chain that has a curated token list, bucketing the reserve fund apart.
 *
 *  Math: for each (chain, token, wallet) we read `balanceOf` via Multicall3.
 *  For ERC4626 vault tokens we additionally read `convertToAssets(rawSum)`
 *  once per token to convert the share total into underlying-asset units.
 *  All non-vault stables are valued 1:1 USD. */
export async function getEthenaIdleBalances(): Promise<IdleBalanceResult> {
  const failures: IdleBalanceResult["failures"] = []
  const uncoveredChains: Chain[] = []

  const chainEntries = Object.entries(IDLE_TOKENS) as [Chain, IdleToken[]][]

  const chainResults = await Promise.allSettled(
    chainEntries.map(async ([chain, tokens]): Promise<ChainRows> => {
      if (tokens.length === 0) {
        uncoveredChains.push(chain)
        return { backing: [], reserveFund: [] }
      }
      const client = getPublicClient(chain)

      // One balanceOf per (token, wallet) pair across every monitored wallet.
      const calls = tokens.flatMap((token) =>
        MONITORED_WALLETS.map((wallet) => ({
          token,
          wallet,
          request: {
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [wallet as Address],
          },
        })),
      )

      const balanceResults = await client.multicall({
        contracts: calls.map((c) => c.request),
        allowFailure: true,
      })

      // Sum raw balances per token, split into backing vs reserve fund.
      const rawBacking = new Map<string, bigint>()
      const rawReserve = new Map<string, bigint>()
      balanceResults.forEach((r, i) => {
        const { token, wallet } = calls[i]!
        if (r.status === "failure") {
          failures.push({
            chain,
            tokenSymbol: token.symbol,
            reason: r.error?.message ?? "unknown multicall failure",
          })
          return
        }
        const map = isReserveFundWallet(wallet) ? rawReserve : rawBacking
        const key = token.address.toLowerCase()
        map.set(key, (map.get(key) ?? BigInt(0)) + (r.result as bigint))
      })

      // Convert a raw-balance map into per-token USD rows, unwrapping ERC4626
      // vault shares into underlying-asset units.
      const toRows = async (raw: Map<string, bigint>): Promise<IdleBalanceRow[]> => {
        const erc4626Calls = tokens
          .filter((t) => t.isErc4626)
          .map((t) => ({ token: t, raw: raw.get(t.address.toLowerCase()) ?? BigInt(0) }))
          .filter((x) => x.raw > BigInt(0))

        const erc4626Results =
          erc4626Calls.length > 0
            ? await client.multicall({
                contracts: erc4626Calls.map((x) => ({
                  address: x.token.address,
                  abi: erc4626Abi,
                  functionName: "convertToAssets" as const,
                  args: [x.raw],
                })),
                allowFailure: true,
              })
            : []

        const assetByAddress = new Map<string, bigint>()
        erc4626Results.forEach((r, i) => {
          const { token, raw: rawShares } = erc4626Calls[i]!
          if (r.status === "failure") {
            failures.push({
              chain,
              tokenSymbol: token.symbol,
              reason: `convertToAssets failed: ${r.error?.message ?? "unknown"}`,
            })
            assetByAddress.set(token.address.toLowerCase(), rawShares) // 1:1 fallback
            return
          }
          assetByAddress.set(token.address.toLowerCase(), r.result as bigint)
        })

        return tokens.map((token) => {
          const rawAmt = raw.get(token.address.toLowerCase()) ?? BigInt(0)
          const valuedRaw = token.isErc4626
            ? assetByAddress.get(token.address.toLowerCase()) ?? rawAmt
            : rawAmt
          return {
            symbol: token.symbol,
            totalUsd: Number(valuedRaw) / 10 ** token.decimals,
            isErc4626: !!token.isErc4626,
          }
        })
      }

      return { backing: await toRows(rawBacking), reserveFund: await toRows(rawReserve) }
    }),
  )

  // Aggregate per-symbol across chains, separately for each bucket.
  // `recordFailures` ensures a rejected chain is logged once, not per bucket.
  const aggregate = (
    pick: (c: ChainRows) => IdleBalanceRow[],
    recordFailures: boolean,
  ): IdleBalanceRow[] => {
    const totals = new Map<string, { usd: number; isErc4626: boolean }>()
    chainResults.forEach((r, i) => {
      const [chain] = chainEntries[i]!
      if (r.status === "rejected") {
        if (recordFailures) {
          failures.push({
            chain,
            tokenSymbol: "*",
            reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
          })
        }
        return
      }
      for (const row of pick(r.value)) {
        if (row.totalUsd <= 0) continue
        const prev = totals.get(row.symbol)
        totals.set(row.symbol, {
          usd: (prev?.usd ?? 0) + row.totalUsd,
          isErc4626: (prev?.isErc4626 ?? false) || row.isErc4626,
        })
      }
    })
    return [...totals.entries()]
      .map(([symbol, { usd, isErc4626 }]) => ({ symbol, totalUsd: usd, isErc4626 }))
      .sort((a, b) => b.totalUsd - a.totalUsd)
  }

  const rows = aggregate((c) => c.backing, true)
  const reserveFundRows = aggregate((c) => c.reserveFund, false)

  return {
    rows,
    totalUsd: rows.reduce((a, r) => a + r.totalUsd, 0),
    reserveFundRows,
    reserveFundTotalUsd: reserveFundRows.reduce((a, r) => a + r.totalUsd, 0),
    failures,
    uncoveredChains,
  }
}
