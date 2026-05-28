import { ETHENA_WALLETS, RESERVE_FUND_WALLET } from "./wallets";
import { ETHENA_XRPL_WALLETS, RLUSD_ISSUER } from "./xrpl";
import type { DiscoveredWallet, FlowChain } from "@/lib/flows/types";

/** Ethena's USDe MintRedeem contract (EVM). Sending USDe here is a redeem.
 *  Same address as the "USDe MintRedeem contract" entry in ETHENA_WALLETS /
 *  KNOWN_WALLET_LABELS (config/wallets.ts) — keep the two in sync. */
export const USDE_MINT_REDEEM = "0xe3490297a08d6fc8da46edb7b6142e4f461b62d3";

/** True when `to` is a burn/redeem sink for the given chain. */
export function isRedeemSink(chain: FlowChain, to: string): boolean {
  if (chain === "xrpl") return to === RLUSD_ISSUER;
  return to.toLowerCase() === USDE_MINT_REDEEM;
}

/** The set of wallets the scanners iterate: config backing + discovered. */
export function buildScanSet(discovered: DiscoveredWallet[]): {
  xrpl: string[];
  ethereum: string[];
} {
  const xrplExtra = discovered
    .filter((d) => d.chain === "xrpl")
    .map((d) => d.address);
  const evmExtra = discovered
    .filter((d) => d.chain === "ethereum")
    .map((d) => d.address.toLowerCase());
  return {
    xrpl: [...ETHENA_XRPL_WALLETS, ...xrplExtra],
    ethereum: [
      ...ETHENA_WALLETS.map((a) => a.toLowerCase()),
      RESERVE_FUND_WALLET.toLowerCase(),
      ...evmExtra,
    ],
  };
}

/** Normalized identity set of every wallet we consider "known Ethena":
 *  config backing + reserve fund + discovered. EVM lowercased, XRPL as-is. */
export function buildKnownWalletSet(
  discovered: DiscoveredWallet[],
): Set<string> {
  const s = new Set<string>();
  for (const a of ETHENA_WALLETS) s.add(a.toLowerCase());
  s.add(RESERVE_FUND_WALLET.toLowerCase());
  for (const a of ETHENA_XRPL_WALLETS) s.add(a);
  for (const d of discovered) {
    s.add(d.chain === "ethereum" ? d.address.toLowerCase() : d.address);
  }
  return s;
}
