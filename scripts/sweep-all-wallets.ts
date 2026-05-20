import { createPublicClient, http, erc20Abi, type Address } from "viem"
import { mainnet } from "viem/chains"

const client = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`),
})

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

const TOKENS = [
  { sym: "PYUSD", addr: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as Address, dec: 6 },
  { sym: "USDtb", addr: "0xC139190F447e929f090Edeb554D95AbB8b18aC1C" as Address, dec: 18 },
  { sym: "USDC",  addr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, dec: 6 },
  { sym: "USDT",  addr: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, dec: 6 },
  { sym: "USDe",  addr: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3" as Address, dec: 18 },
  { sym: "sUSDe", addr: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497" as Address, dec: 18 },
]

const IN_API = new Set([
  "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
  "0x2bf5d9a2326ad3c5ef8208f91af79c3ca1f0f67c",
  "0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4",
  "0x3feaa7483fcfba130e68b41369dd78ff30465459",
  "0x1c3b25019ed4e4876e7af7903cc3e1e23287c337",
])

const rows: Array<{ wallet: string; inApi: boolean; tot: Record<string, number> }> = []
for (const w of WALLETS) {
  const tot: Record<string, number> = {}
  for (const t of TOKENS) {
    const raw = (await client.readContract({
      address: t.addr,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [w],
    })) as bigint
    const usd = Number(raw) / 10 ** t.dec
    if (usd > 0.01) tot[t.sym] = usd
  }
  rows.push({ wallet: w, inApi: IN_API.has(w), tot })
}

console.log(`Snapshot ${new Date().toISOString()}\n`)
console.log("WALLET                                              API  | " + TOKENS.map((t) => t.sym.padStart(10)).join("  "))
console.log("-".repeat(150))
for (const r of rows) {
  const mark = r.inApi ? " ✓ " : " ✗ "
  const cells = TOKENS.map((t) => {
    const v = r.tot[t.sym] ?? 0
    if (v === 0) return "         -"
    return v.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(10)
  })
  console.log(`${r.wallet} ${mark} | ${cells.join("  ")}`)
}
