import { tlFetch } from "./client"
import { UserPositionsResponse, type UserPositionRow } from "./schemas"
import { ETHENA_WALLETS } from "@/config/wallets"

// API max is 10000 rows per page. Larger pages cut sequential fetches by 10x;
// busy markets (ethereum, base) have 25k+ borrowers each.
const PAGE_SIZE = 10_000
const MAX_PAGES = 50

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
  const enc = encodeURIComponent(userAddress)
  return paginate(
    `user_address=${userAddress}`,
    (offset) =>
      `/internal/aave/user-positions/latest?user_address=${enc}&limit=${PAGE_SIZE}&offset=${offset}`,
  )
}

export interface MarketPositionsPage {
  rows: UserPositionRow[]
  /** True when the API returned a full page; the recursion compute is then
   * approximate (sampled from the first page only). */
  truncated: boolean
}

/**
 * Fetch one page (up to PAGE_SIZE rows) of borrowers in a market. We do NOT
 * paginate the full set: walking ethereum or base markets takes 25-60s and
 * exceeds Vercel Hobby tier's 10s function timeout. The recursion math
 * accepts that the first page is a sample and the result is approximate
 * for very large markets.
 */
export async function getMarketPositions(marketKey: string): Promise<MarketPositionsPage> {
  const enc = encodeURIComponent(marketKey)
  const raw = await tlFetch(
    `/internal/aave/user-positions/latest?market_key=${enc}&limit=${PAGE_SIZE}`,
  )
  const parsed = UserPositionsResponse.parse(raw)
  return {
    rows: parsed.data,
    truncated: parsed.data.length >= PAGE_SIZE,
  }
}

export interface MarketPositionsBulkResult {
  byMarket: Map<string, MarketPositionsPage>
  failedMarkets: string[]
}

/**
 * Fetch one-page samples for several markets in parallel with partial-data
 * tolerance. A single market timeout/failure does not blank the rest.
 */
export async function getMarketPositionsBulk(
  marketKeys: string[],
): Promise<MarketPositionsBulkResult> {
  const settled = await Promise.allSettled(marketKeys.map(getMarketPositions))
  const byMarket = new Map<string, MarketPositionsPage>()
  const failedMarkets: string[] = []
  settled.forEach((r, i) => {
    const mk = marketKeys[i]!
    if (r.status === "fulfilled") {
      byMarket.set(mk, r.value)
    } else {
      failedMarkets.push(mk)
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(`[ethena-flow-monitor] market fetch failed for ${mk}: ${reason}`)
    }
  })
  return { byMarket, failedMarkets }
}

export interface EthenaPositionsResult {
  rows: UserPositionRow[]
  failedWallets: string[]
}

/**
 * Fetch positions for every monitored Ethena wallet in parallel.
 *
 * Returns whatever data we got plus a list of wallets we failed to fetch, so
 * a single transient 429/timeout doesn't blank the whole dashboard. Throws
 * only when ALL wallets fail (genuine outage).
 */
export async function getEthenaPositions(): Promise<EthenaPositionsResult> {
  const settled = await Promise.allSettled(ETHENA_WALLETS.map(getPositionsByUser))
  const failedWallets: string[] = []
  const rows: UserPositionRow[] = []
  settled.forEach((r, i) => {
    const wallet = ETHENA_WALLETS[i]!
    if (r.status === "fulfilled") {
      rows.push(...r.value)
    } else {
      failedWallets.push(wallet)
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(`[ethena-flow-monitor] wallet fetch failed for ${wallet}: ${reason}`)
    }
  })
  if (failedWallets.length === ETHENA_WALLETS.length) {
    throw new Error("All Ethena position fetches failed — TokenLogic API likely unavailable")
  }
  return { rows, failedWallets }
}

