import "server-only"
import { parseAbi } from "viem"
import { z } from "zod"
import { getPublicClient, getAlchemyUrl } from "./clients"
import { fetchTokenPrices } from "./prices"
import { MONITORED_WALLETS } from "@/config/wallets"
import { IDLE_CHAINS } from "@/config/idle-tokens"
import {
  UNTRACKED_ALERT_USD,
  UNTRACKED_DENY,
  KNOWN_STABLE_UNDERLYINGS,
} from "@/config/untracked-audit"
import type { Chain } from "@/config/markets"

export interface UntrackedFinding {
  chain: Chain
  wallet: string
  address: string
  symbol: string
  valueUsd: number
  kind: "erc4626-stable" | "priced"
}

// ─── ERC-4626 minimal ABI for the stable probe ────────────────────────────────

const erc4626ProbeAbi = parseAbi([
  "function asset() view returns (address)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
])

// ─── Alchemy alchemy_getTokenBalances response schema ────────────────────────

const TokenBalanceEntry = z.object({
  contractAddress: z.string(),
  tokenBalance: z.string().nullable(),
})

const AlchemyTokenBalancesResponse = z.object({
  result: z
    .object({
      tokenBalances: z.array(TokenBalanceEntry).default([]),
    })
    .optional(),
  error: z
    .object({ message: z.string().optional() })
    .optional(),
})

/** Raw Alchemy alchemy_getTokenBalances for all ERC-20 tokens a wallet holds.
 *  Returns non-zero contract addresses. */
async function getTokenBalances(
  chain: Chain,
  wallet: string,
): Promise<Array<{ address: string; rawBalance: bigint }>> {
  const url = getAlchemyUrl(chain)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getTokenBalances",
      params: [wallet, "erc20"],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw new Error(`alchemy_getTokenBalances HTTP ${res.status} on ${chain}`)
  }
  const parsed = AlchemyTokenBalancesResponse.parse(await res.json())
  if (parsed.error) {
    throw new Error(`alchemy_getTokenBalances error: ${parsed.error.message ?? "unknown"}`)
  }
  const balances = parsed.result?.tokenBalances ?? []
  return balances
    .filter((b) => b.tokenBalance && b.tokenBalance !== "0x0000000000000000000000000000000000000000000000000000000000000000")
    .flatMap((b) => {
      if (!b.tokenBalance) return []
      try {
        const raw = BigInt(b.tokenBalance)
        if (raw <= BigInt(0)) return []
        return [{ address: b.contractAddress.toLowerCase(), rawBalance: raw }]
      } catch {
        return []
      }
    })
}

/** Attempt to value a token as an ERC-4626 vault whose underlying is a known
 *  stablecoin. Returns the USD value or null if this token isn't an
 *  ERC-4626-stable (e.g. revert from asset(), non-stable underlying). */
async function probeErc4626Stable(
  chain: Chain,
  tokenAddress: string,
  rawBalance: bigint,
): Promise<{ valueUsd: number; symbol: string } | null> {
  const client = getPublicClient(chain)
  const addr = tokenAddress as `0x${string}`

  const [assetResult, convertResult, decimalsResult, symbolResult] = await client.multicall({
    contracts: [
      { address: addr, abi: erc4626ProbeAbi, functionName: "asset" },
      { address: addr, abi: erc4626ProbeAbi, functionName: "convertToAssets", args: [rawBalance] },
      { address: addr, abi: erc4626ProbeAbi, functionName: "decimals" },
      { address: addr, abi: erc4626ProbeAbi, functionName: "symbol" },
    ],
    allowFailure: true,
  })

  if (
    assetResult.status === "failure" ||
    convertResult.status === "failure" ||
    decimalsResult.status === "failure"
  ) {
    return null
  }

  const underlyingAddress = (assetResult.result as string).toLowerCase()
  if (!KNOWN_STABLE_UNDERLYINGS.has(underlyingAddress)) {
    return null
  }

  // Underlying is a known stablecoin (6 or 18 decimals). We use the token's
  // own decimals for the convertToAssets result since the vault's share
  // decimals match the underlying decimals (EIP-4626 requirement).
  const assetDecimals = Number(decimalsResult.result as bigint | number)
  const underlying = convertResult.result as bigint
  const valueUsd = Number(underlying) / 10 ** assetDecimals

  const symbol =
    symbolResult.status === "success"
      ? (symbolResult.result as string)
      : tokenAddress.slice(0, 8)

  return { valueUsd, symbol }
}

/**
 * Audit all EVM idle-chain wallets for token holdings that are NOT in the
 * exclusion set. Returns findings for positions valued ≥ UNTRACKED_ALERT_USD.
 *
 * This is ALERT-ONLY. It does not contribute to any backing total.
 * Partial-tolerant: a failed wallet/chain is logged and skipped — never throws.
 *
 * @param exclude Lowercased token contract addresses to ignore (already-tracked
 *   positions: idle allowlist, Morpho vault addresses, reserve LP tokens, etc.)
 */
export async function auditUntrackedHoldings(
  exclude: ReadonlySet<string>,
): Promise<UntrackedFinding[]> {
  const findings: UntrackedFinding[] = []

  for (const chain of IDLE_CHAINS) {
    // Batch all wallets in parallel per chain but catch per-wallet failures.
    const walletResults = await Promise.allSettled(
      MONITORED_WALLETS.map(async (wallet) => {
        const balances = await getTokenBalances(chain, wallet)

        // Filter out excluded + deny-listed addresses.
        const candidates = balances.filter(
          (b) => !exclude.has(b.address) && !UNTRACKED_DENY.has(b.address),
        )
        if (candidates.length === 0) return []

        // Batch-fetch Alchemy prices for all candidates on this chain.
        const refs = candidates.map((c) => ({
          network: chain === "ethereum" ? "eth-mainnet" : `${chain}-mainnet`,
          address: c.address,
        }))
        const priceMap = await fetchTokenPrices(refs).catch((err) => {
          console.warn(`[untracked-audit] fetchTokenPrices failed on ${chain}: ${err instanceof Error ? err.message : String(err)}`)
          return new Map<string, number>()
        })

        const walletFindings: UntrackedFinding[] = []

        // Probe each candidate in parallel.
        const probeResults = await Promise.allSettled(
          candidates.map(async (c) => {
            // ERC-4626 stable probe (takes priority — more accurate than spot price).
            // probeErc4626Stable already fetches decimals() via multicall; when
            // the probe succeeds it uses them directly. When it fails (not a
            // 4626 vault) we do a second lightweight multicall to retrieve
            // decimals for use in the priced fallback so a 6-decimal token like
            // USDC is not mis-scaled by 1e18.
            const erc4626 = await probeErc4626Stable(chain, c.address, c.rawBalance).catch(
              () => null,
            )

            let valueUsd: number | undefined
            let kind: UntrackedFinding["kind"] | undefined
            let symbol: string = c.address.slice(0, 8)

            if (erc4626 !== null) {
              valueUsd = erc4626.valueUsd
              kind = "erc4626-stable"
              symbol = erc4626.symbol
            } else {
              // Fallback: Alchemy spot price with real decimals.
              const network = chain === "ethereum" ? "eth-mainnet" : `${chain}-mainnet`
              const pk = `${network}:${c.address}`
              const price = priceMap.get(pk)
              if (price !== undefined) {
                // Fetch the token's own decimals so a 6-decimal token (e.g.
                // USDC) is not under-valued by 1e18. Fall back to 18 only when
                // the RPC call fails — this is coarse but always errs toward
                // MORE alerting, which is the safe direction for an audit.
                const decimalsAbi = parseAbi(["function decimals() view returns (uint8)"])
                const client = getPublicClient(chain)
                const addr = c.address as `0x${string}`
                let decimals = 18 // safe fallback
                try {
                  const [dec] = await client.multicall({
                    contracts: [{ address: addr, abi: decimalsAbi, functionName: "decimals" }],
                    allowFailure: true,
                  })
                  if (dec?.status === "success") {
                    decimals = Number(dec.result as bigint | number)
                  }
                  // If status is "failure", keep the fallback of 18.
                } catch {
                  // RPC error — keep decimals = 18 fallback.
                }
                valueUsd = (Number(c.rawBalance) / 10 ** decimals) * price
                kind = "priced"
                symbol = c.address.slice(0, 8)
              }
            }

            if (valueUsd === undefined || kind === undefined || valueUsd < UNTRACKED_ALERT_USD) {
              return null
            }

            return {
              chain,
              wallet,
              address: c.address,
              symbol,
              valueUsd,
              kind,
            } satisfies UntrackedFinding
          }),
        )

        for (const r of probeResults) {
          if (r.status === "fulfilled" && r.value !== null) {
            walletFindings.push(r.value)
          }
        }

        return walletFindings
      }),
    )

    for (const [i, r] of walletResults.entries()) {
      if (r.status === "rejected") {
        console.warn(
          `[untracked-audit] wallet ${MONITORED_WALLETS[i]} on ${chain} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        )
      } else {
        findings.push(...r.value)
      }
    }
  }

  return findings
}
