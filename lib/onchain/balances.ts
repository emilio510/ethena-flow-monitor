import "server-only"
import { erc20Abi, parseAbi, type Address } from "viem"
import { getPublicClient } from "./clients"
import { MONITORED_WALLETS, isReserveFundWallet } from "@/config/wallets"
import { IDLE_TOKENS, type IdleToken } from "@/config/idle-tokens"
import { RESERVE_FUND_MIN_USD } from "@/config/reserve-fund"
import { getReserveFundLpRows } from "./reserve-fund"
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
  /** True when the USD value used a proxy / approximate price (e.g. an RWA
   *  token priced via its EVM twin). Lets the UI footnote it. */
  approx?: boolean
}

export interface IdleBalanceResult {
  /** Idle balances of the backing wallets — counts toward total backing. */
  rows: IdleBalanceRow[]
  totalUsd: number
  /** Reserve-fund wallet balances — insurance, NOT backing. Shown separately. */
  reserveFundRows: IdleBalanceRow[]
  reserveFundTotalUsd: number
  /** Per-wallet idle USD across all monitored wallets (stablecoins valued
   *  1:1; the reserve fund's Curve LP is added in by loadFootprint). Drives
   *  the monitored-wallets inventory table. */
  walletIdleUsd: Array<{ address: string; idleUsd: number }>
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
  /** Per-wallet USD on this chain (lowercased address → USD), stables 1:1. */
  walletUsd: Map<string, number>
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

  // The reserve fund's Curve LP positions are read in parallel with the
  // per-chain stablecoin scan. A failure here shouldn't blank the rest.
  const lpRowsPromise = getReserveFundLpRows().catch((err) => {
    failures.push({
      chain: "ethereum",
      tokenSymbol: "reserve-fund-lp",
      reason: err instanceof Error ? err.message : String(err),
    })
    return [] as IdleBalanceRow[]
  })

  const chainResults = await Promise.allSettled(
    chainEntries.map(async ([chain, tokens]): Promise<ChainRows> => {
      if (tokens.length === 0) {
        uncoveredChains.push(chain)
        return { backing: [], reserveFund: [], walletUsd: new Map() }
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
      // Also accumulate a plain per-wallet USD total (stables 1:1) for the
      // monitored-wallets inventory.
      const rawBacking = new Map<string, bigint>()
      const rawReserve = new Map<string, bigint>()
      const walletUsd = new Map<string, number>()
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

        const w = wallet.toLowerCase()
        const usd = Number(r.result as bigint) / 10 ** token.decimals
        walletUsd.set(w, (walletUsd.get(w) ?? 0) + usd)
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

      return {
        backing: await toRows(rawBacking),
        reserveFund: await toRows(rawReserve),
        walletUsd,
      }
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

  // Reserve fund = idle stablecoins + Curve LP positions, dust filtered so
  // the table shows only the fund's real holdings (tens of millions), not
  // airdrop/dust transfers that happen to land in the wallet.
  const reserveStables = aggregate((c) => c.reserveFund, false)
  const lpRows = await lpRowsPromise
  const reserveFundRows = [...reserveStables, ...lpRows]
    .filter((r) => r.totalUsd >= RESERVE_FUND_MIN_USD)
    .sort((a, b) => b.totalUsd - a.totalUsd)

  // Per-wallet idle USD, summed across chains.
  const walletIdle = new Map<string, number>()
  for (const r of chainResults) {
    if (r.status !== "fulfilled") continue
    for (const [wallet, usd] of r.value.walletUsd) {
      walletIdle.set(wallet, (walletIdle.get(wallet) ?? 0) + usd)
    }
  }
  const walletIdleUsd = [...walletIdle.entries()].map(([address, idleUsd]) => ({
    address,
    idleUsd,
  }))

  return {
    rows,
    totalUsd: rows.reduce((a, r) => a + r.totalUsd, 0),
    reserveFundRows,
    reserveFundTotalUsd: reserveFundRows.reduce((a, r) => a + r.totalUsd, 0),
    walletIdleUsd,
    failures,
    uncoveredChains,
  }
}
