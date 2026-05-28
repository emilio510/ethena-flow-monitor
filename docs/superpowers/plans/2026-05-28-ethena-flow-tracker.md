# Ethena Flow Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect ≥$1M outflows from Ethena's monitored XRPL + EVM wallets daily, auto-classify each as redeem/rebalance/external with a confidence flag, surface them in a dashboard table, and auto-promote probable-new-Ethena addresses into the scan set while quarantining them from the backing total.

**Architecture:** Fetch-only scanner/classifier/store modules under `lib/flows/` (XRPL JSON-RPC + Alchemy JSON-RPC — no viem, no `server-only`) run inside the existing daily launchd job via `tsx`, writing committed `data/ethena-flows.json` + `data/ethena-discovered-wallets.json`. The Next app reads those JSON files statically (mirroring the backing-snapshot pattern) and renders a flows table; it imports only the `Flow` *type* from the lib, never the scanners.

**Tech Stack:** TypeScript, Next.js (App Router), zod, vitest, `tsx` (new devDep for running TS scripts with `@/` alias + `.ts` resolution), Tailwind + existing monochrome-glass primitives.

---

## Conventions used in this plan

- Tests live under `tests/flows/` (the repo keeps tests separate from source, mirroring the path — see `tests/onchain/xrpl.test.ts`).
- Vitest resolves the `@/` alias (see `vitest.config.ts`) and stubs `server-only`. Flow modules avoid `server-only` entirely so they also run under `tsx`.
- EVM addresses are lowercased everywhere; XRPL addresses are case-sensitive base58 and must NEVER be lowercased for identity (only for dedupe keys).
- Run a single test file: `npx vitest run tests/flows/<name>.test.ts`
- All commits omit attribution (repo convention).

---

## Task 1: Types, constants, and scan-set config

**Files:**
- Create: `lib/flows/types.ts`
- Create: `config/flows.ts`
- Test: `tests/flows/config.test.ts`
- Modify: `package.json` (add `tsx` devDependency)

- [ ] **Step 1: Add `tsx` devDependency**

Run: `cd ~/Projects/ethena-flow-monitor && pnpm add -D tsx`
Expected: `tsx` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Write `lib/flows/types.ts`**

```ts
import { z } from "zod"

/** Only flows of at least this USD value are recorded. */
export const FLOW_MIN_USD = 1_000_000
/** Rolling retention window for the flows ledger. */
export const FLOW_WINDOW_DAYS = 90
/** Seconds between the Unix epoch (1970) and the Ripple epoch (2000). */
export const RIPPLE_EPOCH_OFFSET = 946_684_800

export const FlowChainSchema = z.enum(["xrpl", "ethereum"])
export type FlowChain = z.infer<typeof FlowChainSchema>

export const ClassificationSchema = z.enum(["redeem", "rebalance", "external"])
export type Classification = z.infer<typeof ClassificationSchema>

export const ConfidenceSchema = z.enum(["high", "low"])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const FlowSchema = z.object({
  chain: FlowChainSchema,
  txHash: z.string(),
  timestamp: z.number(), // unix seconds
  from: z.string(),
  to: z.string(),
  asset: z.string(),
  amountUsd: z.number(),
  classification: ClassificationSchema,
  confidence: ConfidenceSchema,
  reason: z.string(),
})
export type Flow = z.infer<typeof FlowSchema>

/** A flow before classification — scanners emit these. */
export type RawFlow = Pick<
  Flow,
  "chain" | "txHash" | "timestamp" | "from" | "to" | "asset" | "amountUsd"
>

export const DiscoveredWalletSchema = z.object({
  address: z.string(),
  chain: FlowChainSchema,
  discoveredVia: z.string(), // txHash that introduced it
  firstSeen: z.number(),
  status: z.literal("quarantined"),
})
export type DiscoveredWallet = z.infer<typeof DiscoveredWalletSchema>

export const FlowsFileSchema = z.array(FlowSchema)
export const DiscoveredWalletsFileSchema = z.array(DiscoveredWalletSchema)
```

- [ ] **Step 3: Write `config/flows.ts`**

```ts
import { ETHENA_WALLETS, RESERVE_FUND_WALLET } from "./wallets"
import { ETHENA_XRPL_WALLETS, RLUSD_ISSUER } from "./xrpl"
import type { DiscoveredWallet, FlowChain } from "@/lib/flows/types"

/** Ethena's USDe MintRedeem contract (EVM). Sending USDe here is a redeem. */
export const USDE_MINT_REDEEM = "0xe3490297a08d6fc8da46edb7b6142e4f461b62d3"

/** True when `to` is a burn/redeem sink for the given chain. */
export function isRedeemSink(chain: FlowChain, to: string): boolean {
  if (chain === "xrpl") return to === RLUSD_ISSUER
  return to.toLowerCase() === USDE_MINT_REDEEM
}

/** The set of wallets the scanners iterate: config backing + discovered. */
export function buildScanSet(discovered: DiscoveredWallet[]): {
  xrpl: string[]
  ethereum: string[]
} {
  const xrplExtra = discovered.filter((d) => d.chain === "xrpl").map((d) => d.address)
  const evmExtra = discovered
    .filter((d) => d.chain === "ethereum")
    .map((d) => d.address.toLowerCase())
  return {
    xrpl: [...ETHENA_XRPL_WALLETS, ...xrplExtra],
    ethereum: [...ETHENA_WALLETS, RESERVE_FUND_WALLET, ...evmExtra],
  }
}

/** Normalized identity set of every wallet we consider "known Ethena":
 *  config backing + reserve fund + discovered. EVM lowercased, XRPL as-is. */
export function buildKnownWalletSet(discovered: DiscoveredWallet[]): Set<string> {
  const s = new Set<string>()
  for (const a of ETHENA_WALLETS) s.add(a.toLowerCase())
  s.add(RESERVE_FUND_WALLET.toLowerCase())
  for (const a of ETHENA_XRPL_WALLETS) s.add(a)
  for (const d of discovered) {
    s.add(d.chain === "ethereum" ? d.address.toLowerCase() : d.address)
  }
  return s
}
```

- [ ] **Step 4: Write `tests/flows/config.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { isRedeemSink, buildScanSet, buildKnownWalletSet, USDE_MINT_REDEEM } from "@/config/flows"
import { ETHENA_XRPL_WALLETS, RLUSD_ISSUER } from "@/config/xrpl"
import { ETHENA_WALLETS } from "@/config/wallets"
import type { DiscoveredWallet } from "@/lib/flows/types"

const discovered: DiscoveredWallet[] = [
  { address: "rNEWxrplWallet", chain: "xrpl", discoveredVia: "h1", firstSeen: 1, status: "quarantined" },
  { address: "0xABCDef0000000000000000000000000000000001", chain: "ethereum", discoveredVia: "h2", firstSeen: 2, status: "quarantined" },
]

describe("isRedeemSink", () => {
  it("treats the RLUSD issuer as an XRPL redeem sink", () => {
    expect(isRedeemSink("xrpl", RLUSD_ISSUER)).toBe(true)
    expect(isRedeemSink("xrpl", "rSomeoneElse")).toBe(false)
  })
  it("treats the USDe MintRedeem contract as an EVM redeem sink, case-insensitively", () => {
    expect(isRedeemSink("ethereum", USDE_MINT_REDEEM.toUpperCase())).toBe(true)
    expect(isRedeemSink("ethereum", "0x0000000000000000000000000000000000000000")).toBe(false)
  })
})

describe("buildScanSet", () => {
  it("includes config wallets plus discovered, per chain", () => {
    const set = buildScanSet(discovered)
    expect(set.xrpl).toContain(ETHENA_XRPL_WALLETS[0])
    expect(set.xrpl).toContain("rNEWxrplWallet")
    expect(set.ethereum).toContain(ETHENA_WALLETS[0])
    expect(set.ethereum).toContain("0xabcdef0000000000000000000000000000000001")
  })
})

describe("buildKnownWalletSet", () => {
  it("normalizes EVM lowercase and keeps XRPL case-sensitive", () => {
    const known = buildKnownWalletSet(discovered)
    expect(known.has(ETHENA_WALLETS[0].toLowerCase())).toBe(true)
    expect(known.has(ETHENA_XRPL_WALLETS[0])).toBe(true)
    expect(known.has("0xabcdef0000000000000000000000000000000001")).toBe(true)
    expect(known.has("rNEWxrplWallet")).toBe(true)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/flows/config.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/flows/types.ts config/flows.ts tests/flows/config.test.ts
git commit -m "feat: flow tracker types, constants, and scan-set config"
```

---

## Task 2: Classifier (incl. the `classifyNewAddress` heuristic)

**Files:**
- Create: `lib/flows/classify.ts`
- Test: `tests/flows/classify.test.ts`

> **Learning-mode note:** `classifyNewAddress()` is the domain-judgment seam — it encodes "what makes an address look like Ethena custody". The full implementation is below so the plan is complete, but during execution Emile may choose to author this ~12-line function himself. Keep its signature and return shape exactly as specified so the surrounding code and tests still line up.

- [ ] **Step 1: Write `tests/flows/classify.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { classifyFlow, classifyNewAddress, type DestHoldings } from "@/lib/flows/classify"
import { buildKnownWalletSet, USDE_MINT_REDEEM } from "@/config/flows"
import { RLUSD_ISSUER } from "@/config/xrpl"
import { ETHENA_XRPL_WALLETS } from "@/config/xrpl"
import type { RawFlow } from "@/lib/flows/types"

const known = buildKnownWalletSet([])
const base: RawFlow = {
  chain: "xrpl", txHash: "h", timestamp: 1, from: ETHENA_XRPL_WALLETS[0],
  to: "rDest", asset: "RLUSD", amountUsd: 5_000_000,
}

describe("classifyFlow", () => {
  it("flags a send to the redeem sink as redeem/high", () => {
    const r = classifyFlow({ ...base, to: RLUSD_ISSUER }, known, null)
    expect(r).toMatchObject({ classification: "redeem", confidence: "high" })
  })
  it("flags a send to a known Ethena wallet as rebalance/high", () => {
    const r = classifyFlow({ ...base, to: ETHENA_XRPL_WALLETS[1] }, known, null)
    expect(r).toMatchObject({ classification: "rebalance", confidence: "high" })
  })
  it("flags a probable-Ethena new address as rebalance with the probe's confidence", () => {
    const probe = { isProbableEthena: true, confidence: "high" as const, reason: "single RLUSD trust line" }
    const r = classifyFlow(base, known, probe)
    expect(r).toMatchObject({ classification: "rebalance", confidence: "high", reason: "single RLUSD trust line" })
  })
  it("flags an unrecognized destination as external/low", () => {
    const probe = { isProbableEthena: false, confidence: "low" as const, reason: "holds non-Ethena tokens: SHIB" }
    const r = classifyFlow(base, known, probe)
    expect(r).toMatchObject({ classification: "external", confidence: "low" })
  })
  it("normalizes EVM destination case when checking the known set", () => {
    const evmKnown = buildKnownWalletSet([
      { address: "0xAaaa000000000000000000000000000000000001", chain: "ethereum", discoveredVia: "x", firstSeen: 0, status: "quarantined" },
    ])
    const r = classifyFlow(
      { ...base, chain: "ethereum", to: "0xAAAA000000000000000000000000000000000001", asset: "USDe" },
      evmKnown, null,
    )
    expect(r.classification).toBe("rebalance")
  })
})

describe("classifyNewAddress", () => {
  it("XRPL single RLUSD trust line is high-confidence Ethena", () => {
    const h: DestHoldings = { chain: "xrpl", tokens: ["RLUSD"], trustLineCount: 1 }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: true, confidence: "high" })
  })
  it("EVM holding only Ethena stables is probable but low-confidence", () => {
    const h: DestHoldings = { chain: "ethereum", tokens: ["USDe", "USDC"] }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: true, confidence: "low" })
  })
  it("any non-Ethena token makes it not-probable", () => {
    const h: DestHoldings = { chain: "ethereum", tokens: ["USDe", "PEPE"] }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: false })
  })
  it("empty holdings are not probable", () => {
    const h: DestHoldings = { chain: "xrpl", tokens: [], trustLineCount: 0 }
    expect(classifyNewAddress(h)).toMatchObject({ isProbableEthena: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flows/classify.test.ts`
Expected: FAIL ("Cannot find module '@/lib/flows/classify'").

- [ ] **Step 3: Write `lib/flows/classify.ts`**

```ts
import { isRedeemSink } from "@/config/flows"
import type { RawFlow, Classification, Confidence, FlowChain } from "./types"

/** Holdings of a destination address, used to judge whether it is Ethena custody. */
export interface DestHoldings {
  chain: FlowChain
  /** XRPL: decoded trust-line currency symbols. EVM: ERC20 symbols with nonzero balance. */
  tokens: string[]
  /** XRPL only: number of trust lines on the account. */
  trustLineCount?: number
}

export interface DestProbe {
  isProbableEthena: boolean
  confidence: Confidence
  reason: string
}

export interface ClassifyResult {
  classification: Classification
  confidence: Confidence
  reason: string
}

/** Token symbols that count as Ethena-family stables. */
const ETHENA_STABLES = new Set(["RLUSD", "USDe", "sUSDe", "USDtb", "sUSDtb", "USDC", "USDT"])

/** Judge whether a never-before-seen destination looks like Ethena custody.
 *  Pure + testable; this is the domain-judgment seam. */
export function classifyNewAddress(h: DestHoldings): DestProbe {
  const onlyEthena = h.tokens.length > 0 && h.tokens.every((t) => ETHENA_STABLES.has(t))
  if (!onlyEthena) {
    return {
      isProbableEthena: false,
      confidence: "low",
      reason: `holds non-Ethena tokens: ${h.tokens.join(", ") || "none"}`,
    }
  }
  if (h.chain === "xrpl" && h.trustLineCount === 1) {
    return { isProbableEthena: true, confidence: "high", reason: "single RLUSD trust line — Ethena-custody pattern" }
  }
  return { isProbableEthena: true, confidence: "low", reason: `holds only Ethena stables (${h.tokens.join(", ")})` }
}

/** Classify one raw flow. `knownWallets` is normalized (EVM lowercase, XRPL as-is).
 *  `probe` is the destination judgment, or null when the destination is a sink
 *  or already known (no probe needed). */
export function classifyFlow(
  flow: RawFlow,
  knownWallets: Set<string>,
  probe: DestProbe | null,
): ClassifyResult {
  if (isRedeemSink(flow.chain, flow.to)) {
    return { classification: "redeem", confidence: "high", reason: "sent to redeem/burn sink" }
  }
  const toKey = flow.chain === "ethereum" ? flow.to.toLowerCase() : flow.to
  if (knownWallets.has(toKey)) {
    return { classification: "rebalance", confidence: "high", reason: "sent to a known Ethena wallet" }
  }
  if (probe?.isProbableEthena) {
    return { classification: "rebalance", confidence: probe.confidence, reason: probe.reason }
  }
  return {
    classification: "external",
    confidence: "low",
    reason: probe?.reason ?? "destination has no Ethena-custody signal",
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/flows/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flows/classify.ts tests/flows/classify.test.ts
git commit -m "feat: flow classifier with new-address heuristic"
```

---

## Task 3: Destination probe (XRPL account_lines + Alchemy token balances)

**Files:**
- Create: `lib/flows/probe.ts`
- Test: `tests/flows/probe.test.ts`

- [ ] **Step 1: Write `tests/flows/probe.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
})

describe("probeDestination — XRPL", () => {
  it("decodes trust-line currencies and counts them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { lines: [
        { currency: RLUSD_CURRENCY_HEX, account: RLUSD_ISSUER, balance: "80000000" },
      ] } }),
    })))
    const { probeDestination } = await import("@/lib/flows/probe")
    const h = await probeDestination("xrpl", "rDest")
    expect(h).toEqual({ chain: "xrpl", tokens: ["RLUSD"], trustLineCount: 1 })
  })
})

describe("probeDestination — EVM", () => {
  it("returns symbols for nonzero stable balances", async () => {
    // alchemy_getTokenBalances returns hex balances per contract.
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { tokenBalances: [
        { contractAddress: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", tokenBalance: "0x16345785d8a0000" }, // USDe, nonzero
        { contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", tokenBalance: "0x0" },              // USDC, zero
      ] } }),
    })))
    const { probeDestination } = await import("@/lib/flows/probe")
    const h = await probeDestination("ethereum", "0xDEST")
    expect(h).toEqual({ chain: "ethereum", tokens: ["USDe"] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flows/probe.test.ts`
Expected: FAIL ("Cannot find module '@/lib/flows/probe'").

- [ ] **Step 3: Write `lib/flows/probe.ts`**

```ts
import { RLUSD_ISSUER } from "@/config/xrpl"
import type { DestHoldings } from "./classify"
import type { FlowChain } from "./types"

const XRPL_RPC = "https://xrplcluster.com/"
const ALCHEMY_BASE = "https://eth-mainnet.g.alchemy.com/v2"
const TIMEOUT_MS = 15_000

/** Stable contracts we probe a destination for (lowercased) -> symbol. */
const STABLE_CONTRACTS: Record<string, string> = {
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USDe",
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "sUSDe",
  "0xc139190f447e929f090edeb554d95abb8b18ac1c": "USDtb",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
}

/** Decode an XRPL currency code (3-char ASCII, or 40-char hex) to a symbol. */
function decodeXrplCurrency(code: string): string {
  if (code.length <= 3) return code
  const hex = code.replace(/0+$/, "")
  let out = ""
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  }
  return out
}

interface XrplLine { currency: string; account: string; balance: string }

async function probeXrpl(address: string): Promise<DestHoldings> {
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "account_lines", params: [{ account: address, ledger_index: "validated" }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`XRPL account_lines HTTP ${res.status}`)
  const json = (await res.json()) as { result?: { lines?: XrplLine[]; error?: string } }
  const lines = json.result?.lines ?? []
  return {
    chain: "xrpl",
    tokens: lines.map((l) => decodeXrplCurrency(l.currency)),
    trustLineCount: lines.length,
  }
}

interface AlchemyTokenBalance { contractAddress: string; tokenBalance: string | null }

async function probeEvm(address: string): Promise<DestHoldings> {
  const key = process.env.ALCHEMY_KEY
  if (!key) throw new Error("ALCHEMY_KEY is not set")
  const res = await fetch(`${ALCHEMY_BASE}/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances",
      params: [address, Object.keys(STABLE_CONTRACTS)],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Alchemy getTokenBalances HTTP ${res.status}`)
  const json = (await res.json()) as { result?: { tokenBalances?: AlchemyTokenBalance[] }; error?: { message?: string } }
  if (json.error) throw new Error(`Alchemy error: ${json.error.message}`)
  const balances = json.result?.tokenBalances ?? []
  const tokens = balances
    .filter((b) => b.tokenBalance && BigInt(b.tokenBalance) > 0n)
    .map((b) => STABLE_CONTRACTS[b.contractAddress.toLowerCase()])
    .filter((s): s is string => Boolean(s))
  return { chain: "ethereum", tokens }
}

/** Fetch the holdings of a destination address for new-address judgment. */
export async function probeDestination(chain: FlowChain, address: string): Promise<DestHoldings> {
  return chain === "xrpl" ? probeXrpl(address) : probeEvm(address)
}
```

> Note: `RLUSD_ISSUER` is imported only to keep the module cohesive with the XRPL config; if your linter flags it as unused, drop the import. (Leaving this explicit so the engineer isn't surprised by a lint warning.)

Correction: remove the unused `RLUSD_ISSUER` import — `probeXrpl` does not filter by issuer (it reports all trust lines so the heuristic can see non-Ethena tokens). Final import line:

```ts
import type { DestHoldings } from "./classify"
import type { FlowChain } from "./types"
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/flows/probe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flows/probe.ts tests/flows/probe.test.ts
git commit -m "feat: destination holdings probe for new-address judgment"
```

---

## Task 4: XRPL flow scanner

**Files:**
- Create: `lib/flows/xrpl-flows.ts`
- Test: `tests/flows/xrpl-flows.test.ts`

- [ ] **Step 1: Write `tests/flows/xrpl-flows.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"
import { RIPPLE_EPOCH_OFFSET } from "@/lib/flows/types"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

/** Build one account_tx item in the xrplcluster shape (tx + hash + meta). */
function payment(opts: { from: string; to: string; value: string; rippleDate: number; hash: string; result?: string }) {
  return {
    tx: {
      TransactionType: "Payment",
      Account: opts.from,
      Destination: opts.to,
      Amount: { currency: RLUSD_CURRENCY_HEX, issuer: RLUSD_ISSUER, value: opts.value },
      date: opts.rippleDate,
    },
    hash: opts.hash,
    meta: { TransactionResult: opts.result ?? "tesSUCCESS" },
  }
}

function stubAccountTx(byAccount: Record<string, unknown[]>) {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}")
    const account = body.params?.[0]?.account as string
    return { ok: true, status: 200, json: async () => ({ result: { transactions: byAccount[account] ?? [] } }) }
  }))
}

const WALLET = "rWALLET1"
// 2026-05-26 13:24 UTC in unix = 1779801840; ripple date = unix - offset.
const RECENT_RIPPLE = 1779801840 - RIPPLE_EPOCH_OFFSET
const since = 1779801840 - 7 * 86_400 // window start a week earlier

describe("scanXrplFlows", () => {
  it("returns ≥$1M outgoing RLUSD payments with converted timestamps", async () => {
    stubAccountTx({ [WALLET]: [payment({ from: WALLET, to: "rDEST", value: "70000000", rippleDate: RECENT_RIPPLE, hash: "H1" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    const flows = await scanXrplFlows([WALLET], since)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ chain: "xrpl", from: WALLET, to: "rDEST", asset: "RLUSD", amountUsd: 70_000_000, txHash: "H1" })
    expect(flows[0].timestamp).toBe(RECENT_RIPPLE + RIPPLE_EPOCH_OFFSET)
  })
  it("drops sub-$1M payments", async () => {
    stubAccountTx({ [WALLET]: [payment({ from: WALLET, to: "rDEST", value: "999999", rippleDate: RECENT_RIPPLE, hash: "H2" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
  it("drops incoming payments (wallet is the Destination, not Account)", async () => {
    stubAccountTx({ [WALLET]: [payment({ from: "rOTHER", to: WALLET, value: "5000000", rippleDate: RECENT_RIPPLE, hash: "H3" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
  it("drops payments older than the window", async () => {
    const oldRipple = since - RIPPLE_EPOCH_OFFSET - 86_400
    stubAccountTx({ [WALLET]: [payment({ from: WALLET, to: "rDEST", value: "5000000", rippleDate: oldRipple, hash: "H4" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
  it("ignores non-Payment txs and failed txs", async () => {
    stubAccountTx({ [WALLET]: [
      { tx: { TransactionType: "TrustSet", Account: WALLET, date: RECENT_RIPPLE }, hash: "H5", meta: { TransactionResult: "tesSUCCESS" } },
      payment({ from: WALLET, to: "rDEST", value: "5000000", rippleDate: RECENT_RIPPLE, hash: "H6", result: "tecPATH_DRY" }),
    ] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flows/xrpl-flows.test.ts`
Expected: FAIL ("Cannot find module '@/lib/flows/xrpl-flows'").

- [ ] **Step 3: Write `lib/flows/xrpl-flows.ts`**

```ts
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"
import { FLOW_MIN_USD, RIPPLE_EPOCH_OFFSET, type RawFlow } from "./types"

const XRPL_RPC = "https://xrplcluster.com/"
const TIMEOUT_MS = 15_000
const PAGE_LIMIT = 200

interface XrplIssuedAmount { currency: string; issuer: string; value: string }
interface XrplPaymentTx {
  TransactionType?: string
  Account?: string
  Destination?: string
  Amount?: XrplIssuedAmount | string
  date?: number
  hash?: string
}
interface XrplTxItem {
  tx?: XrplPaymentTx
  tx_json?: XrplPaymentTx
  hash?: string
  meta?: { TransactionResult?: string }
  meta_blob?: unknown
}

async function accountTx(account: string): Promise<XrplTxItem[]> {
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "account_tx",
      params: [{ account, ledger_index_min: -1, ledger_index_max: -1, limit: PAGE_LIMIT, forward: false }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`XRPL account_tx HTTP ${res.status}`)
  const json = (await res.json()) as {
    result?: { transactions?: XrplTxItem[]; error?: string; error_message?: string }
  }
  const result = json.result
  if (!result || result.error) {
    throw new Error(`XRPL account_tx error: ${result?.error_message ?? result?.error ?? "no result"}`)
  }
  return result.transactions ?? []
}

/** Scan outgoing RLUSD payments ≥ $1M from each XRPL wallet, since `sinceUnix`. */
export async function scanXrplFlows(wallets: string[], sinceUnix: number): Promise<RawFlow[]> {
  const flows: RawFlow[] = []
  for (const wallet of wallets) {
    const items = await accountTx(wallet)
    for (const item of items) {
      const tx = item.tx_json ?? item.tx
      if (!tx || tx.TransactionType !== "Payment") continue
      if (tx.Account !== wallet) continue // outflow only
      const amt = tx.Amount
      if (typeof amt !== "object" || amt === null) continue // XRP drops, not RLUSD
      if (amt.currency.toUpperCase() !== RLUSD_CURRENCY_HEX || amt.issuer !== RLUSD_ISSUER) continue
      const result = item.meta?.TransactionResult
      if (result && result !== "tesSUCCESS") continue
      const timestamp = (tx.date ?? 0) + RIPPLE_EPOCH_OFFSET
      if (timestamp < sinceUnix) continue
      const amountUsd = Number(amt.value)
      if (!(amountUsd >= FLOW_MIN_USD)) continue
      flows.push({
        chain: "xrpl",
        txHash: item.hash ?? tx.hash ?? "",
        timestamp,
        from: wallet,
        to: tx.Destination ?? "",
        asset: "RLUSD",
        amountUsd,
      })
    }
  }
  return flows
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/flows/xrpl-flows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flows/xrpl-flows.ts tests/flows/xrpl-flows.test.ts
git commit -m "feat: XRPL RLUSD outflow scanner"
```

---

## Task 5: EVM flow scanner (Alchemy getAssetTransfers)

**Files:**
- Create: `lib/flows/evm-flows.ts`
- Test: `tests/flows/evm-flows.test.ts`

- [ ] **Step 1: Write `tests/flows/evm-flows.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
})

function transfer(opts: { hash: string; from: string; to: string; value: number; contract: string; asset: string; iso: string }) {
  return {
    hash: opts.hash, from: opts.from, to: opts.to, value: opts.value, asset: opts.asset,
    rawContract: { address: opts.contract }, metadata: { blockTimestamp: opts.iso },
  }
}

function stubTransfers(items: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ result: { transfers: items } }),
  })))
}

const WALLET = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"
const USDE = "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3"
const RECENT_ISO = "2026-05-26T13:24:00.000Z"
const since = Math.floor(new Date("2026-05-19T00:00:00Z").getTime() / 1000)

describe("scanEvmFlows", () => {
  it("returns ≥$1M transfers, mapping contract to symbol and ISO to unix", async () => {
    stubTransfers([transfer({ hash: "0xH1", from: WALLET, to: "0xDEST", value: 5_000_000, contract: USDE, asset: "USDe", iso: RECENT_ISO })])
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    const flows = await scanEvmFlows([WALLET], since)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ chain: "ethereum", from: WALLET.toLowerCase(), to: "0xdest", asset: "USDe", amountUsd: 5_000_000, txHash: "0xH1" })
    expect(flows[0].timestamp).toBe(Math.floor(new Date(RECENT_ISO).getTime() / 1000))
  })
  it("drops sub-$1M transfers", async () => {
    stubTransfers([transfer({ hash: "0xH2", from: WALLET, to: "0xDEST", value: 999_999, contract: USDE, asset: "USDe", iso: RECENT_ISO })])
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    expect(await scanEvmFlows([WALLET], since)).toHaveLength(0)
  })
  it("drops transfers older than the window", async () => {
    stubTransfers([transfer({ hash: "0xH3", from: WALLET, to: "0xDEST", value: 5_000_000, contract: USDE, asset: "USDe", iso: "2026-01-01T00:00:00Z" })])
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    expect(await scanEvmFlows([WALLET], since)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flows/evm-flows.test.ts`
Expected: FAIL ("Cannot find module '@/lib/flows/evm-flows'").

- [ ] **Step 3: Write `lib/flows/evm-flows.ts`**

```ts
import { FLOW_MIN_USD, type RawFlow } from "./types"

const ALCHEMY_BASE = "https://eth-mainnet.g.alchemy.com/v2"
const TIMEOUT_MS = 20_000

/** Ethena-family stable contracts (lowercased) -> symbol. */
const STABLE_CONTRACTS: Record<string, string> = {
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USDe",
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "sUSDe",
  "0xc139190f447e929f090edeb554d95abb8b18ac1c": "USDtb",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
}

interface EvmTransfer {
  hash: string
  from: string
  to: string | null
  value: number | null
  asset: string | null
  rawContract: { address: string }
  metadata: { blockTimestamp: string }
}

async function getAssetTransfers(fromAddress: string): Promise<EvmTransfer[]> {
  const key = process.env.ALCHEMY_KEY
  if (!key) throw new Error("ALCHEMY_KEY is not set")
  const res = await fetch(`${ALCHEMY_BASE}/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1, jsonrpc: "2.0", method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: "0x0", toBlock: "latest", fromAddress,
        contractAddresses: Object.keys(STABLE_CONTRACTS),
        category: ["erc20"], withMetadata: true, excludeZeroValue: true,
        maxCount: "0x3e8", order: "desc",
      }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Alchemy getAssetTransfers HTTP ${res.status}`)
  const json = (await res.json()) as { result?: { transfers?: EvmTransfer[] }; error?: { message?: string } }
  if (json.error) throw new Error(`Alchemy error: ${json.error.message}`)
  return json.result?.transfers ?? []
}

/** Scan outgoing Ethena-stable ERC20 transfers ≥ $1M from each EVM wallet. */
export async function scanEvmFlows(wallets: string[], sinceUnix: number): Promise<RawFlow[]> {
  const flows: RawFlow[] = []
  for (const wallet of wallets) {
    const transfers = await getAssetTransfers(wallet)
    for (const t of transfers) {
      const timestamp = Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000)
      if (Number.isNaN(timestamp) || timestamp < sinceUnix) continue
      const amountUsd = t.value ?? 0
      if (!(amountUsd >= FLOW_MIN_USD)) continue
      const symbol = STABLE_CONTRACTS[t.rawContract.address.toLowerCase()] ?? t.asset ?? "?"
      flows.push({
        chain: "ethereum",
        txHash: t.hash,
        timestamp,
        from: wallet.toLowerCase(),
        to: (t.to ?? "").toLowerCase(),
        asset: symbol,
        amountUsd,
      })
    }
  }
  return flows
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/flows/evm-flows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flows/evm-flows.ts tests/flows/evm-flows.test.ts
git commit -m "feat: EVM stable-outflow scanner via Alchemy getAssetTransfers"
```

---

## Task 6: Store — merge/dedupe/prune and promotion

**Files:**
- Create: `lib/flows/store.ts`
- Test: `tests/flows/store.test.ts`

- [ ] **Step 1: Write `tests/flows/store.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { mergeFlows, promoteWallets } from "@/lib/flows/store"
import { buildKnownWalletSet } from "@/config/flows"
import type { Flow } from "@/lib/flows/types"

const NOW = 1_780_000_000
const recent = (over: Partial<Flow>): Flow => ({
  chain: "xrpl", txHash: "H", timestamp: NOW - 1000, from: "rA", to: "rB",
  asset: "RLUSD", amountUsd: 5_000_000, classification: "rebalance", confidence: "high", reason: "r", ...over,
})

describe("mergeFlows", () => {
  it("dedupes by chain+txHash+to+asset and sorts newest first", () => {
    const a = recent({ txHash: "H1", timestamp: NOW - 2000 })
    const b = recent({ txHash: "H2", timestamp: NOW - 1000 })
    const dupOfA = recent({ txHash: "H1", timestamp: NOW - 2000 })
    const merged = mergeFlows([a], [b, dupOfA], NOW)
    expect(merged.map((f) => f.txHash)).toEqual(["H2", "H1"])
  })
  it("drops flows older than 90 days", () => {
    const old = recent({ txHash: "OLD", timestamp: NOW - 91 * 86_400 })
    const fresh = recent({ txHash: "NEW", timestamp: NOW - 1000 })
    const merged = mergeFlows([old], [fresh], NOW)
    expect(merged.map((f) => f.txHash)).toEqual(["NEW"])
  })
})

describe("promoteWallets", () => {
  const known = buildKnownWalletSet([])
  it("promotes high-confidence rebalance destinations to quarantined", () => {
    const flows = [recent({ chain: "xrpl", to: "rNEW", classification: "rebalance", confidence: "high", txHash: "P1" })]
    const out = promoteWallets([], flows, known, NOW)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ address: "rNEW", chain: "xrpl", discoveredVia: "P1", status: "quarantined" })
  })
  it("does NOT promote low-confidence or external or already-known", () => {
    const flows = [
      recent({ to: "rLOW", confidence: "low", txHash: "P2" }),
      recent({ to: "rEXT", classification: "external", confidence: "low", txHash: "P3" }),
    ]
    expect(promoteWallets([], flows, known, NOW)).toHaveLength(0)
  })
  it("is idempotent — does not double-add an already-discovered address", () => {
    const flows = [recent({ to: "rNEW", confidence: "high", txHash: "P4" })]
    const existing = promoteWallets([], flows, known, NOW)
    const again = promoteWallets(existing, flows, known, NOW)
    expect(again).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flows/store.test.ts`
Expected: FAIL ("Cannot find module '@/lib/flows/store'").

- [ ] **Step 3: Write `lib/flows/store.ts`**

```ts
import { FLOW_WINDOW_DAYS, type Flow, type DiscoveredWallet } from "./types"

function dedupeKey(f: Flow): string {
  return `${f.chain}:${f.txHash}:${f.to.toLowerCase()}:${f.asset}`
}

/** Merge incoming classified flows into the existing ledger: drop anything
 *  older than the window, dedupe (incoming wins), newest first. */
export function mergeFlows(existing: Flow[], incoming: Flow[], nowUnix: number): Flow[] {
  const cutoff = nowUnix - FLOW_WINDOW_DAYS * 86_400
  const byKey = new Map<string, Flow>()
  for (const f of existing) {
    if (f.timestamp >= cutoff) byKey.set(dedupeKey(f), f)
  }
  for (const f of incoming) {
    if (f.timestamp >= cutoff) byKey.set(dedupeKey(f), f)
  }
  return [...byKey.values()].sort((a, b) => b.timestamp - a.timestamp)
}

/** Append high-confidence rebalance destinations (not already known/discovered)
 *  to the discovered-wallets list as quarantined. Idempotent. */
export function promoteWallets(
  existing: DiscoveredWallet[],
  flows: Flow[],
  knownWallets: Set<string>,
  _nowUnix: number,
): DiscoveredWallet[] {
  const have = new Set(existing.map((d) => `${d.chain}:${d.address.toLowerCase()}`))
  const out = [...existing]
  for (const f of flows) {
    if (f.classification !== "rebalance" || f.confidence !== "high") continue
    const norm = f.chain === "ethereum" ? f.to.toLowerCase() : f.to
    if (knownWallets.has(norm)) continue
    const key = `${f.chain}:${f.to.toLowerCase()}`
    if (have.has(key)) continue
    have.add(key)
    out.push({ address: f.to, chain: f.chain, discoveredVia: f.txHash, firstSeen: f.timestamp, status: "quarantined" })
  }
  return out
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/flows/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flows/store.ts tests/flows/store.test.ts
git commit -m "feat: flow ledger merge/prune and wallet promotion"
```

---

## Task 7: Orchestrator

**Files:**
- Create: `lib/flows/scan.ts`
- Test: `tests/flows/scan.test.ts`

- [ ] **Step 1: Write `tests/flows/scan.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { runScan, type ScanDeps } from "@/lib/flows/scan"
import { RLUSD_ISSUER, ETHENA_XRPL_WALLETS } from "@/config/xrpl"
import type { RawFlow } from "@/lib/flows/types"
import type { DestHoldings } from "@/lib/flows/classify"

const NOW = 1_780_000_000
const ts = NOW - 1000

function deps(over: Partial<ScanDeps>): ScanDeps {
  return {
    scanXrpl: async () => [],
    scanEvm: async () => [],
    probe: async () => ({ chain: "xrpl", tokens: [], trustLineCount: 0 } as DestHoldings),
    ...over,
  }
}

describe("runScan", () => {
  it("classifies a redeem (to issuer) without probing", async () => {
    const raw: RawFlow = { chain: "xrpl", txHash: "R1", timestamp: ts, from: ETHENA_XRPL_WALLETS[0], to: RLUSD_ISSUER, asset: "RLUSD", amountUsd: 5_000_000 }
    const { flows } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({ scanXrpl: async () => [raw] }),
    )
    expect(flows[0]).toMatchObject({ classification: "redeem", confidence: "high" })
  })
  it("classifies a probable new XRPL address as rebalance/high and promotes it", async () => {
    const raw: RawFlow = { chain: "xrpl", txHash: "R2", timestamp: ts, from: ETHENA_XRPL_WALLETS[0], to: "rFRESH", asset: "RLUSD", amountUsd: 80_000_000 }
    const { flows, discovered } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({
        scanXrpl: async () => [raw],
        probe: async () => ({ chain: "xrpl", tokens: ["RLUSD"], trustLineCount: 1 }),
      }),
    )
    expect(flows[0]).toMatchObject({ classification: "rebalance", confidence: "high" })
    expect(discovered).toHaveLength(1)
    expect(discovered[0].address).toBe("rFRESH")
  })
  it("classifies a noisy new address as external/low and does NOT promote", async () => {
    const raw: RawFlow = { chain: "ethereum", txHash: "0xR3", timestamp: ts, from: "0xfrom", to: "0xexchange", asset: "USDe", amountUsd: 5_000_000 }
    const { flows, discovered } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({
        scanEvm: async () => [raw],
        probe: async () => ({ chain: "ethereum", tokens: ["USDe", "WETH", "PEPE"] }),
      }),
    )
    expect(flows[0]).toMatchObject({ classification: "external", confidence: "low" })
    expect(discovered).toHaveLength(0)
  })
  it("survives a scanner that throws (logs, returns the other chain's flows)", async () => {
    const raw: RawFlow = { chain: "xrpl", txHash: "R4", timestamp: ts, from: ETHENA_XRPL_WALLETS[0], to: RLUSD_ISSUER, asset: "RLUSD", amountUsd: 5_000_000 }
    const { flows } = await runScan(
      { existingFlows: [], existingDiscovered: [], nowUnix: NOW },
      deps({ scanXrpl: async () => [raw], scanEvm: async () => { throw new Error("rpc down") } }),
    )
    expect(flows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flows/scan.test.ts`
Expected: FAIL ("Cannot find module '@/lib/flows/scan'").

- [ ] **Step 3: Write `lib/flows/scan.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/flows/scan.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole flows suite**

Run: `npx vitest run tests/flows/`
Expected: PASS (config, classify, probe, xrpl-flows, evm-flows, store, scan).

- [ ] **Step 6: Commit**

```bash
git add lib/flows/scan.ts tests/flows/scan.test.ts
git commit -m "feat: flow scan orchestrator with injectable deps"
```

---

## Task 8: Refresh script, data files, config + launchd integration

**Files:**
- Create: `scripts/refresh-flows.ts`
- Create: `data/ethena-flows.json` (seed `[]`)
- Create: `data/ethena-discovered-wallets.json` (seed `[]`)
- Modify: `config/xrpl.ts` (add the two confirmed 2026-05-26 destinations)
- Modify: `scripts/refresh-and-push.sh` (add the flows step)
- Modify: `package.json` (add `refresh:flows` script)

- [ ] **Step 1: Seed the data files**

Create `data/ethena-flows.json` with exactly:
```json
[]
```
Create `data/ethena-discovered-wallets.json` with exactly:
```json
[]
```

- [ ] **Step 2: Add the two confirmed destinations to `config/xrpl.ts`**

These were human-confirmed today (2026-05-26 trace), so they join the *backing* set directly. Replace the `ETHENA_XRPL_WALLETS` array:

```ts
export const ETHENA_XRPL_WALLETS = [
  "r4vFWRRZBXsWipgCLJBs6EqnMh7MRHbhyp",
  "rp1edBgyjbAsjXXHrhGtGUK2v6D6XhMTwc",
  // Confirmed 2026-05-26: received the ~150M RLUSD rebalance from the two
  // wallets above (80M and 70M respectively). Single RLUSD trust line each.
  "rfxRtJ3apsuJs5TauCHCZB7ab4C1WvoBs",
  "rL287GiGdF4BBnEwTBpGgduZt2KnEkAFX",
] as const
```

- [ ] **Step 3: Update the XRPL holdings test for the new wallet count**

In `tests/onchain/xrpl.test.ts`, the first test stubs only `ETHENA_XRPL_WALLETS[0]` and `[1]`; the reader now iterates 4 wallets, and unstubbed accounts return `[]`, so totals are unaffected — but `expect(r.wallets).toHaveLength(2)` must become `toHaveLength(4)`. Change that single assertion:

```ts
    expect(r.wallets).toHaveLength(4)
```

- [ ] **Step 4: Run the onchain test to confirm it still passes**

Run: `npx vitest run tests/onchain/xrpl.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `scripts/refresh-flows.ts`**

```ts
/**
 * Refresh the committed Ethena flows ledger + discovered-wallets list.
 *
 * Run from a residential network via tsx (resolves @/ aliases and .ts):
 *   npx tsx --env-file=.env.local scripts/refresh-flows.ts
 *
 * Reads the existing committed files, scans XRPL + EVM for ≥$1M outflows over
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

const { flows, discovered } = await runScan({
  existingFlows,
  existingDiscovered,
  nowUnix: Math.floor(Date.now() / 1000),
})

writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2) + "\n")
writeFileSync(DISCOVERED_FILE, JSON.stringify(discovered, null, 2) + "\n")
console.log(`✓ ${flows.length} flows, ${discovered.length} discovered wallets`)
```

- [ ] **Step 6: Add the npm script**

In `package.json` `scripts`, add:
```json
    "refresh:flows": "tsx --env-file=.env.local scripts/refresh-flows.ts"
```

- [ ] **Step 7: Add the flows step to `scripts/refresh-and-push.sh`**

Replace the body after the snapshot block so both steps run independently and a single commit captures whatever changed. The full new file:

```bash
#!/bin/bash
#
# launchd entrypoint: refresh the committed Ethena snapshot AND flows ledger,
# then push. The snapshot fetch hits Ethena's Cloudflare-gated API (residential
# IP only); the flows scan hits public on-chain RPCs. The two are independent —
# one failing must not block or clobber the other.
#
# Install / reinstall:
#   cp scripts/com.ethena-flow.refresh.plist ~/Library/LaunchAgents/
#   launchctl unload ~/Library/LaunchAgents/com.ethena-flow.refresh.plist 2>/dev/null
#   launchctl load   ~/Library/LaunchAgents/com.ethena-flow.refresh.plist
#
# Run once by hand:  bash scripts/refresh-and-push.sh

set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ethena refresh ==="

# Step 1: backing snapshot (Ethena API). Non-fatal on failure.
if node --experimental-strip-types scripts/refresh-ethena-snapshot.ts; then
  echo "snapshot: ok"
else
  echo "snapshot: FAILED (Cloudflare/network) — keeping previous data"
fi

# Step 2: flows ledger (on-chain RPCs). Non-fatal on failure.
if npx tsx --env-file=.env.local scripts/refresh-flows.ts; then
  echo "flows: ok"
else
  echo "flows: FAILED — keeping previous data"
fi

# Commit whatever changed across both steps.
if git diff --quiet -- data/; then
  echo "data/ unchanged — nothing to push."
  exit 0
fi

git add data/
git commit -m "chore: refresh ethena snapshot + flows ($(date -u +%Y-%m-%dT%H:%MZ))"
git push
echo "=== pushed — Vercel will redeploy ==="
```

Note the change from `set -euo pipefail` to `set -uo pipefail`: dropping `-e` lets a failed step be handled by the `if` guards instead of aborting the whole script. A partial write is impossible because each script writes files only on success.

- [ ] **Step 8: Populate the ledger for the first time + verify**

Run: `cd ~/Projects/ethena-flow-monitor && npx tsx --env-file=.env.local scripts/refresh-flows.ts`
Expected: console prints `✓ N flows, M discovered wallets` with N ≥ 3 (today's three RLUSD rebalances appear, classified `rebalance`/`high` because their destinations are now in `ETHENA_XRPL_WALLETS`). `data/ethena-flows.json` is now populated; verify the three known RLUSD flows are present with `classification: "rebalance"`.

If `.env.local` does not exist or lacks `ALCHEMY_KEY`, create/append it: `ALCHEMY_KEY=cxTQANuSJZ1FB8Q2TL4N6` (the project's archive-enabled key). Confirm with `grep ALCHEMY_KEY .env.local`.

- [ ] **Step 9: Commit**

```bash
git add config/xrpl.ts tests/onchain/xrpl.test.ts scripts/refresh-flows.ts scripts/refresh-and-push.sh package.json data/ethena-flows.json data/ethena-discovered-wallets.json
git commit -m "feat: flows refresh script, seed data, and launchd integration"
```

---

## Task 9: Flows table component + page mount

**Files:**
- Create: `components/flows-table.tsx`
- Test: `tests/components/flows-table.test.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `tests/components/flows-table.test.tsx`**

```tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FlowsTable } from "@/components/flows-table"
import type { Flow } from "@/lib/flows/types"

const flows: Flow[] = [
  { chain: "xrpl", txHash: "H1", timestamp: 1779801840, from: "r4vFWRRZBXsWipgCLJBs6EqnMh7MRHbhyp", to: "rfxRtJ3apsuJs5TauCHCZB7ab4C1WvoBs", asset: "RLUSD", amountUsd: 80_000_000, classification: "rebalance", confidence: "high", reason: "known wallet" },
  { chain: "ethereum", txHash: "0xH2", timestamp: 1779800000, from: "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c", to: "0xexchange00000000000000000000000000000000", asset: "USDe", amountUsd: 5_000_000, classification: "external", confidence: "low", reason: "holds non-Ethena tokens" },
]

describe("FlowsTable", () => {
  it("renders one row per flow with amount and classification", () => {
    render(<FlowsTable flows={flows} />)
    expect(screen.getByText("$80.00M")).toBeInTheDocument()
    expect(screen.getByText("rebalance")).toBeInTheDocument()
    expect(screen.getByText("external")).toBeInTheDocument()
  })
  it("marks low-confidence rows with a 'low confidence' tag", () => {
    render(<FlowsTable flows={flows} />)
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument()
  })
  it("renders an empty state when there are no flows", () => {
    render(<FlowsTable flows={[]} />)
    expect(screen.getByText(/no flows/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/flows-table.test.tsx`
Expected: FAIL ("Cannot find module '@/components/flows-table'").

- [ ] **Step 3: Write `components/flows-table.tsx`**

```tsx
import { GlassCard } from "@/components/ui/glass-card"
import { SectionHead } from "@/components/ui/section-head"
import { Tag } from "@/components/ui/tag"
import { fmtUsd, shortAddr } from "@/lib/format"
import { KNOWN_WALLET_LABELS } from "@/config/wallets"
import type { Flow, Classification } from "@/lib/flows/types"

const CLASS_TONE: Record<Classification, "ok" | "warn" | "risk"> = {
  redeem: "warn",
  rebalance: "ok",
  external: "risk",
}

function label(addr: string): string {
  return KNOWN_WALLET_LABELS[addr.toLowerCase()] ?? shortAddr(addr)
}

function fmtDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"
}

export function FlowsTable({ flows }: { flows: Flow[] }) {
  return (
    <GlassCard className="p-5">
      <SectionHead
        title="Recent flows — outflows ≥ $1M, last 90 days"
        subtitle="Auto-classified. Low-confidence rebalances are guesses — verify before trusting."
      />
      {flows.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--color-text-ghost)]">
          No flows in the last 90 days.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-[var(--color-text-ghost)]">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Chain</th>
                <th className="py-2 pr-4 font-medium">From</th>
                <th className="py-2 pr-4 font-medium">To</th>
                <th className="py-2 pr-4 font-medium">Asset</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={`${f.chain}-${f.txHash}-${f.to}-${f.asset}`} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-4 font-mono text-[var(--color-text-ghost)]">{fmtDate(f.timestamp)}</td>
                  <td className="py-2 pr-4">{f.chain}</td>
                  <td className="py-2 pr-4 font-mono">{label(f.from)}</td>
                  <td className="py-2 pr-4 font-mono">{label(f.to)}</td>
                  <td className="py-2 pr-4">{f.asset}</td>
                  <td className="py-2 pr-4 text-right font-mono">{fmtUsd(f.amountUsd)}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <Tag tone={CLASS_TONE[f.classification]}>{f.classification}</Tag>
                      {f.confidence === "low" && <Tag tone="warn">low confidence</Tag>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/flows-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount it in `app/page.tsx`**

Add the import alongside the other component imports (after line 9, `MonitoredWalletsTable`):

```ts
import { FlowsTable } from "@/components/flows-table"
import { FlowsFileSchema } from "@/lib/flows/types"
import flowsData from "@/data/ethena-flows.json"
```

Inside `Page()`, before the `return`, parse the committed flows (static import, same pattern as the backing snapshot):

```ts
  const flows = FlowsFileSchema.parse(flowsData)
```

Then add the table as the last block inside the final `<section className="px-6 pb-6">`, after the `MonitoredWalletsTable` div:

```tsx
        <div className="mt-8">
          <FlowsTable flows={flows} />
        </div>
```

- [ ] **Step 6: Typecheck + full test suite + build**

Run: `npx vitest run`
Expected: PASS (entire suite).

Run: `cd ~/Projects/ethena-flow-monitor && pnpm build`
Expected: build succeeds (this catches `'use server'`/static-import issues that `tsc` alone misses).

- [ ] **Step 7: Visually verify**

Run: `pnpm dev` and open the dashboard. Confirm the "Recent flows" table renders at the bottom with the three RLUSD rebalance rows, amounts formatted (`$80.00M`, `$70.00M`, `$10.00M`), and the `rebalance` tag. (No low-confidence rows expected yet since the three destinations are known.)

- [ ] **Step 8: Commit**

```bash
git add components/flows-table.tsx tests/components/flows-table.test.tsx app/page.tsx
git commit -m "feat: recent-flows table on the dashboard"
```

---

## Self-Review (completed during plan authoring)

**Spec coverage:**
- Detect ≥$1M outflows XRPL+EVM → Tasks 4, 5 (`FLOW_MIN_USD`, outflow-only filters).
- Auto-classify redeem/rebalance/external + confidence → Task 2.
- Confidence-as-warning (no silent fallback) → Task 2 + Task 9 (`low confidence` tag).
- Track-but-quarantine new addresses → Task 1 (`buildScanSet` vs `buildKnownWalletSet`), Task 6 (`promoteWallets` status `quarantined`), Task 7 (promotion uses scan set, backing readers untouched).
- 90-day rolling table → Task 6 (`mergeFlows` prune), Task 9.
- Daily batch in launchd, committed JSON, static read → Task 8.
- Seed today's flows + add confirmed destinations to backing config → Task 8.
- Tests ≥80% / TDD → every task is test-first.

**Placeholder scan:** none — all steps carry complete code/commands. The one "learning-mode seam" (`classifyNewAddress`) ships a full implementation; authoring-by-user is optional and signature-locked.

**Type consistency:** `RawFlow`/`Flow`/`DiscoveredWallet`/`DestHoldings`/`DestProbe`/`ClassifyResult`/`ScanDeps` names and shapes are consistent across Tasks 1–9. `scanXrplFlows`/`scanEvmFlows`/`probeDestination`/`runScan`/`mergeFlows`/`promoteWallets`/`buildScanSet`/`buildKnownWalletSet`/`isRedeemSink` signatures match every call site.

**Known external assumptions to verify at execution time:**
- `tsconfig.json` has `paths: { "@/*": ["./*"] }` so `tsx` resolves `@/` (Next default; confirm).
- `.env.local` exists with `ALCHEMY_KEY` (Task 8 Step 8 handles if missing).
- `pnpm` is the package manager (lockfile is `pnpm-lock.yaml`).
