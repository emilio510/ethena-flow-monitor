import "server-only"
import { erc20Abi, parseAbi, type Address } from "viem"
import { getPublicClient } from "./clients"
import { ETHENA_WALLETS } from "@/config/wallets"
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
  rows: IdleBalanceRow[]
  totalUsd: number
  failures: Array<{ chain: Chain; tokenSymbol: string; reason: string }>
  /** Chains we know are under-covered (config has no tokens listed). The UI
   *  can surface this so the headline isn't taken literally on chains we
   *  haven't researched yet. */
  uncoveredChains: Chain[]
}

/** Fetch idle (non-deployed) backing balances for the 11 Ethena wallets
 *  across every chain that has a curated token list, returning per-symbol
 *  totals.
 *
 *  Math: for each (chain, token, wallet) we read `balanceOf` via Multicall3.
 *  For ERC4626 vault tokens we additionally read `convertToAssets(rawSum)`
 *  once per token to convert the share total into underlying-asset units.
 *  All non-vault stables are valued 1:1 USD. */
export async function getEthenaIdleBalances(): Promise<IdleBalanceResult> {
  const failures: IdleBalanceResult["failures"] = []
  const uncoveredChains: Chain[] = []
  const symbolTotals = new Map<string, { usd: number; isErc4626: boolean }>()

  const chainEntries = Object.entries(IDLE_TOKENS) as [Chain, IdleToken[]][]

  const chainResults = await Promise.allSettled(
    chainEntries.map(async ([chain, tokens]) => {
      if (tokens.length === 0) {
        uncoveredChains.push(chain)
        return []
      }
      const client = getPublicClient(chain)

      // Build the multicall: one balanceOf per (token, wallet) pair.
      const calls = tokens.flatMap((token) =>
        ETHENA_WALLETS.map((wallet) => ({
          token,
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

      // Sum raw balances per token.
      const rawByToken = new Map<string, bigint>()
      balanceResults.forEach((r, i) => {
        const { token } = calls[i]!
        if (r.status === "failure") {
          failures.push({
            chain,
            tokenSymbol: token.symbol,
            reason: r.error?.message ?? "unknown multicall failure",
          })
          return
        }
        const cur = rawByToken.get(token.address.toLowerCase()) ?? BigInt(0)
        rawByToken.set(token.address.toLowerCase(), cur + (r.result as bigint))
      })

      // Convert ERC4626 share totals to underlying-asset units.
      const erc4626Tokens = tokens.filter((t) => t.isErc4626)
      const erc4626Calls = erc4626Tokens
        .map((t) => ({ token: t, raw: rawByToken.get(t.address.toLowerCase()) ?? BigInt(0) }))
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

      const erc4626AssetByAddress = new Map<string, bigint>()
      erc4626Results.forEach((r, i) => {
        const { token, raw } = erc4626Calls[i]!
        if (r.status === "failure") {
          failures.push({
            chain,
            tokenSymbol: token.symbol,
            reason: `convertToAssets failed: ${r.error?.message ?? "unknown"}`,
          })
          // Fall back to 1:1 (under-counts the ~5% yield).
          erc4626AssetByAddress.set(token.address.toLowerCase(), raw)
          return
        }
        erc4626AssetByAddress.set(token.address.toLowerCase(), r.result as bigint)
      })

      // Per-token USD rows for this chain.
      return tokens.map((token) => {
        const raw = rawByToken.get(token.address.toLowerCase()) ?? BigInt(0)
        const valuedRaw = token.isErc4626
          ? erc4626AssetByAddress.get(token.address.toLowerCase()) ?? raw
          : raw
        // valuedRaw is in underlying-asset units. Stables peg ≈ $1.
        const usd = Number(valuedRaw) / 10 ** token.decimals
        return { symbol: token.symbol, usd, isErc4626: !!token.isErc4626 }
      })
    }),
  )

  chainResults.forEach((r, i) => {
    const [chain] = chainEntries[i]!
    if (r.status === "rejected") {
      failures.push({
        chain,
        tokenSymbol: "*",
        reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
      })
      return
    }
    for (const row of r.value) {
      if (row.usd <= 0) continue
      const existing = symbolTotals.get(row.symbol)
      symbolTotals.set(row.symbol, {
        usd: (existing?.usd ?? 0) + row.usd,
        isErc4626: existing?.isErc4626 || row.isErc4626,
      })
    }
  })

  const rows: IdleBalanceRow[] = [...symbolTotals.entries()]
    .map(([symbol, { usd, isErc4626 }]) => ({ symbol, totalUsd: usd, isErc4626 }))
    .sort((a, b) => b.totalUsd - a.totalUsd)

  const totalUsd = rows.reduce((a, r) => a + r.totalUsd, 0)

  return { rows, totalUsd, failures, uncoveredChains }
}
