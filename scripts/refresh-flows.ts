/**
 * Refresh the committed Ethena flows ledger + discovered-wallets list.
 *
 * Run from a residential network via tsx (resolves @/ aliases and .ts):
 *   npx tsx --env-file=.env.local scripts/refresh-flows.ts
 *
 * Reads the existing committed files, scans XRPL + EVM for >=$1M outflows over
 * the last 90 days, classifies + promotes, and writes the files back.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { runScan } from "@/lib/flows/scan"
import { FlowsFileSchema, DiscoveredWalletsFileSchema } from "@/lib/flows/types"

const ROOT = join(import.meta.dirname, "..")
const FLOWS_FILE = join(ROOT, "data/ethena-flows.json")
const DISCOVERED_FILE = join(ROOT, "data/ethena-discovered-wallets.json")

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, "utf8")) as T
}

const existingFlows = FlowsFileSchema.parse(readJson(FLOWS_FILE, []))
const existingDiscovered = DiscoveredWalletsFileSchema.parse(readJson(DISCOVERED_FILE, []))

;(async () => {
  const { flows, discovered } = await runScan({
    existingFlows,
    existingDiscovered,
    nowUnix: Math.floor(Date.now() / 1000),
  })

  writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2) + "\n")
  writeFileSync(DISCOVERED_FILE, JSON.stringify(discovered, null, 2) + "\n")
  console.log(`✓ ${flows.length} flows, ${discovered.length} discovered wallets`)
})()
