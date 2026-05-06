import { tlFetch } from "./client"
import { UserPositionsResponse, type UserPositionRow } from "./schemas"
import { ETHENA_WALLETS } from "@/config/wallets"

const PAGE_SIZE = 1000

export async function getPositionsByUser(userAddress: string): Promise<UserPositionRow[]> {
  const raw = await tlFetch(
    `/internal/aave/user-positions/latest?user_address=${userAddress}&limit=${PAGE_SIZE}`,
  )
  const parsed = UserPositionsResponse.parse(raw)
  return parsed.data
}

export async function getEthenaPositions(): Promise<UserPositionRow[]> {
  const all = await Promise.all(ETHENA_WALLETS.map(getPositionsByUser))
  return all.flat()
}

export async function getMarketPositions(marketKey: string): Promise<UserPositionRow[]> {
  const out: UserPositionRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const raw = await tlFetch(
      `/internal/aave/user-positions/latest?market_key=${marketKey}&limit=${PAGE_SIZE}&offset=${offset}`,
    )
    const parsed = UserPositionsResponse.parse(raw)
    out.push(...parsed.data)
    if (parsed.data.length < PAGE_SIZE) break
  }
  return out
}
