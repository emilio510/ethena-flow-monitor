import { tlFetch } from "./client"
import { UserPositionsResponse, type UserPositionRow } from "./schemas"
import { ETHENA_WALLETS } from "@/config/wallets"

const PAGE_SIZE = 1000
const MAX_PAGES = 200

class PaginationLimitExceeded extends Error {
  constructor(scope: string) {
    super(`Pagination exceeded ${MAX_PAGES} pages on ${scope} — refusing to loop further`)
  }
}

async function paginate(scope: string, urlFor: (offset: number) => string): Promise<UserPositionRow[]> {
  const out: UserPositionRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE
    const raw = await tlFetch(urlFor(offset))
    const parsed = UserPositionsResponse.parse(raw)
    out.push(...parsed.data)
    if (parsed.data.length < PAGE_SIZE) return out
  }
  throw new PaginationLimitExceeded(scope)
}

export async function getPositionsByUser(userAddress: string): Promise<UserPositionRow[]> {
  // T2.2 — paginate; the API can return >1000 rows for a wallet that touches many markets.
  return paginate(
    `user_address=${userAddress}`,
    (offset) =>
      `/internal/aave/user-positions/latest?user_address=${userAddress}&limit=${PAGE_SIZE}&offset=${offset}`,
  )
}

export async function getMarketPositions(marketKey: string): Promise<UserPositionRow[]> {
  // T2.1 — bounded pagination prevents an infinite loop if the API misbehaves.
  return paginate(
    `market_key=${marketKey}`,
    (offset) =>
      `/internal/aave/user-positions/latest?market_key=${marketKey}&limit=${PAGE_SIZE}&offset=${offset}`,
  )
}

/**
 * Fetch positions for every monitored Ethena wallet in parallel.
 *
 * T2.3 — uses `Promise.allSettled` and surfaces an aggregated error naming each
 * failed wallet, instead of letting a single 401/network blip blank the whole
 * landing page. If you want partial-data behaviour instead, swap the `throw`
 * for a logged warning + filtered array.
 */
export async function getEthenaPositions(): Promise<UserPositionRow[]> {
  const settled = await Promise.allSettled(ETHENA_WALLETS.map(getPositionsByUser))
  const failures: { wallet: string; reason: unknown }[] = []
  const rows: UserPositionRow[] = []
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") rows.push(...r.value)
    else failures.push({ wallet: ETHENA_WALLETS[i]!, reason: r.reason })
  })
  if (failures.length > 0) {
    const summary = failures
      .map((f) => `${f.wallet}: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`)
      .join("; ")
    throw new Error(`Ethena position fetch failed for ${failures.length} wallet(s): ${summary}`)
  }
  return rows
}

