export const ETHENA_WALLETS = [
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
] as const

const SET = new Set(ETHENA_WALLETS.map((a) => a.toLowerCase()))

export function isEthenaWallet(addr: string): boolean {
  return SET.has(addr.toLowerCase())
}
