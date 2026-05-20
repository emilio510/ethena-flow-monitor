import { createPublicClient, http, erc20Abi, type Address } from "viem"
import { mainnet } from "viem/chains"

const ALCHEMY_KEY = process.env.ALCHEMY_KEY ?? ""
const client = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
})

const WALLETS: Address[] = [
  "0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4",
  "0x1c3b25019ed4e4876e7af7903cc3e1e23287c337",
]

const TOKENS = [
  { sym: "USDC",  addr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, dec: 6  },
  { sym: "USDT",  addr: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, dec: 6  },
  { sym: "USDtb", addr: "0xC139190F447e929f090Edeb554D95AbB8b18aC1C" as Address, dec: 18 },
  { sym: "PYUSD", addr: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as Address, dec: 6  },
  { sym: "USDe",  addr: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3" as Address, dec: 18 },
  { sym: "sUSDe", addr: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497" as Address, dec: 18 },
]

async function main() {
  console.log("Snapshot:", new Date().toISOString())
  console.log("Per-wallet balances (USD, naïvely 1:1):\n")
  const totals: Record<string, number> = {}
  for (const w of WALLETS) {
    console.log(`Wallet ${w}:`)
    for (const t of TOKENS) {
      const raw = (await client.readContract({
        address: t.addr,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [w],
      })) as bigint
      const usd = Number(raw) / 10 ** t.dec
      if (usd > 0) {
        console.log(`  ${t.sym.padEnd(6)} ${usd.toLocaleString(undefined, {maximumFractionDigits: 0})}`)
        totals[t.sym] = (totals[t.sym] ?? 0) + usd
      }
    }
    console.log()
  }
  console.log("Sum across both wallets:")
  for (const [sym, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sym.padEnd(6)} $${v.toLocaleString(undefined, {maximumFractionDigits: 0})}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
