/**
 * Per-asset gap analysis: Ethena's reported backing vs what we can verify
 * on-chain. Run from a residential network:
 *
 *   set -a && source .env.local && set +a
 *   node --experimental-strip-types scripts/gap-analysis.ts
 *
 * Focus is the Liquid Stables strategy — that's where the gap lives. Deployed
 * positions (Aave / Morpho / Kamino / Jupiter) already reconcile on the
 * dashboard. The reserve-fund wallet is bucketed separately: it's an
 * insurance fund, NOT backing, so Ethena's total excludes it and ours must
 * too.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createPublicClient, http, erc20Abi, type Address } from "viem"
import { mainnet } from "viem/chains"

const ROOT = join(import.meta.dirname, "..")
const RESERVE_FUND = "0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5".toLowerCase()

const WALLETS: Address[] = [
  "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
  "0xafbb1a7e9ddef38d9bc4a220e702b18dacaa2a62",
  "0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4",
  "0x2bf5d9a2326ad3c5ef8208f91af79c3ca1f0f67c",
  "0x6cd57b9a87c96421cfd7bc2b2f940c7e89cac4b5",
  "0xc7a455f687d1ed5d4d7edcc7563488c7e573d548",
  "0xe3490297a08d6fc8da46edb7b6142e4f461b62d3",
  "0xf270a1d7c68002da1ec8359f3958d4ec015729de",
  "0x1c3b25019ed4e4876e7af7903cc3e1e23287c337",
  "0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5",
  "0x3feaa7483fcfba130e68b41369dd78ff30465459",
]

// Liquid Stables lives entirely on Ethereum (RLUSD aside, which is XRPL).
const TOKENS = [
  { sym: "USDtb", addr: "0xC139190F447e929f090Edeb554D95AbB8b18aC1C" as Address, dec: 18 },
  { sym: "USDC", addr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, dec: 6 },
  { sym: "USDT", addr: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, dec: 6 },
  { sym: "PYUSD", addr: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as Address, dec: 6 },
]

const client = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`),
})

const fmt = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 })

// ── Ethena side — Liquid Stables per asset ────────────────────────────────
const snapshot = JSON.parse(readFileSync(join(ROOT, "data/ethena-snapshot.json"), "utf8"))
const liquid = snapshot.strategies.find((s: { strategy: string }) => s.strategy === "Liquid Stables")
const ethenaByAsset: Record<string, number> = {}
for (const cp of liquid.counterparties) {
  for (const a of cp.assets) ethenaByAsset[a.asset] = (ethenaByAsset[a.asset] ?? 0) + a.value
}

// ── Our side — read wallet balances, bucket the reserve fund apart ────────
const backing: Record<string, number> = {}
const reserveFund: Record<string, number> = {}

for (const token of TOKENS) {
  for (const wallet of WALLETS) {
    const raw = (await client.readContract({
      address: token.addr,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    })) as bigint
    const usd = Number(raw) / 10 ** token.dec
    const bucket = wallet.toLowerCase() === RESERVE_FUND ? reserveFund : backing
    bucket[token.sym] = (bucket[token.sym] ?? 0) + usd
  }
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nLiquid Stables — Ethena reports ${fmt(liquid.value)}\n`)
console.log(
  "ASSET    ETHENA REPORTED      OUR WALLETS      RESERVE FUND            GAP",
)
console.log("-".repeat(78))

let gapTotal = 0
const assets = ["USDtb", "USDC", "USDT", "PYUSD", "RLUSD"]
for (const sym of assets) {
  const ethena = ethenaByAsset[sym] ?? 0
  const ours = backing[sym] ?? 0
  const rf = reserveFund[sym] ?? 0
  const gap = ethena - ours // reserve fund already excluded from `ours`
  gapTotal += gap
  const note = sym === "RLUSD" ? "  (XRPL — no reader)" : ""
  console.log(
    `${sym.padEnd(8)} ${fmt(ethena).padStart(15)} ${fmt(ours).padStart(16)} ${fmt(rf).padStart(16)} ${fmt(gap).padStart(14)}${note}`,
  )
}
console.log("-".repeat(78))
console.log(`${"TOTAL GAP".padEnd(8)} ${" ".repeat(48)}${fmt(gapTotal).padStart(14)}`)
console.log(
  `\nReserve fund (0x2b5a…d4d5) holds ${fmt(
    Object.values(reserveFund).reduce((a, b) => a + b, 0),
  )} — insurance, excluded from backing on both sides.`,
)
