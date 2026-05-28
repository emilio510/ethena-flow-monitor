import { FLOW_WINDOW_DAYS, type Flow, type DiscoveredWallet, type RawFlow, type FlowChain } from "./types"
import { buildScanSet, buildKnownWalletSet, isRedeemSink } from "@/config/flows"
import { classifyFlow, classifyNewAddress, type DestHoldings, type DestProbe } from "./classify"
import { scanXrplFlows } from "./xrpl-flows"
import { scanEvmFlows } from "./evm-flows"
import { probeDestination } from "./probe"
import { mergeFlows, promoteWallets } from "./store"

export interface ScanDeps {
  scanXrpl: (wallets: string[], since: number) => Promise<RawFlow[]>
  scanEvm: (wallets: string[], since: number) => Promise<RawFlow[]>
  probe: (chain: FlowChain, addr: string) => Promise<DestHoldings>
}

const defaultDeps: ScanDeps = {
  scanXrpl: scanXrplFlows,
  scanEvm: scanEvmFlows,
  probe: probeDestination,
}

export interface ScanInput {
  existingFlows: Flow[]
  existingDiscovered: DiscoveredWallet[]
  nowUnix: number
}

export async function runScan(
  input: ScanInput,
  deps: ScanDeps = defaultDeps,
): Promise<{ flows: Flow[]; discovered: DiscoveredWallet[] }> {
  const { existingFlows, existingDiscovered, nowUnix } = input
  const sinceUnix = nowUnix - FLOW_WINDOW_DAYS * 86_400
  const scanSet = buildScanSet(existingDiscovered)
  const knownWallets = buildKnownWalletSet(existingDiscovered)

  const [xrplRaw, evmRaw] = await Promise.all([
    deps.scanXrpl(scanSet.xrpl, sinceUnix).catch((err) => {
      console.warn(`[flows] xrpl scan failed: ${err instanceof Error ? err.message : String(err)}`)
      return [] as RawFlow[]
    }),
    deps.scanEvm(scanSet.ethereum, sinceUnix).catch((err) => {
      console.warn(`[flows] evm scan failed: ${err instanceof Error ? err.message : String(err)}`)
      return [] as RawFlow[]
    }),
  ])

  const classified: Flow[] = []
  for (const raw of [...xrplRaw, ...evmRaw]) {
    const toKey = raw.chain === "ethereum" ? raw.to.toLowerCase() : raw.to
    const needsProbe = !isRedeemSink(raw.chain, raw.to) && !knownWallets.has(toKey)
    let probe: DestProbe | null = null
    if (needsProbe) {
      const holdings = await deps
        .probe(raw.chain, raw.to)
        .catch((err) => {
          console.warn(`[flows] probe failed for ${raw.to}: ${err instanceof Error ? err.message : String(err)}`)
          return null
        })
      probe = holdings ? classifyNewAddress(holdings) : null
    }
    classified.push({ ...raw, ...classifyFlow(raw, knownWallets, probe) })
  }

  const flows = mergeFlows(existingFlows, classified, nowUnix)
  const discovered = promoteWallets(existingDiscovered, classified, knownWallets, nowUnix)
  return { flows, discovered }
}
