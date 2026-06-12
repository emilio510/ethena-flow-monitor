# Solana On-chain Balance Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read actual SPL token balances at Ethena's two Solana addresses on-chain and feed them into the reconciliation "verified" side, surfacing the ~$200M JAAA RWA leg that is currently dropped.

**Architecture:** A Solana JSON-RPC reader (raw `fetch` against Alchemy's `solana-mainnet` endpoint, both token programs) produces idle-balance rows; an allowlist registry decides which mints count and how each is valued (stables pegged $1; JAAA proxy-priced via its Base contract through the Alchemy Prices API; vault-share mints excluded to prevent double-counting). The rows fold into the existing `idle` result inside `loadFootprint`, exactly like RLUSD, so reconciliation and the page pick them up with no `page.tsx` change.

**Tech Stack:** TypeScript, Next.js 16, viem (EVM only — Solana uses raw `fetch`), zod v4, vitest. Reuses `ALCHEMY_KEY` for both the Solana RPC and the Alchemy Prices API. No new dependency, no new env var.

**Spec:** `docs/superpowers/specs/2026-06-12-solana-onchain-balance-tracking-design.md`

**Ground-truth constants (verified live 2026-06-12):**
- Solana wallets: `C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L`, `4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN`
- SPL Token program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
- Token-2022 program: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
- JAAA Solana mint: `AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG` (decimals 6), held by `4FaQc6…` = 192,821,471.94
- JAAA Base contract (price proxy): `0x5a0f93d040de44e78f251b03c43be9cf317dcf64` (`base-mainnet`), Alchemy price $1.03757
- jleUSDG vault-share mint (EXCLUDE): `Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc`, held by `C23FGx…` = 250,930,298 (already counted by `buildJupiterRow`)
- USDC Solana mint (verified, dust): `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

---

## File Structure

- Create `config/solana-wallets.ts` — the two addresses + labels + `isSolanaWallet`.
- Create `config/solana-idle-tokens.ts` — mint allowlist with `pricing` union + `bucket` ("idle" | "deployed") + `EXCLUDED_MINTS` doc.
- Create `lib/onchain/prices.ts` — Alchemy Prices API client (chain-agnostic; prices JAAA via its Base contract).
- Create `lib/solana/prices.ts` — Jupiter price API v3 client (prices the jleUSDG vault share, which Alchemy cannot).
- Create `lib/solana/rpc.ts` — `getTokenAccountsByOwner` over both token programs.
- Create `lib/solana/balances.ts` — `getEthenaSolanaIdleBalances()` orchestrator: idle-bucket rows (reconciliation) + per-wallet on-chain total across all buckets (inventory).
- Modify `lib/onchain/balances.ts` — add optional `approx?` to `IdleBalanceRow`.
- Modify `lib/solana/client.ts` — widen `SolanaApiError`/`SolanaTimeoutError` `source` union.
- Modify `lib/views/footprint.ts` — fold Solana idle into `idle` (like RLUSD); thread `failedSolanaBalances`; **switch the Solana inventory rows to on-chain `walletTotalUsd`** (replacing snapshot value).
- Tests under `tests/solana/` and `tests/onchain/` with fixtures.

## Accounting model (idle vs deployed bucket)

Each allowlisted mint has a `bucket`:

- **`idle`** — a base backing asset held directly (JAAA, stablecoins). Counts in the idle rows → reconciliation "verified" side, the idle total, AND the wallet's on-chain inventory total.
- **`deployed`** — a vault-share / receipt token (jleUSDG) representing a position **already counted** by a footprint row (`buildJupiterRow`). Counts ONLY in the wallet's on-chain inventory total — **never** in idle or reconciliation, or it double-counts ~$251M.

This is why the inventory total and the reconciliation/idle total differ per wallet: `C23FGx` shows ~$251M inventory (its jleUSDG, deployed bucket) but contributes ~$0 to idle; `4FaQc6` shows ~$200M in both (JAAA, idle bucket).

---

## Task 1: Solana wallets config

**Files:**
- Create: `config/solana-wallets.ts`
- Test: `tests/config/solana-wallets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"
import {
  SOLANA_WALLETS,
  KNOWN_SOLANA_WALLET_LABELS,
  isSolanaWallet,
} from "@/config/solana-wallets"

describe("solana-wallets config", () => {
  it("lists the two Ethena Solana addresses", () => {
    expect(SOLANA_WALLETS).toContain("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")
    expect(SOLANA_WALLETS).toContain("C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L")
  })

  it("is case-sensitive (base58 — never lowercased)", () => {
    expect(isSolanaWallet("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")).toBe(true)
    expect(isSolanaWallet("4faqc6qz5skfjcdf64mkcxrhtccsnarzcr1xumpnrbtn")).toBe(false)
  })

  it("labels the RWA wallet", () => {
    expect(KNOWN_SOLANA_WALLET_LABELS["4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"]).toMatch(/JAAA/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/config/solana-wallets.test.ts`
Expected: FAIL — cannot find module `@/config/solana-wallets`.

- [ ] **Step 3: Write minimal implementation**

```ts
// config/solana-wallets.ts
/**
 * Ethena's Solana addresses whose holdings are USDe backing. Base58 strings —
 * case-sensitive, NEVER lowercased (unlike EVM addresses).
 */
export const SOLANA_WALLETS = [
  "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L",
  "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN",
] as const

/** Human labels keyed by exact base58 address (sourced from Ethena's snapshot). */
export const KNOWN_SOLANA_WALLET_LABELS: Record<string, string> = {
  "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L": "Solana DeFi omnibus (Sentora/Bitwise)",
  "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN": "RWA — JAAA (Janus Henderson CLO)",
}

const SOLANA_SET = new Set<string>(SOLANA_WALLETS)

/** True for a tracked Solana wallet. Case-sensitive by design. */
export function isSolanaWallet(addr: string): boolean {
  return SOLANA_SET.has(addr)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/config/solana-wallets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add config/solana-wallets.ts tests/config/solana-wallets.test.ts
git commit -m "feat(solana): add Solana wallet tracking config"
```

---

## Task 2: Solana token registry (idle + deployed buckets)

**Files:**
- Create: `config/solana-idle-tokens.ts`
- Test: `tests/config/solana-idle-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"
import {
  SOLANA_IDLE_TOKENS,
  EXCLUDED_MINTS,
} from "@/config/solana-idle-tokens"

describe("solana token registry", () => {
  it("prices JAAA via its Base contract (proxyPrice, approx) in the idle bucket", () => {
    const jaaa = SOLANA_IDLE_TOKENS["AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG"]
    expect(jaaa.symbol).toBe("JAAA")
    expect(jaaa.decimals).toBe(6)
    expect(jaaa.bucket).toBe("idle")
    expect(jaaa.pricing).toEqual({
      kind: "proxyPrice",
      network: "base-mainnet",
      address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
      approx: true,
    })
  })

  it("pegs the stable mints (idle bucket)", () => {
    const usdc = SOLANA_IDLE_TOKENS["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]
    expect(usdc.pricing).toEqual({ kind: "peg" })
    expect(usdc.bucket).toBe("idle")
  })

  it("tracks the jleUSDG vault share in the DEPLOYED bucket (Jupiter-priced)", () => {
    const jle = SOLANA_IDLE_TOKENS["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"]
    expect(jle.symbol).toBe("jleUSDG")
    expect(jle.bucket).toBe("deployed")
    expect(jle.pricing).toEqual({ kind: "jupiter" })
  })

  it("documents why dust/other mints stay excluded", () => {
    expect(Object.keys(EXCLUDED_MINTS).length).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/config/solana-idle-tokens.test.ts`
Expected: FAIL — cannot find module `@/config/solana-idle-tokens`.

- [ ] **Step 3: Write minimal implementation**

```ts
// config/solana-idle-tokens.ts
/**
 * How to value an allowlisted Solana mint.
 *  - peg: hard $1 (stablecoins).
 *  - proxyPrice: price via a reference EVM contract through the Alchemy Prices
 *    API. For tokens with no Solana price but a market price on another chain
 *    (JAAA: same fund on Base + Solana, priced on Base). `approx` footnotes it.
 *  - jupiter: live Solana DEX price via the Jupiter price API (the only source
 *    that prices the jleUSDG vault share; Alchemy cannot).
 */
export type SolanaPricing =
  | { kind: "peg" }
  | { kind: "proxyPrice"; network: string; address: string; approx?: boolean }
  | { kind: "jupiter" }

/**
 * Accounting bucket:
 *  - "idle": base backing asset held directly. Counts in idle rows →
 *    reconciliation + idle total + wallet inventory total.
 *  - "deployed": vault-share / receipt token whose underlying position is
 *    ALREADY counted by a footprint row. Counts ONLY in the wallet inventory
 *    total — never in idle / reconciliation (or it double-counts).
 */
export type SolanaBucket = "idle" | "deployed"

export interface SolanaIdleToken {
  symbol: string
  mint: string
  decimals: number
  pricing: SolanaPricing
  bucket: SolanaBucket
}

/**
 * Allowlist of mints we value when held at SOLANA_WALLETS, keyed by mint.
 * Mints NOT listed here are ignored (that is how dust is dropped).
 *
 * Additional idle stable mints (USDG / PYUSD / USDe on Solana) can be added
 * with their verified mint + { kind: "peg" } + bucket "idle" when Ethena parks
 * idle stables here; today the only non-dust idle holding is JAAA, and the only
 * deployed holding is the jleUSDG vault share.
 */
export const SOLANA_IDLE_TOKENS: Record<string, SolanaIdleToken> = {
  AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG: {
    symbol: "JAAA",
    mint: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG",
    decimals: 6,
    pricing: {
      kind: "proxyPrice",
      network: "base-mainnet",
      address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
      approx: true,
    },
    bucket: "idle",
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    pricing: { kind: "peg" },
    bucket: "idle",
  },
  // The Jupiter Lend (jleUSDG) receipt the C23FGx omnibus holds. Its USDG
  // position is already counted by buildJupiterRow, so it is DEPLOYED-bucket:
  // shown in the wallet's on-chain inventory total but kept out of idle/recon.
  Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc: {
    symbol: "jleUSDG",
    mint: "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc",
    decimals: 6,
    pricing: { kind: "jupiter" },
    bucket: "deployed",
  },
}

/**
 * Mints deliberately kept OUT of the allowlist, with the reason. Defensive
 * documentation — the allowlist already excludes anything not listed above.
 */
export const EXCLUDED_MINTS: Record<string, string> = {
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH":
    "sub-dollar dust stable held by both wallets — below the $1 dust floor",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/config/solana-idle-tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add config/solana-idle-tokens.ts tests/config/solana-idle-tokens.test.ts
git commit -m "feat(solana): token registry with idle/deployed buckets + price kinds"
```

---

## Task 3: Alchemy Prices API client

**Files:**
- Create: `lib/onchain/prices.ts`
- Test: `tests/onchain/prices.test.ts`
- Create fixture: `tests/onchain/fixtures/alchemy-prices.json`

- [ ] **Step 1: Create the fixture**

```json
{
  "data": [
    {
      "network": "base-mainnet",
      "address": "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
      "prices": [
        { "currency": "usd", "value": "1.03757", "lastUpdatedAt": "2026-06-12T13:10:07Z" }
      ]
    },
    {
      "network": "base-mainnet",
      "address": "0x0000000000000000000000000000000000000000",
      "prices": [],
      "error": "no price found"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "alchemy-prices.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }))
}

describe("fetchTokenPrices", () => {
  it("returns a network:address -> usd map", async () => {
    stubFetch(fixture)
    const { fetchTokenPrices } = await import("@/lib/onchain/prices")
    const prices = await fetchTokenPrices([
      { network: "base-mainnet", address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64" },
    ])
    expect(prices.get("base-mainnet:0x5a0f93d040de44e78f251b03c43be9cf317dcf64")).toBeCloseTo(1.03757, 5)
  })

  it("omits addresses with no price (does NOT default to 0)", async () => {
    stubFetch(fixture)
    const { fetchTokenPrices } = await import("@/lib/onchain/prices")
    const prices = await fetchTokenPrices([
      { network: "base-mainnet", address: "0x0000000000000000000000000000000000000000" },
    ])
    expect(prices.has("base-mainnet:0x0000000000000000000000000000000000000000")).toBe(false)
  })

  it("returns empty map for empty input without calling fetch", async () => {
    const spy = vi.fn()
    vi.stubGlobal("fetch", spy)
    const { fetchTokenPrices } = await import("@/lib/onchain/prices")
    const prices = await fetchTokenPrices([])
    expect(prices.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/onchain/prices.test.ts`
Expected: FAIL — cannot find module `@/lib/onchain/prices`.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/onchain/prices.ts
import "server-only"
import { z } from "zod"
import { env } from "@/config/env"

export interface TokenRef {
  network: string
  address: string
}

const PriceEntry = z.object({
  currency: z.string(),
  value: z.string(),
})

const PricesResponse = z.object({
  data: z.array(
    z.object({
      network: z.string(),
      address: z.string(),
      prices: z.array(PriceEntry).default([]),
    }),
  ),
})

const key = (network: string, address: string) => `${network}:${address.toLowerCase()}`

/**
 * Fetch USD spot prices for tokens via the Alchemy Prices API (by-address).
 * Returns a `network:address` -> price map. Addresses Alchemy can't price are
 * simply absent from the map — callers MUST treat "missing" as missing, never
 * as 0 (house rule: no silent value degradation).
 */
export async function fetchTokenPrices(refs: TokenRef[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (refs.length === 0) return out

  const url = `https://api.g.alchemy.com/prices/v1/${env.ALCHEMY_KEY}/tokens/by-address`
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ addresses: refs.map((r) => ({ network: r.network, address: r.address })) }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`Alchemy Prices API error ${res.status}: ${await res.text()}`)
  }
  const parsed = PricesResponse.parse(await res.json())
  for (const row of parsed.data) {
    const usd = row.prices.find((p) => p.currency === "usd")
    if (!usd) continue
    const n = Number(usd.value)
    if (!Number.isFinite(n)) continue
    out.set(key(row.network, row.address), n)
  }
  return out
}

/** Build the lookup key callers use against the returned map. */
export const priceKey = key
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/onchain/prices.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/onchain/prices.ts tests/onchain/prices.test.ts tests/onchain/fixtures/alchemy-prices.json
git commit -m "feat(onchain): add Alchemy Prices API client"
```

---

## Task 4: Solana RPC token-account reader

**Files:**
- Create: `lib/solana/rpc.ts`
- Modify: `lib/solana/client.ts:9-21` (widen error `source` union)
- Test: `tests/solana/rpc.test.ts`
- Create fixture: `tests/solana/fixtures/token-accounts-4faqc6.json`

- [ ] **Step 1: Widen the error source union in `lib/solana/client.ts`**

Change both error classes' `source` type from `"kamino" | "fluid"` to `"kamino" | "fluid" | "solana-rpc"`, and the `jsonFetch` signature's `source` param likewise. Exact edits:

```ts
// lib/solana/client.ts — SolanaApiError
export class SolanaApiError extends Error {
  constructor(public source: "kamino" | "fluid" | "solana-rpc", public status: number, public path: string, public body: string) {
    super(`${source} API error ${status}`)
    this.name = "SolanaApiError"
  }
}

// SolanaTimeoutError
export class SolanaTimeoutError extends Error {
  constructor(public source: "kamino" | "fluid" | "solana-rpc", public path: string, public timeoutMs: number) {
    super(`${source} API timed out after ${timeoutMs}ms`)
    this.name = "SolanaTimeoutError"
  }
}
```

- [ ] **Step 2: Create the fixture** (trimmed real `getTokenAccountsByOwner` jsonParsed response for `4FaQc6…`, Token-2022 program)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "context": { "slot": 425986897 },
    "value": [
      {
        "pubkey": "Acc1111111111111111111111111111111111111111",
        "account": {
          "data": {
            "parsed": {
              "info": {
                "isNative": false,
                "mint": "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG",
                "owner": "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN",
                "tokenAmount": {
                  "amount": "192821471943242",
                  "decimals": 6,
                  "uiAmount": 192821471.943242,
                  "uiAmountString": "192821471.943242"
                }
              },
              "type": "account"
            },
            "program": "spl-token-2022",
            "space": 182
          },
          "owner": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      },
      {
        "pubkey": "Acc2222222222222222222222222222222222222222",
        "account": {
          "data": {
            "parsed": {
              "info": {
                "mint": "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
                "owner": "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN",
                "tokenAmount": {
                  "amount": "32741",
                  "decimals": 6,
                  "uiAmount": 0.032741,
                  "uiAmountString": "0.032741"
                }
              },
              "type": "account"
            },
            "program": "spl-token-2022",
            "space": 182
          },
          "owner": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      }
    ]
  }
}
```

- [ ] **Step 3: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const accountsFixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "token-accounts-4faqc6.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe("getTokenBalancesByOwner", () => {
  it("flattens parsed token accounts into {mint, rawAmount, decimals}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => accountsFixture, text: async () => "" }))
    const { getTokenBalancesByOwner } = await import("@/lib/solana/rpc")
    const balances = await getTokenBalancesByOwner("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")
    const jaaa = balances.find((b) => b.mint === "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG")!
    expect(jaaa.rawAmount).toBe(192821471943242n)
    expect(jaaa.decimals).toBe(6)
  })

  it("queries both token programs (two RPC calls)", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: { value: [] } }), text: async () => "" })
    vi.stubGlobal("fetch", spy)
    const { getTokenBalancesByOwner } = await import("@/lib/solana/rpc")
    await getTokenBalancesByOwner("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run tests/solana/rpc.test.ts`
Expected: FAIL — cannot find module `@/lib/solana/rpc`.

- [ ] **Step 5: Write minimal implementation**

```ts
// lib/solana/rpc.ts
import "server-only"
import { z } from "zod"
import { env } from "@/config/env"
import { SolanaApiError, SolanaTimeoutError } from "./client"

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
const TOKEN_PROGRAMS = [SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM] as const

const DEFAULT_TIMEOUT_MS = 15_000

export interface SolanaTokenBalance {
  mint: string
  /** Raw integer balance (base units). */
  rawAmount: bigint
  decimals: number
}

const TokenAccountsResponse = z.object({
  result: z.object({
    value: z.array(
      z.object({
        account: z.object({
          data: z.object({
            parsed: z.object({
              info: z.object({
                mint: z.string(),
                tokenAmount: z.object({
                  amount: z.string(),
                  decimals: z.number(),
                }),
              }),
            }),
          }),
        }),
      }),
    ),
  }),
})

function rpcUrl(): string {
  return `https://solana-mainnet.g.alchemy.com/v2/${env.ALCHEMY_KEY}`
}

async function rpcCall(body: unknown, path: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(rpcUrl(), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new SolanaTimeoutError("solana-rpc", path, DEFAULT_TIMEOUT_MS)
    }
    throw err
  }
  if (!res.ok) {
    throw new SolanaApiError("solana-rpc", res.status, path, await res.text())
  }
  return res.json()
}

/**
 * Read every SPL token balance owned by `owner`, across BOTH the legacy SPL
 * Token program and Token-2022 (PYUSD and others live on Token-2022 — querying
 * only one program silently misses balances). Returns raw integer amounts;
 * valuation happens in the caller.
 */
export async function getTokenBalancesByOwner(owner: string): Promise<SolanaTokenBalance[]> {
  const perProgram = await Promise.all(
    TOKEN_PROGRAMS.map(async (programId) => {
      const raw = await rpcCall(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [owner, { programId }, { encoding: "jsonParsed" }],
        },
        `getTokenAccountsByOwner/${programId}`,
      )
      const parsed = TokenAccountsResponse.parse(raw)
      return parsed.result.value.map((v): SolanaTokenBalance => {
        const info = v.account.data.parsed.info
        return {
          mint: info.mint,
          rawAmount: BigInt(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
        }
      })
    }),
  )
  return perProgram.flat()
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run tests/solana/rpc.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/solana/rpc.ts lib/solana/client.ts tests/solana/rpc.test.ts tests/solana/fixtures/token-accounts-4faqc6.json
git commit -m "feat(solana): add getTokenAccountsByOwner reader (both token programs)"
```

---

## Task 5: Jupiter price client

**Files:**
- Create: `lib/solana/prices.ts`
- Test: `tests/solana/prices.test.ts`
- Create fixture: `tests/solana/fixtures/jupiter-prices.json`

- [ ] **Step 1: Create the fixture** (real Jupiter price v3 shape for jleUSDG)

```json
{
  "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc": {
    "usdPrice": 1.0020312482166274,
    "blockId": 425525063,
    "decimals": 6
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "jupiter-prices.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }))
}

describe("fetchJupiterPrices", () => {
  it("returns a mint -> usd map", async () => {
    stubFetch(fixture)
    const { fetchJupiterPrices } = await import("@/lib/solana/prices")
    const prices = await fetchJupiterPrices(["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"])
    expect(prices.get("Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc")).toBeCloseTo(1.00203, 4)
  })

  it("omits mints Jupiter cannot price (no default 0)", async () => {
    stubFetch({}) // JAAA-style: empty response
    const { fetchJupiterPrices } = await import("@/lib/solana/prices")
    const prices = await fetchJupiterPrices(["AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG"])
    expect(prices.has("AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG")).toBe(false)
  })

  it("returns empty map for empty input without calling fetch", async () => {
    const spy = vi.fn()
    vi.stubGlobal("fetch", spy)
    const { fetchJupiterPrices } = await import("@/lib/solana/prices")
    const prices = await fetchJupiterPrices([])
    expect(prices.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/solana/prices.test.ts`
Expected: FAIL — cannot find module `@/lib/solana/prices`.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/solana/prices.ts
import "server-only"
import { z } from "zod"

const DEFAULT_TIMEOUT_MS = 15_000

// Jupiter price v3: { [mint]: { usdPrice: number, decimals, blockId, ... } }.
// Mints with no price are omitted from the object entirely.
const JupiterPriceResponse = z.record(
  z.string(),
  z.object({ usdPrice: z.number() }).passthrough(),
)

/**
 * Fetch live Solana USD spot prices by mint from the Jupiter price API v3.
 * Returns a mint -> price map. Mints Jupiter can't price are simply absent —
 * callers MUST treat "missing" as missing, never as 0.
 */
export async function fetchJupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (mints.length === 0) return out

  const url = `https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Jupiter price API error ${res.status}: ${await res.text()}`)
  }
  const parsed = JupiterPriceResponse.parse(await res.json())
  for (const [mint, info] of Object.entries(parsed)) {
    if (Number.isFinite(info.usdPrice)) out.set(mint, info.usdPrice)
  }
  return out
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/solana/prices.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/solana/prices.ts tests/solana/prices.test.ts tests/solana/fixtures/jupiter-prices.json
git commit -m "feat(solana): add Jupiter price API client"
```

---

## Task 6: Solana balance orchestrator (idle rows + on-chain wallet totals)

**Files:**
- Modify: `lib/onchain/balances.ts:18-26` (add optional `approx?` to `IdleBalanceRow`)
- Create: `lib/solana/balances.ts`
- Test: `tests/solana/balances.test.ts`

- [ ] **Step 1: Add `approx?` to `IdleBalanceRow` in `lib/onchain/balances.ts`**

Add one optional field to the existing interface (do not change any other field):

```ts
export interface IdleBalanceRow {
  symbol: string
  totalUsd: number
  isErc4626: boolean
  /** True when the USD value used a proxy / approximate price (e.g. an RWA
   *  token priced via its EVM twin). Lets the UI footnote it. */
  approx?: boolean
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

const C23 = "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L"
const FAQ = "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"

describe("getEthenaSolanaIdleBalances", () => {
  it("idle rows hold JAAA only; jleUSDG is deployed-bucket (inventory only)", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async (owner: string) => {
        if (owner === FAQ) {
          return [
            { mint: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG", rawAmount: 192821471943242n, decimals: 6 },
            { mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", rawAmount: 32741n, decimals: 6 },
          ]
        }
        return [{ mint: "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc", rawAmount: 250930298050455n, decimals: 6 }]
      }),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchTokenPrices: vi.fn(async () =>
        new Map([["base-mainnet:0x5a0f93d040de44e78f251b03c43be9cf317dcf64", 1.03757]]),
      ),
      priceKey: (n: string, a: string) => `${n}:${a.toLowerCase()}`,
    }))
    vi.doMock("@/lib/solana/prices", () => ({
      fetchJupiterPrices: vi.fn(async () =>
        new Map([["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc", 1.0020312]]),
      ),
    }))

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    // idle (reconciliation) side: JAAA only, NOT jleUSDG.
    expect(res.rows.map((r) => r.symbol).sort()).toEqual(["JAAA"])
    const jaaa = res.rows.find((r) => r.symbol === "JAAA")!
    expect(jaaa.totalUsd).toBeCloseTo(192821471.943242 * 1.03757, 0)
    expect(jaaa.approx).toBe(true)
    expect(res.totalUsd).toBeCloseTo(jaaa.totalUsd, 0)

    // inventory side: per-wallet on-chain total INCLUDING the deployed jleUSDG.
    const c23 = res.walletTotalUsd.find((w) => w.address === C23)!
    expect(c23.totalUsd).toBeCloseTo(250930298.050455 * 1.0020312, 0) // ~$251.4M
    const faq = res.walletTotalUsd.find((w) => w.address === FAQ)!
    expect(faq.totalUsd).toBeCloseTo(jaaa.totalUsd, 0) // ~$200M
  })

  it("excludes a token (does not zero it) when its price is missing", async () => {
    vi.doMock("@/lib/solana/rpc", () => ({
      getTokenBalancesByOwner: vi.fn(async () => [
        { mint: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG", rawAmount: 192821471943242n, decimals: 6 },
      ]),
    }))
    vi.doMock("@/lib/onchain/prices", () => ({
      fetchTokenPrices: vi.fn(async () => new Map()), // no price returned
      priceKey: (n: string, a: string) => `${n}:${a.toLowerCase()}`,
    }))
    vi.doMock("@/lib/solana/prices", () => ({ fetchJupiterPrices: vi.fn(async () => new Map()) }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { getEthenaSolanaIdleBalances } = await import("@/lib/solana/balances")
    const res = await getEthenaSolanaIdleBalances()

    expect(res.rows.some((r) => r.symbol === "JAAA")).toBe(false)
    expect(res.failures.length).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/solana/balances.test.ts`
Expected: FAIL — cannot find module `@/lib/solana/balances`.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/solana/balances.ts
import "server-only"
import type { IdleBalanceRow } from "@/lib/onchain/balances"
import { SOLANA_WALLETS } from "@/config/solana-wallets"
import { SOLANA_IDLE_TOKENS, type SolanaIdleToken } from "@/config/solana-idle-tokens"
import { fetchTokenPrices, priceKey, type TokenRef } from "@/lib/onchain/prices"
import { fetchJupiterPrices } from "./prices"
import { getTokenBalancesByOwner } from "./rpc"

/** Holdings valued below this (USD) are dropped as dust. */
const MIN_DUST_USD = 1

export interface SolanaIdleResult {
  /** Idle-bucket rows (base assets) — feed reconciliation + idle total. */
  rows: IdleBalanceRow[]
  /** Sum of `rows` (idle bucket only). */
  totalUsd: number
  /** Per-wallet on-chain total across ALL buckets (idle + deployed) — feeds the
   *  monitored-wallet inventory. Keyed by the exact base58 address. */
  walletTotalUsd: Array<{ address: string; totalUsd: number }>
  failures: Array<{ source: string; reason: string }>
}

/**
 * Read SPL balances at SOLANA_WALLETS and value them per the registry.
 *  - idle-bucket assets (JAAA, stables) → `rows` + `totalUsd` (reconciliation).
 *  - deployed-bucket assets (jleUSDG vault share) → counted ONLY in
 *    `walletTotalUsd` (inventory), never in `rows`, so the Jupiter footprint
 *    row is not double-counted.
 *
 * Pricing: peg → $1; proxyPrice (JAAA) → Alchemy Prices via its Base contract;
 * jupiter (jleUSDG) → Jupiter price API. Partial-tolerant: a per-wallet RPC
 * failure skips that wallet; a missing price EXCLUDES the token (never 0) and
 * records a failure.
 */
export async function getEthenaSolanaIdleBalances(): Promise<SolanaIdleResult> {
  const failures: SolanaIdleResult["failures"] = []

  // 1. Read balances per wallet (partial-tolerant).
  const perWallet = await Promise.allSettled(
    SOLANA_WALLETS.map(async (address) => ({
      address,
      balances: await getTokenBalancesByOwner(address),
    })),
  )

  // 2. Sum raw amounts per (wallet, allowlisted mint).
  const rawByWalletMint = new Map<string, Map<string, bigint>>()
  perWallet.forEach((r, i) => {
    const address = SOLANA_WALLETS[i]!
    if (r.status === "rejected") {
      failures.push({ source: `rpc:${address}`, reason: reasonOf(r.reason) })
      return
    }
    const byMint = new Map<string, bigint>()
    for (const b of r.value.balances) {
      if (!SOLANA_IDLE_TOKENS[b.mint]) continue // allowlist: drops dust + unknown
      byMint.set(b.mint, (byMint.get(b.mint) ?? 0n) + b.rawAmount)
    }
    rawByWalletMint.set(address, byMint)
  })

  // 3. Collect held mints, then batch-fetch prices by source.
  const heldMints = new Set<string>()
  for (const byMint of rawByWalletMint.values()) for (const m of byMint.keys()) heldMints.add(m)

  const proxyRefs: TokenRef[] = []
  const jupiterMints: string[] = []
  for (const mint of heldMints) {
    const p = SOLANA_IDLE_TOKENS[mint]!.pricing
    if (p.kind === "proxyPrice") proxyRefs.push({ network: p.network, address: p.address })
    else if (p.kind === "jupiter") jupiterMints.push(mint)
  }

  let proxyPrices = new Map<string, number>()
  if (proxyRefs.length > 0) {
    try {
      proxyPrices = await fetchTokenPrices(proxyRefs)
    } catch (err) {
      failures.push({ source: "alchemy-prices", reason: reasonOf(err) })
    }
  }
  let jupiterPrices = new Map<string, number>()
  if (jupiterMints.length > 0) {
    try {
      jupiterPrices = await fetchJupiterPrices(jupiterMints)
    } catch (err) {
      failures.push({ source: "jupiter-prices", reason: reasonOf(err) })
    }
  }

  // 4. Value -> idle-bucket per-symbol rows + per-wallet all-bucket total.
  const bySymbol = new Map<string, { usd: number; approx: boolean }>()
  const walletTotalUsd: SolanaIdleResult["walletTotalUsd"] = []

  for (const [address, byMint] of rawByWalletMint) {
    let walletUsd = 0
    for (const [mint, raw] of byMint) {
      const tok = SOLANA_IDLE_TOKENS[mint]!
      const priced = valueToken(tok, raw, proxyPrices, jupiterPrices)
      if (priced === null) {
        console.warn(`[ethena-flow-monitor] no price for ${tok.symbol} (${mint}) — excluding`)
        failures.push({ source: `price:${tok.symbol}`, reason: "missing price" })
        continue
      }
      if (priced.usd < MIN_DUST_USD) continue
      walletUsd += priced.usd // inventory total: every bucket
      if (tok.bucket === "idle") {
        const prev = bySymbol.get(tok.symbol)
        bySymbol.set(tok.symbol, {
          usd: (prev?.usd ?? 0) + priced.usd,
          approx: (prev?.approx ?? false) || priced.approx,
        })
      }
    }
    walletTotalUsd.push({ address, totalUsd: walletUsd })
  }

  const rows: IdleBalanceRow[] = [...bySymbol.entries()]
    .map(([symbol, { usd, approx }]) => ({ symbol, totalUsd: usd, isErc4626: false, approx }))
    .sort((a, b) => b.totalUsd - a.totalUsd)

  return {
    rows,
    totalUsd: rows.reduce((a, r) => a + r.totalUsd, 0),
    walletTotalUsd,
    failures,
  }
}

/** Returns null when a required price is missing (caller excludes the token). */
function valueToken(
  tok: SolanaIdleToken,
  raw: bigint,
  proxyPrices: Map<string, number>,
  jupiterPrices: Map<string, number>,
): { usd: number; approx: boolean } | null {
  const amount = Number(raw) / 10 ** tok.decimals
  switch (tok.pricing.kind) {
    case "peg":
      return { usd: amount, approx: false }
    case "proxyPrice": {
      const price = proxyPrices.get(priceKey(tok.pricing.network, tok.pricing.address))
      return price === undefined ? null : { usd: amount * price, approx: tok.pricing.approx ?? false }
    }
    case "jupiter": {
      const price = jupiterPrices.get(tok.mint)
      return price === undefined ? null : { usd: amount * price, approx: false }
    }
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/solana/balances.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/solana/balances.ts lib/onchain/balances.ts tests/solana/balances.test.ts
git commit -m "feat(solana): value idle (peg+proxy) + deployed (jupiter) balances by bucket"
```

---

## Task 7: Integrate into loadFootprint (idle fold + on-chain inventory)

**Files:**
- Modify: `lib/views/footprint.ts` (imports, FootprintResult field, allSettled batch, idle fold, on-chain Solana inventory, return)
- Test: `tests/views/footprint-solana-idle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

const FAQ = "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"
const C23 = "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L"

function stubBaseFetchers() {
  vi.doMock("@/lib/tokenlogic/positions", () => ({
    getEthenaPositions: vi.fn(async () => ({ rows: [], failedWallets: [] })),
    getMarketPositionsBulk: vi.fn(async () => ({ byMarket: new Map(), failedMarkets: [] })),
  }))
  vi.doMock("@/lib/tokenlogic/markets", () => ({ getMarketAggregates: vi.fn(async () => new Map()) }))
  vi.doMock("@/lib/morpho/positions", () => ({
    getEthenaMorphoPositions: vi.fn(async () => ({ positions: [], failedWallets: [] })),
    getMorphoVaultsBulk: vi.fn(async () => new Map()),
    MORPHO_CHAINS: [],
  }))
  vi.doMock("@/lib/onchain/balances", () => ({
    getEthenaIdleBalances: vi.fn(async () => ({
      rows: [{ symbol: "USDe", totalUsd: 1_000_000, isErc4626: false }],
      totalUsd: 1_000_000,
      reserveFundRows: [], reserveFundTotalUsd: 0, walletIdleUsd: [], failures: [], uncoveredChains: [],
    })),
  }))
  vi.doMock("@/lib/onchain/xrpl", () => ({ getEthenaRlusdHoldings: vi.fn(async () => ({ totalUsd: 0, wallets: [] })) }))
  vi.doMock("@/lib/solana", () => ({ getEthenaSolanaPositions: vi.fn(async () => ({ rows: [], failed: [] })) }))
  vi.doMock("@/lib/solana/balances", () => ({
    getEthenaSolanaIdleBalances: vi.fn(async () => ({
      rows: [{ symbol: "JAAA", totalUsd: 200_000_000, isErc4626: false, approx: true }],
      totalUsd: 200_000_000,
      walletTotalUsd: [
        { address: FAQ, totalUsd: 200_000_000 },
        { address: C23, totalUsd: 251_400_000 },
      ],
      failures: [],
    })),
  }))
}

describe("loadFootprint Solana integration", () => {
  it("folds Solana idle (JAAA) into idle.rows + idle.totalUsd", async () => {
    stubBaseFetchers()
    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()
    expect(res.idle.rows.some((r) => r.symbol === "JAAA")).toBe(true)
    expect(res.idle.totalUsd).toBeCloseTo(201_000_000, 0) // 1M USDe + 200M JAAA
    expect(res.failedSolanaBalances).toEqual([])
  })

  it("shows the Solana wallets in inventory at their ON-CHAIN total (incl deployed jleUSDG)", async () => {
    stubBaseFetchers()
    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()
    const c23 = res.walletInventory.find((w) => w.address === C23)!
    expect(c23.chain).toBe("solana")
    expect(c23.totalUsd).toBeCloseTo(251_400_000, 0) // on-chain (jleUSDG), NOT snapshot
    const faq = res.walletInventory.find((w) => w.address === FAQ)!
    expect(faq.totalUsd).toBeCloseTo(200_000_000, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/views/footprint-solana-idle.test.ts`
Expected: FAIL — `failedSolanaBalances` undefined; Solana inventory uses snapshot value, not 251.4M.

- [ ] **Step 3: Implement the integration in `lib/views/footprint.ts`**

3a. Add imports near the existing Solana import (`import { getEthenaSolanaPositions } from "@/lib/solana"`):

```ts
import { getEthenaSolanaIdleBalances } from "@/lib/solana/balances"
import { SOLANA_WALLETS, KNOWN_SOLANA_WALLET_LABELS } from "@/config/solana-wallets"
```

3b. Add a field to the `FootprintResult` interface (next to `failedSolana`):

```ts
  /** Sources that errored while reading Solana balances (RPC / price).
   *  Empty when all succeeded. */
  failedSolanaBalances: string[]
```

3c. Add `getEthenaSolanaIdleBalances()` to the `Promise.allSettled([...])` batch (append as the 6th entry, after `getEthenaRlusdHoldings()`):

```ts
  const settled = await Promise.allSettled([
    getEthenaPositions(),
    getMarketAggregates(),
    getEthenaMorphoPositions(),
    getEthenaIdleBalances(),
    getEthenaRlusdHoldings(),
    getEthenaSolanaIdleBalances(),
  ])
```

3d. Unwrap it right after the `rlusd` unwrap:

```ts
  const solanaIdle = safeUnwrap(5, "getEthenaSolanaIdleBalances", {
    rows: [],
    totalUsd: 0,
    walletTotalUsd: [],
    failures: [],
  } as import("@/lib/solana/balances").SolanaIdleResult)
  const failedSolanaBalances = solanaIdle.failures.map((f) => f.source)
```

3e. Extend the RLUSD-folding block so Solana **idle** rows + total fold into `idle` (the per-wallet EVM map is untouched — Solana wallets are added to inventory separately in 3g). Replace the current `const idle: IdleBalanceResult = rlusd.totalUsd > 0 ? {...} : idleRaw` block with:

```ts
  // RLUSD (XRPL) and Solana idle-bucket balances are off-the-EVM-chain idle
  // backing — fold them into the idle result so they count toward total
  // backing and flow into the reconciliation by symbol. (Solana DEPLOYED-bucket
  // holdings like jleUSDG are deliberately NOT here — they live in the wallet
  // inventory only, see below, to avoid double-counting the Jupiter row.)
  const extraRows: IdleBalanceRow[] = [...solanaIdle.rows]
  if (rlusd.totalUsd > 0) {
    extraRows.push({ symbol: "RLUSD", totalUsd: rlusd.totalUsd, isErc4626: false })
  }
  const idle: IdleBalanceResult =
    extraRows.length > 0
      ? {
          ...idleRaw,
          rows: [...idleRaw.rows, ...extraRows].sort((a, b) => b.totalUsd - a.totalUsd),
          totalUsd: idleRaw.totalUsd + extraRows.reduce((a, r) => a + r.totalUsd, 0),
        }
      : idleRaw
```

3f. **Replace** the existing snapshot-valued Solana inventory block. Find this block in the inventory section:

```ts
    const solByAddr = new Map<string, number>()
    for (const f of flat) {
      if (f.chainSlug !== "solana") continue
      solByAddr.set(f.address, (solByAddr.get(f.address) ?? 0) + f.value)
    }
    for (const [address, totalUsd] of solByAddr) {
      solanaWallets.push({
        address,
        chain: "solana",
        role: "backing",
        apiLabel: apiLabels.get(address),
        totalUsd,
      })
    }
```

and replace it with on-chain totals from `solanaIdle.walletTotalUsd` (still reading `apiLabels` from the snapshot when present):

```ts
    const solTotalByAddr = new Map(
      solanaIdle.walletTotalUsd.map((w) => [w.address, w.totalUsd]),
    )
    for (const address of SOLANA_WALLETS) {
      solanaWallets.push({
        address,
        chain: "solana",
        role: "backing",
        apiLabel: apiLabels.get(address),
        label: KNOWN_SOLANA_WALLET_LABELS[address],
        totalUsd: solTotalByAddr.get(address) ?? 0,
      })
    }
```

Note: this block sits inside the existing `if (opts.ethenaSnapshot) { ... }` guard, which is fine — `apiLabels` needs the snapshot, and the page always passes one. The on-chain `walletTotalUsd` is independent of the snapshot; only the label is snapshot-derived.

3g. Add `failedSolanaBalances` to the returned object (next to `failedSolana`):

```ts
    failedSolana,
    failedSolanaBalances,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/views/footprint-solana-idle.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm vitest run`
Expected: PASS (all prior + new). Fix any type mismatch surfaced (e.g. the `WalletInventoryRow.address` for Solana stays the exact base58 string — never lowercased).

- [ ] **Step 6: Commit**

```bash
git add lib/views/footprint.ts tests/views/footprint-solana-idle.test.ts
git commit -m "feat(solana): fold Solana idle into reconciliation + on-chain wallet inventory"
```

---

## Task 8: Reconciliation verifies JAAA (no double-count)

**Files:**
- Test: `tests/views/reconciliation-solana.test.ts` (new; `buildReconciliation` itself needs NO change — JAAA arrives via the `idle` rows)

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest"
import { buildReconciliation } from "@/lib/views/reconciliation"
import type { BackingSnapshot } from "@/lib/ethena"
import type { FootprintRow } from "@/lib/views/footprint"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

// Minimal snapshot: RWA strategy reporting JAAA, plus a USDG DeFi-lending leg.
const snapshot = {
  timestamp: "2026-06-12T00:00:00Z",
  strategies: [
    {
      strategy: "RWA",
      value: 200_000_000,
      counterparties: [
        { counterparty: "", value: 200_000_000, assets: [{ asset: "JAAA", value: 200_000_000 }], addressEntries: [] },
      ],
    },
  ],
} as unknown as BackingSnapshot

describe("reconciliation with Solana idle JAAA", () => {
  it("nets JAAA on the on-chain side and verifies it", () => {
    const deployed: FootprintRow[] = []
    const idle: IdleBalanceRow[] = [
      { symbol: "JAAA", totalUsd: 199_700_000, isErc4626: false, approx: true },
    ]
    const recon = buildReconciliation(snapshot, deployed, idle)
    const jaaa = recon.rows.find((r) => r.asset === "JAAA")!
    expect(jaaa.onchainUsd).toBeCloseTo(199_700_000, 0)
    // gap = 300k, tolerance = max(10M, 3% * 200M = 6M) -> verified
    expect(jaaa.status).toBe("verified")
  })

  it("does not double-count: JAAA appears once on the on-chain side", () => {
    const recon = buildReconciliation(
      snapshot,
      [],
      [{ symbol: "JAAA", totalUsd: 199_700_000, isErc4626: false, approx: true }],
    )
    const jaaaRows = recon.rows.filter((r) => r.asset === "JAAA")
    expect(jaaaRows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify behavior**

Run: `pnpm vitest run tests/views/reconciliation-solana.test.ts`
Expected: PASS. If JAAA shows `off-chain` instead of `verified`, confirm `JAAA` is NOT present in the `OFF_CHAIN` map in `lib/views/reconciliation.ts` (it should not be — only BTC/ETH/CBAM are). No code change expected.

- [ ] **Step 3: Commit**

```bash
git add tests/views/reconciliation-solana.test.ts
git commit -m "test(solana): reconciliation verifies JAAA via on-chain idle, no double-count"
```

---

## Task 9: Full verification (build + live smoke)

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + full test suite**

Run: `pnpm vitest run && npx tsc --noEmit`
Expected: all tests PASS, tsc clean.

- [ ] **Step 2: Production build (catches `'use server'` / RSC issues local dev misses)**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Live smoke test against the dev server**

```bash
pnpm dev   # in a separate shell
```
Then load `http://localhost:3000` and confirm:
- A **JAAA** row appears in the idle / reconciliation breakdown valued ≈ **$199–200M**, flagged approx.
- JAAA's reconciliation status is **verified** (within tolerance), not a gap.
- Both Solana addresses appear in the monitored-wallet inventory at their **on-chain** total: `4FaQc6…` ≈ **$200M** (JAAA), `C23FGx…` ≈ **$251M** (jleUSDG vault share, deployed bucket).
- `jleUSDG` does **not** appear as an idle/reconciliation token row (deployed bucket — inventory total only), so total backing did not double-count it.
- Total backing increased by ≈ JAAA's value (~$200M) vs before, not by ~$450M.

Expected: all confirmed. If a figure is far off, re-check the live prices (Alchemy for JAAA via Base `0x5a0f93d0…`; Jupiter for jleUSDG `Bd2w…`) and the on-chain amounts (`getTokenAccountsByOwner`).

- [ ] **Step 4: Final commit (if any smoke-fix needed; otherwise skip)**

```bash
git add -A
git commit -m "fix(solana): address smoke-test findings"
```

---

## Self-Review

- **Spec coverage:** wallets config (T1); registry with idle/deployed buckets + exclusion doc (T2); Alchemy Prices client (T3); RPC both-programs (T4); Jupiter price client (T5); valuation by bucket + no-zero-default + partial tolerance, idle rows + on-chain wallet totals (T6); footprint idle fold + **on-chain inventory switch** (T7); reconciliation verify + no double-count (T8); build + live smoke (T9). The on-chain inventory switch (this session's added scope) is covered by T6 (`walletTotalUsd`) + T7 (inventory rows use it). No remaining gap.
- **Placeholder scan:** none — every code/test step is complete; ground-truth constants are real and verified live 2026-06-12.
- **Type consistency:** `IdleBalanceRow` gains optional `approx?` (T6); `SolanaIdleResult` shape (`rows`, `totalUsd`, `walletTotalUsd`, `failures`) is identical in T6 (definition), T7 (unwrap fallback + mock), and T7's assertions; `fetchTokenPrices`/`priceKey` match between T3 and T6; `fetchJupiterPrices` matches between T5 and T6; error `source` union widened in T4 before use; `SolanaPricing` union (`peg` | `proxyPrice` | `jupiter`) defined in T2 and exhaustively switched in T6's `valueToken`.
