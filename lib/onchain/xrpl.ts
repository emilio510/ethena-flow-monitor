import { ETHENA_XRPL_WALLETS, RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"

/**
 * XRP Ledger reader for Ethena's RLUSD holdings.
 *
 * RLUSD lives on XRPL as an issued currency (a trust line), not an ERC20, so
 * none of the viem machinery applies — it's a plain JSON-RPC call to a public
 * XRPL cluster. RLUSD is dollar-pegged, so the trust-line balance is its USD
 * value.
 */
const XRPL_RPC = "https://xrplcluster.com/"
const TIMEOUT_MS = 15_000

export interface XrplRlusdWallet {
  address: string
  rlusdUsd: number
}

export interface XrplRlusdResult {
  totalUsd: number
  wallets: XrplRlusdWallet[]
}

interface TrustLine {
  /** Currency code — hex for codes longer than 3 chars. */
  currency: string
  /** The counterparty / issuer of the trust line. */
  account: string
  balance: string
}

async function accountLines(account: string): Promise<TrustLine[]> {
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "account_lines",
      params: [{ account, ledger_index: "validated" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`XRPL account_lines HTTP ${res.status}`)
  const json = (await res.json()) as {
    result?: { lines?: TrustLine[]; error?: string; error_message?: string }
  }
  const result = json.result
  if (!result || result.error) {
    throw new Error(
      `XRPL account_lines error: ${result?.error_message ?? result?.error ?? "no result"}`,
    )
  }
  return result.lines ?? []
}

/**
 * Read RLUSD balances for Ethena's XRPL wallets. Throws if any account query
 * fails — callers (loadFootprint) wrap this so a transient XRPL outage
 * degrades gracefully to the no-reader state.
 */
export async function getEthenaRlusdHoldings(): Promise<XrplRlusdResult> {
  const wallets = await Promise.all(
    ETHENA_XRPL_WALLETS.map(async (address): Promise<XrplRlusdWallet> => {
      const lines = await accountLines(address)
      const rlusdUsd = lines
        .filter(
          (l) =>
            l.account === RLUSD_ISSUER &&
            l.currency.toUpperCase() === RLUSD_CURRENCY_HEX,
        )
        .reduce((sum, l) => sum + Number(l.balance), 0)
      return { address, rlusdUsd }
    }),
  )
  return {
    totalUsd: wallets.reduce((sum, w) => sum + w.rlusdUsd, 0),
    wallets,
  }
}
