import "server-only"
import { z } from "zod"
import { env } from "@/config/env"
import { SolanaApiError, SolanaTimeoutError } from "./client"

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
const TOKEN_PROGRAMS = [SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM] as const

const DEFAULT_TIMEOUT_MS = 15_000

export interface SolanaTokenBalance {
  mint: string
  /** Raw integer balance (base units). */
  rawAmount: bigint
  decimals: number
}

const TokenAccountsResponse = z.object({
  result: z.object({
    value: z.array(
      z.object({
        account: z.object({
          data: z.object({
            parsed: z.object({
              info: z.object({
                mint: z.string(),
                tokenAmount: z.object({
                  amount: z.string(),
                  decimals: z.number(),
                }),
              }),
            }),
          }),
        }),
      }),
    ),
  }),
})

function rpcUrl(): string {
  return `https://solana-mainnet.g.alchemy.com/v2/${env.ALCHEMY_KEY}`
}

async function rpcCall(body: unknown, path: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(rpcUrl(), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new SolanaTimeoutError("solana-rpc", path, DEFAULT_TIMEOUT_MS)
    }
    throw err
  }
  if (!res.ok) {
    throw new SolanaApiError("solana-rpc", res.status, path, await res.text())
  }
  return res.json()
}

/**
 * Read every SPL token balance owned by `owner`, across BOTH the legacy SPL
 * Token program and Token-2022 (PYUSD and others live on Token-2022 — querying
 * only one program silently misses balances). Returns raw integer amounts;
 * valuation happens in the caller.
 */
export async function getTokenBalancesByOwner(owner: string): Promise<SolanaTokenBalance[]> {
  const perProgram = await Promise.all(
    TOKEN_PROGRAMS.map(async (programId) => {
      const raw = await rpcCall(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [owner, { programId }, { encoding: "jsonParsed" }],
        },
        `getTokenAccountsByOwner/${programId}`,
      )
      const parsed = TokenAccountsResponse.parse(raw)
      return parsed.result.value.map((v): SolanaTokenBalance => {
        const info = v.account.data.parsed.info
        return {
          mint: info.mint,
          rawAmount: BigInt(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
        }
      })
    }),
  )
  return perProgram.flat()
}
