import { describe, it, expect } from "vitest";
import {
  isRedeemSink,
  buildScanSet,
  buildKnownWalletSet,
  USDE_MINT_REDEEM,
} from "@/config/flows";
import { ETHENA_XRPL_WALLETS, RLUSD_ISSUER } from "@/config/xrpl";
import { ETHENA_WALLETS } from "@/config/wallets";
import type { DiscoveredWallet } from "@/lib/flows/types";

const discovered: DiscoveredWallet[] = [
  {
    address: "rNEWxrplWallet",
    chain: "xrpl",
    discoveredVia: "h1",
    firstSeen: 1,
    status: "quarantined",
  },
  {
    address: "0xABCDef0000000000000000000000000000000001",
    chain: "ethereum",
    discoveredVia: "h2",
    firstSeen: 2,
    status: "quarantined",
  },
];

describe("isRedeemSink", () => {
  it("treats the RLUSD issuer as an XRPL redeem sink", () => {
    expect(isRedeemSink("xrpl", RLUSD_ISSUER)).toBe(true);
    expect(isRedeemSink("xrpl", "rSomeoneElse")).toBe(false);
  });
  it("treats the USDe MintRedeem contract as an EVM redeem sink, case-insensitively", () => {
    expect(isRedeemSink("ethereum", USDE_MINT_REDEEM.toUpperCase())).toBe(true);
    expect(
      isRedeemSink("ethereum", "0x0000000000000000000000000000000000000000"),
    ).toBe(false);
  });
});

describe("buildScanSet", () => {
  it("includes config wallets plus discovered, per chain", () => {
    const set = buildScanSet(discovered);
    expect(set.xrpl).toContain(ETHENA_XRPL_WALLETS[0]);
    expect(set.xrpl).toContain("rNEWxrplWallet");
    expect(set.ethereum).toContain(ETHENA_WALLETS[0]);
    expect(set.ethereum).toContain(
      "0xabcdef0000000000000000000000000000000001",
    );
  });
});

describe("buildKnownWalletSet", () => {
  it("normalizes EVM lowercase and keeps XRPL case-sensitive", () => {
    const known = buildKnownWalletSet(discovered);
    expect(known.has(ETHENA_WALLETS[0].toLowerCase())).toBe(true);
    expect(known.has(ETHENA_XRPL_WALLETS[0])).toBe(true);
    expect(known.has("0xabcdef0000000000000000000000000000000001")).toBe(true);
    expect(known.has("rNEWxrplWallet")).toBe(true);
  });
});
