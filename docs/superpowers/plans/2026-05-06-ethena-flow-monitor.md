# Ethena Flow Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js dashboard that highlights Ethena's recursive-loop exposure across Aave V3 deployments on Ethereum, Base, Mantle, Plasma, and MegaETH, using the TokenLogic internal user-positions API as the sole data source.

**Architecture:** Two read-only data layers fed by `https://api.tokenlogic.xyz/internal/aave/user-positions/latest` (filtered by `user_address` for Ethena footprint, by `market_key` for borrower-set walking) plus `/v1/aave/markets/latest` for reserve aggregates. Pure-frontend Next.js 15 App Router app with React-Query session caching. No persistence, no cron, no on-chain calls in MVP. Yuzu-style monospace UI built on Tailwind.

**Tech Stack:** Next.js 15 (App Router), TypeScript, TailwindCSS, @tanstack/react-query, zod, vitest, @testing-library/react, recharts, JetBrains Mono.

**MVP scope:** Aave on all 5 chains, View A (Ethena footprint) + View B (reserve drill-down), pro-rata attribution only.

**Deferred to Phase 2:** Morpho integration, attribution toggle (any-Tier-1), live viem refresh, time-series, alerts.

**Spec:** `docs/superpowers/specs/2026-05-06-ethena-flow-monitor-design.md`

---

## File Structure

```
ethena-flow-monitor/
├── app/
│   ├── layout.tsx                          # root layout, theme, fonts, providers
│   ├── page.tsx                            # View A — Ethena footprint
│   ├── reserve/[chain]/[asset]/page.tsx    # View B — reserve drill-down
│   ├── globals.css                         # Tailwind base + Yuzu theme tokens
│   └── providers.tsx                       # React Query client provider
├── lib/
│   ├── tokenlogic/
│   │   ├── schemas.ts                      # zod schemas (handles array/scalar quirks)
│   │   ├── client.ts                       # auth + fetch wrapper, error mapping
│   │   ├── positions.ts                    # getEthenaPositions, getMarketPositions
│   │   └── markets.ts                      # getMarketAggregates (reserve-level)
│   ├── recursion/
│   │   ├── classify.ts                     # symbol -> 'TIER_1' | 'TIER_2' | 'PT' | 'OTHER'
│   │   ├── attribute.ts                    # pro-rata attribution per (user × market) row
│   │   ├── score.ts                        # per-reserve recursion_score aggregation
│   │   └── summary.ts                      # supply-index + borrower-by-reserve builders
│   ├── views/
│   │   ├── footprint.ts                    # View A loader
│   │   └── reserve.ts                      # View B loader
│   └── format.ts                           # $/% formatters, address shortening
├── config/
│   ├── wallets.ts                          # 11 Ethena addresses
│   ├── markets.ts                          # 5 market_keys + chain metadata
│   ├── tokens.ts                           # TIER_1 / TIER_2 / PT_TOKENS classification
│   └── env.ts                              # zod-validated env loader
├── components/
│   ├── header.tsx
│   ├── kpi-card.tsx
│   ├── kpi-strip.tsx
│   ├── concentration-panel.tsx
│   ├── depositors-table.tsx
│   ├── recursion-panel.tsx                 # donut + collateral breakdown table
│   ├── footprint-table.tsx
│   └── tag.tsx                             # ETHENA / PT / ANOMALY tags
├── tests/
│   ├── config/{wallets,markets,tokens}.test.ts
│   ├── tokenlogic/{schemas,client,positions,markets}.test.ts
│   ├── recursion/{classify,attribute,score,summary}.test.ts
│   └── format.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts (or v4 inline @theme)
├── next.config.ts
├── vitest.config.ts
└── README.md
```

**Layering rules:**
- `config/` is pure data, no logic.
- `lib/tokenlogic/` is the only place `fetch()` is called.
- `lib/recursion/` is pure functions over typed inputs from `lib/tokenlogic`.
- `components/` are dumb renderers, no fetching.
- `app/` pages do fetching (RSC) and pass props down.

---

## Phase 0 — Project scaffold

### Task 0.1: Initialise Next.js project and Git

**Files:** project root files via `create-next-app`.

- [ ] **Step 1: Scaffold Next.js**

```bash
cd /Users/akgemilio/Projects/ethena-flow-monitor
pnpm create next-app@latest . --typescript --tailwind --app --no-src-dir --eslint --import-alias '@/*' --use-pnpm
```

When prompted about Turbopack → yes. The folder is non-empty (`docs/`); accept overwrite — `docs/` is preserved by `create-next-app`.

- [ ] **Step 2: Verify the scaffold**

Run: `pnpm dev`
Expected: dev server boots on http://localhost:3000 and serves the default Next.js page. Stop with Ctrl+C.

- [ ] **Step 3: Initialise git and extend .gitignore**

```bash
git init
```

Append to `.gitignore`:

```
.env
.env.local
.vercel
.DS_Store
```

- [ ] **Step 4: Initial commit**

```bash
git add -A
git commit -m "chore: scaffold next.js project with typescript and tailwind"
```

---

### Task 0.2: Install runtime + dev dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add @tanstack/react-query zod recharts
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Add test scripts**

In `package.json`, replace the `"scripts"` block:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-query, zod, recharts, vitest deps"
```

---

### Task 0.3: Configure vitest

**Files:** `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Sanity-check vitest**

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `pnpm test`
Expected: 1 test passes.

- [ ] **Step 4: Remove sanity test, commit**

```bash
rm tests/sanity.test.ts
git add vitest.config.ts tests/setup.ts package.json pnpm-lock.yaml
git commit -m "chore: configure vitest with jsdom and react-testing-library"
```

---

### Task 0.4: Configure Yuzu theme tokens

**Files:** `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-bg: #0a0a0a;
  --color-bg-card: #111111;
  --color-border: #1f1f1f;
  --color-text: #e8e8e8;
  --color-text-muted: #8a8a8a;
  --color-accent: #f5cc4c;
  --color-success: #10b981;
  --color-recursion: #ef4444;
  --color-pt-tag: #f59e0b;
  --color-chart-fill: #2dd4bf;

  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

html, body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-feature-settings: "ss01", "tnum";
}
```

- [ ] **Step 2: Wire JetBrains Mono in `app/layout.tsx`**

```tsx
import type { Metadata } from "next"
import { JetBrains_Mono } from "next/font/google"
import "./globals.css"

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Ethena Flow Monitor",
  description: "Recursive-loop exposure on Aave V3, per Ethena wallet.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Verify visually**

Run `pnpm dev`, visit http://localhost:3000. Expected: black background, light off-white monospace text. Stop server.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(ui): yuzu theme tokens and jetbrains mono font"
```

---

### Task 0.5: Configure React Query provider

**Files:** `app/providers.tsx`, `app/layout.tsx`

- [ ] **Step 1: Create `app/providers.tsx`**

```tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
    },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 2: Wrap layout body**

In `app/layout.tsx`, change `<body>{children}</body>` to `<body><Providers>{children}</Providers></body>` and add:

```tsx
import { Providers } from "./providers"
```

- [ ] **Step 3: Commit**

```bash
git add app/providers.tsx app/layout.tsx
git commit -m "feat: add react-query provider"
```

---

## Phase 1 — Configuration

### Task 1.1: Environment variable validation

**Files:** `config/env.ts`, `.env.example`

- [ ] **Step 1: Create `.env.example`**

```
TOKENLOGIC_API_KEY=
TOKENLOGIC_API_BASE_URL=https://api.tokenlogic.xyz
```

- [ ] **Step 2: Create `config/env.ts`**

```ts
import { z } from "zod"

const Schema = z.object({
  TOKENLOGIC_API_KEY: z.string().min(1, "TOKENLOGIC_API_KEY is required"),
  TOKENLOGIC_API_BASE_URL: z.string().url().default("https://api.tokenlogic.xyz"),
})

export type Env = z.infer<typeof Schema>

export const env: Env = Schema.parse({
  TOKENLOGIC_API_KEY: process.env.TOKENLOGIC_API_KEY,
  TOKENLOGIC_API_BASE_URL: process.env.TOKENLOGIC_API_BASE_URL,
})
```

- [ ] **Step 3: Add `.env.local` with the real key**

```bash
echo "TOKENLOGIC_API_KEY=$TOKENLOGIC_API_KEY" > .env.local
```

(`TOKENLOGIC_API_KEY` is already set in the dev shell from prior session.)

- [ ] **Step 4: Commit**

```bash
git add config/env.ts .env.example
git commit -m "feat(config): zod-validated env loader"
```

---

### Task 1.2: Ethena wallets config

**Files:** `config/wallets.ts`, `tests/config/wallets.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { ETHENA_WALLETS, isEthenaWallet } from "@/config/wallets"

describe("ETHENA_WALLETS", () => {
  it("contains 11 unique lowercased addresses", () => {
    expect(ETHENA_WALLETS).toHaveLength(11)
    expect(new Set(ETHENA_WALLETS).size).toBe(11)
    for (const a of ETHENA_WALLETS) {
      expect(a).toMatch(/^0x[0-9a-f]{40}$/)
    }
  })
})

describe("isEthenaWallet", () => {
  it("matches case-insensitively", () => {
    expect(isEthenaWallet("0xB8734A14fbd4aa2D44e6AA830405fFC861BA313C")).toBe(true)
    expect(isEthenaWallet("0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c")).toBe(true)
  })

  it("returns false for unknown addresses", () => {
    expect(isEthenaWallet("0x0000000000000000000000000000000000000000")).toBe(false)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/config/wallets.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `config/wallets.ts`**

```ts
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
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/config/wallets.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add config/wallets.ts tests/config/wallets.test.ts
git commit -m "feat(config): ethena wallet allowlist"
```

---

### Task 1.3: Markets config

**Files:** `config/markets.ts`, `tests/config/markets.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { MARKETS, getMarket, marketKeyForChain } from "@/config/markets"

describe("MARKETS", () => {
  it("covers exactly the 5 target chains", () => {
    const chains = MARKETS.map((m) => m.chain).sort()
    expect(chains).toEqual(["base", "ethereum", "mantle", "megaeth", "plasma"])
  })

  it("each market has a valid market_key and chain id", () => {
    for (const m of MARKETS) {
      expect(m.marketKey).toMatch(/-core-v3$/)
      expect(typeof m.chainId).toBe("number")
    }
  })
})

describe("marketKeyForChain", () => {
  it("returns the right key", () => {
    expect(marketKeyForChain("plasma")).toBe("plasma-core-v3")
    expect(marketKeyForChain("megaeth")).toBe("megaeth-core-v3")
  })
})

describe("getMarket", () => {
  it("returns a market by key", () => {
    expect(getMarket("ethereum-core-v3")?.chain).toBe("ethereum")
  })

  it("returns undefined for unknown keys", () => {
    expect(getMarket("foo-core-v3")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/config/markets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `config/markets.ts`**

```ts
export type Chain = "ethereum" | "base" | "mantle" | "plasma" | "megaeth"

export interface Market {
  chain: Chain
  marketKey: string
  marketLabel: string
  chainId: number
}

export const MARKETS: Market[] = [
  { chain: "ethereum", marketKey: "ethereum-core-v3", marketLabel: "Core", chainId: 1 },
  { chain: "base",     marketKey: "base-core-v3",     marketLabel: "Core", chainId: 8453 },
  { chain: "mantle",   marketKey: "mantle-core-v3",   marketLabel: "Core", chainId: 5000 },
  { chain: "plasma",   marketKey: "plasma-core-v3",   marketLabel: "Core", chainId: 9745 },
  { chain: "megaeth",  marketKey: "megaeth-core-v3",  marketLabel: "Core", chainId: 6342 },
]

const BY_KEY = new Map(MARKETS.map((m) => [m.marketKey, m]))
const BY_CHAIN = new Map(MARKETS.map((m) => [m.chain, m]))

export function getMarket(key: string): Market | undefined {
  return BY_KEY.get(key)
}

export function marketKeyForChain(chain: Chain): string {
  const m = BY_CHAIN.get(chain)
  if (!m) throw new Error(`Unknown chain: ${chain}`)
  return m.marketKey
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/config/markets.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add config/markets.ts tests/config/markets.test.ts
git commit -m "feat(config): aave v3 markets registry for 5 target chains"
```

---

### Task 1.4: Tokens config + classification helpers

**Files:** `config/tokens.ts`, `tests/config/tokens.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { isTier1Symbol, isTier2Symbol, isPtSymbol } from "@/config/tokens"

describe("isTier1Symbol", () => {
  it("recognises Ethena-issued stables", () => {
    expect(isTier1Symbol("USDe")).toBe(true)
    expect(isTier1Symbol("sUSDe")).toBe(true)
    expect(isTier1Symbol("USDtb")).toBe(true)
    expect(isTier1Symbol("sUSDtb")).toBe(true)
  })

  it("rejects non-Tier-1", () => {
    expect(isTier1Symbol("USDC")).toBe(false)
    expect(isTier1Symbol("PT-sUSDe-25JUN2026")).toBe(false)
  })
})

describe("isTier2Symbol", () => {
  it("recognises backing assets", () => {
    expect(isTier2Symbol("USDC")).toBe(true)
    expect(isTier2Symbol("USDT0")).toBe(true)
    expect(isTier2Symbol("PYUSD")).toBe(true)
    expect(isTier2Symbol("USDm")).toBe(true)
  })
})

describe("isPtSymbol", () => {
  it("matches any PT-* token", () => {
    expect(isPtSymbol("PT-sUSDe-25JUN2026")).toBe(true)
    expect(isPtSymbol("PT-USDe-30OCT2026")).toBe(true)
    expect(isPtSymbol("PT-srUSDe-2APR2026")).toBe(true)
  })

  it("rejects non-PT tokens", () => {
    expect(isPtSymbol("USDe")).toBe(false)
    expect(isPtSymbol("PT")).toBe(false)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/config/tokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `config/tokens.ts`**

```ts
export const TIER_1_SYMBOLS = new Set(["USDe", "sUSDe", "USDtb", "sUSDtb"])

export const TIER_2_SYMBOLS = new Set([
  "USDC", "USDT", "USDT0", "USDM", "USDm", "USDS", "PYUSD", "mUSD",
])

export function isTier1Symbol(symbol: string): boolean {
  return TIER_1_SYMBOLS.has(symbol)
}

export function isTier2Symbol(symbol: string): boolean {
  return TIER_2_SYMBOLS.has(symbol)
}

export function isPtSymbol(symbol: string): boolean {
  return /^PT-.+-\d{1,2}[A-Z]{3}\d{4}$/.test(symbol)
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/config/tokens.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add config/tokens.ts tests/config/tokens.test.ts
git commit -m "feat(config): tier-1, tier-2 and pt-token classification"
```

---

## Phase 2 — TokenLogic API client

### Task 2.1: Zod schemas for the user-positions response

The live API returns `supply_reserve_amount` as either `number` (single-asset) or `number[]` (multi-asset), and date fields wrapped as `{value: "YYYY-MM-DD"}`. Schemas normalise these into uniform shapes.

**Files:** `lib/tokenlogic/schemas.ts`, `tests/tokenlogic/schemas.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { UserPositionRow } from "@/lib/tokenlogic/schemas"

describe("UserPositionRow", () => {
  it("parses a single-asset row", () => {
    const raw = {
      protocol: "aave_v3", chain: "plasma",
      market_key: "plasma-core-v3", market_label: "Core",
      user_address: "0xabc", wallet_label: null,
      latest_block_day: { value: "2026-05-06" },
      supply_reserve_symbols: ["USDT0"],
      supply_reserve_amount: 100,
      supply_reserve_amount_usd: 99.5,
      total_supply_amount_usd: 99.5,
      borrow_reserve_symbols: [], borrow_reserve_amount: 0, borrow_reserve_amount_usd: 0,
      total_borrow_amount_usd: 0,
      health_factor: null, net_apy: 0.04, net_usd_per_day: 0.5, days_to_liquidation: null,
    }
    const parsed = UserPositionRow.parse(raw)
    expect(parsed.supplies).toEqual([{ symbol: "USDT0", amount: 100, amountUsd: 99.5 }])
    expect(parsed.borrows).toEqual([])
    expect(parsed.totalSupplyUsd).toBe(99.5)
    expect(parsed.latestBlockDay).toBe("2026-05-06")
  })

  it("parses a multi-asset row", () => {
    const raw = {
      protocol: "aave_v3", chain: "ethereum",
      market_key: "ethereum-core-v3", market_label: "Core",
      user_address: "0xdef", wallet_label: null,
      latest_block_day: { value: "2026-05-06" },
      supply_reserve_symbols: ["PT-srUSDe-25JUN2026", "PT-srUSDe-2APR2026"],
      supply_reserve_amount: [0.5, 3],
      supply_reserve_amount_usd: [0.5, 3],
      total_supply_amount_usd: 3.5,
      borrow_reserve_symbols: [], borrow_reserve_amount: 0, borrow_reserve_amount_usd: 0,
      total_borrow_amount_usd: 0,
      health_factor: null, net_apy: 0, net_usd_per_day: 0, days_to_liquidation: null,
    }
    const parsed = UserPositionRow.parse(raw)
    expect(parsed.supplies).toHaveLength(2)
    expect(parsed.supplies[0]).toEqual({ symbol: "PT-srUSDe-25JUN2026", amount: 0.5, amountUsd: 0.5 })
  })

  it("parses a borrower row with multi-collateral and HF", () => {
    const raw = {
      protocol: "aave_v3", chain: "plasma",
      market_key: "plasma-core-v3", market_label: "Core",
      user_address: "0xghi", wallet_label: null,
      latest_block_day: { value: "2026-05-06" },
      supply_reserve_symbols: ["USDT0", "USDe", "syrupUSDT"],
      supply_reserve_amount: [0.000001, 283, 2377599],
      supply_reserve_amount_usd: [0.000001, 283, 2676893],
      total_supply_amount_usd: 2677177.32,
      borrow_reserve_symbols: ["USDT0"],
      borrow_reserve_amount: 2407767,
      borrow_reserve_amount_usd: 2407503,
      total_borrow_amount_usd: 2407503,
      health_factor: 1.022944, net_apy: -0.4149, net_usd_per_day: -299.64, days_to_liquidation: 182.385836,
    }
    const parsed = UserPositionRow.parse(raw)
    expect(parsed.supplies).toHaveLength(3)
    expect(parsed.borrows).toEqual([{ symbol: "USDT0", amount: 2407767, amountUsd: 2407503 }])
    expect(parsed.healthFactor).toBe(1.022944)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/tokenlogic/schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/tokenlogic/schemas.ts`**

```ts
import { z } from "zod"

const BqDate = z.object({ value: z.string() }).transform((d) => d.value)

const ScalarOrArray = <T extends z.ZodTypeAny>(s: T) =>
  z.union([s, z.array(s)]).transform((v): z.infer<T>[] => (Array.isArray(v) ? v : [v]))

export const Reserve = z.object({
  symbol: z.string(),
  amount: z.number(),
  amountUsd: z.number(),
})

export type Reserve = z.infer<typeof Reserve>

const RawRow = z.object({
  protocol: z.string(),
  chain: z.string(),
  market_key: z.string(),
  market_label: z.string(),
  user_address: z.string(),
  wallet_label: z.string().nullable(),
  latest_block_day: BqDate,
  supply_reserve_symbols: z.array(z.string()),
  supply_reserve_amount: ScalarOrArray(z.number()),
  supply_reserve_amount_usd: ScalarOrArray(z.number()),
  total_supply_amount_usd: z.number(),
  borrow_reserve_symbols: z.array(z.string()),
  borrow_reserve_amount: ScalarOrArray(z.number()),
  borrow_reserve_amount_usd: ScalarOrArray(z.number()),
  total_borrow_amount_usd: z.number(),
  health_factor: z.number().nullable(),
  net_apy: z.number().nullable(),
  net_usd_per_day: z.number().nullable(),
  days_to_liquidation: z.number().nullable(),
})

function zip(symbols: string[], amounts: number[], amountsUsd: number[]): Reserve[] {
  if (symbols.length === 0) return []
  return symbols.map((symbol, i) => ({
    symbol,
    amount: amounts[i] ?? 0,
    amountUsd: amountsUsd[i] ?? 0,
  }))
}

export const UserPositionRow = RawRow.transform((r) => ({
  protocol: r.protocol,
  chain: r.chain,
  marketKey: r.market_key,
  marketLabel: r.market_label,
  userAddress: r.user_address.toLowerCase(),
  walletLabel: r.wallet_label,
  latestBlockDay: r.latest_block_day,
  supplies: zip(r.supply_reserve_symbols, r.supply_reserve_amount, r.supply_reserve_amount_usd),
  borrows: zip(r.borrow_reserve_symbols, r.borrow_reserve_amount, r.borrow_reserve_amount_usd),
  totalSupplyUsd: r.total_supply_amount_usd,
  totalBorrowUsd: r.total_borrow_amount_usd,
  healthFactor: r.health_factor,
  netApy: r.net_apy,
  netUsdPerDay: r.net_usd_per_day,
  daysToLiquidation: r.days_to_liquidation,
}))

export type UserPositionRow = z.infer<typeof UserPositionRow>

export const UserPositionsResponse = z.object({
  data: z.array(UserPositionRow),
  lastUpdated: z.string().optional(),
})
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/tokenlogic/schemas.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tokenlogic/schemas.ts tests/tokenlogic/schemas.test.ts
git commit -m "feat(tokenlogic): zod schemas with array/scalar normalisation"
```

---

### Task 2.2: Fetch wrapper

**Files:** `lib/tokenlogic/client.ts`, `tests/tokenlogic/client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { tlFetch } from "@/lib/tokenlogic/client"

describe("tlFetch", () => {
  beforeEach(() => {
    vi.stubEnv("TOKENLOGIC_API_KEY", "test-key")
    vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://api.tokenlogic.xyz")
    vi.unstubAllGlobals()
  })

  it("calls with bearer auth and returns JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ x: 1 }] }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const r = await tlFetch("/v1/aave/markets/latest")
    expect(r).toEqual({ data: [{ x: 1 }] })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe("https://api.tokenlogic.xyz/v1/aave/markets/latest")
    expect(opts.headers.Authorization).toBe("Bearer test-key")
  })

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => "Unauthorized",
    }))
    await expect(tlFetch("/x")).rejects.toThrow(/401/)
  })

  it("throws on 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => "Forbidden",
    }))
    await expect(tlFetch("/x")).rejects.toThrow(/403/)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/tokenlogic/client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/tokenlogic/client.ts`**

```ts
import { env } from "@/config/env"

export class TokenLogicError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`TokenLogic API ${status} on ${path}: ${body.slice(0, 200)}`)
  }
}

export async function tlFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${env.TOKENLOGIC_API_BASE_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TOKENLOGIC_API_KEY}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text()
    throw new TokenLogicError(res.status, path, body)
  }
  return (await res.json()) as T
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/tokenlogic/client.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tokenlogic/client.ts tests/tokenlogic/client.test.ts
git commit -m "feat(tokenlogic): authenticated fetch wrapper"
```

---

### Task 2.3: getEthenaPositions and getMarketPositions

**Files:** `lib/tokenlogic/positions.ts`, `tests/tokenlogic/positions.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getEthenaPositions, getMarketPositions } from "@/lib/tokenlogic/positions"

const baseRow = {
  protocol: "aave_v3", chain: "plasma",
  market_key: "plasma-core-v3", market_label: "Core",
  user_address: "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c", wallet_label: null,
  latest_block_day: { value: "2026-05-06" },
  supply_reserve_symbols: ["USDT0"],
  supply_reserve_amount: 100, supply_reserve_amount_usd: 99.5,
  total_supply_amount_usd: 99.5,
  borrow_reserve_symbols: [], borrow_reserve_amount: 0, borrow_reserve_amount_usd: 0,
  total_borrow_amount_usd: 0,
  health_factor: null, net_apy: 0.04, net_usd_per_day: 0.5, days_to_liquidation: null,
}

describe("getEthenaPositions", () => {
  beforeEach(() => {
    vi.stubEnv("TOKENLOGIC_API_KEY", "test")
    vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://x")
  })

  it("queries every wallet and merges results", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const wallet = new URL(url).searchParams.get("user_address")
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ data: [{ ...baseRow, user_address: wallet }] }),
      })
    })
    vi.stubGlobal("fetch", mockFetch)

    const rows = await getEthenaPositions()
    expect(rows).toHaveLength(11)
    expect(mockFetch).toHaveBeenCalledTimes(11)
  })
})

describe("getMarketPositions", () => {
  beforeEach(() => {
    vi.stubEnv("TOKENLOGIC_API_KEY", "test")
    vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://x")
  })

  it("paginates until exhausted", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      ...baseRow, user_address: `0x${i.toString(16).padStart(40, "0")}`,
    }))
    const page2 = Array.from({ length: 47 }, (_, i) => ({
      ...baseRow, user_address: `0x${(1000 + i).toString(16).padStart(40, "0")}`,
    }))
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0")
      const data = offset === 0 ? page1 : offset === 1000 ? page2 : []
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) })
    })
    vi.stubGlobal("fetch", mockFetch)

    const rows = await getMarketPositions("plasma-core-v3")
    expect(rows).toHaveLength(1047)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/tokenlogic/positions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/tokenlogic/positions.ts`**

```ts
import { tlFetch } from "./client"
import { UserPositionsResponse, type UserPositionRow } from "./schemas"
import { ETHENA_WALLETS } from "@/config/wallets"

const PAGE_SIZE = 1000

export async function getPositionsByUser(userAddress: string): Promise<UserPositionRow[]> {
  const raw = await tlFetch(
    `/internal/aave/user-positions/latest?user_address=${userAddress}&limit=${PAGE_SIZE}`
  )
  const parsed = UserPositionsResponse.parse(raw)
  return parsed.data
}

export async function getEthenaPositions(): Promise<UserPositionRow[]> {
  const all = await Promise.all(ETHENA_WALLETS.map(getPositionsByUser))
  return all.flat()
}

export async function getMarketPositions(marketKey: string): Promise<UserPositionRow[]> {
  const out: UserPositionRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const raw = await tlFetch(
      `/internal/aave/user-positions/latest?market_key=${marketKey}&limit=${PAGE_SIZE}&offset=${offset}`
    )
    const parsed = UserPositionsResponse.parse(raw)
    out.push(...parsed.data)
    if (parsed.data.length < PAGE_SIZE) break
  }
  return out
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/tokenlogic/positions.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tokenlogic/positions.ts tests/tokenlogic/positions.test.ts
git commit -m "feat(tokenlogic): getEthenaPositions and getMarketPositions"
```

---

### Task 2.4: getMarketAggregates

**Files:** `lib/tokenlogic/markets.ts`, `tests/tokenlogic/markets.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getMarketAggregates, aggregateKey } from "@/lib/tokenlogic/markets"

describe("getMarketAggregates", () => {
  beforeEach(() => {
    vi.stubEnv("TOKENLOGIC_API_KEY", "test")
    vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://x")
  })

  it("returns reserves keyed by (market_key, reserve_address)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        data: [{
          protocol: "aave_v3",
          market_key: "plasma-core-v3",
          reserve_address: "0xAAA",
          reserve_symbol: "USDT0",
          deposits: 1_000_000,
          borrows: 500_000,
          available_liquidity: 500_000,
          borrow_capacity: 800_000,
          utilization: 0.5,
          borrow_apy: 0.06,
          supply_apy: 0.03,
          reserve_price: 1.0,
        }],
      }),
    }))

    const r = await getMarketAggregates()
    expect(r.size).toBe(1)
    expect(r.get(aggregateKey("plasma-core-v3", "0xAAA"))?.deposits).toBe(1_000_000)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/tokenlogic/markets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/tokenlogic/markets.ts`**

```ts
import { z } from "zod"
import { tlFetch } from "./client"

const MarketReserveRow = z.object({
  protocol: z.string(),
  market_key: z.string(),
  reserve_address: z.string(),
  reserve_symbol: z.string(),
  deposits: z.number(),
  borrows: z.number(),
  available_liquidity: z.number(),
  borrow_capacity: z.number(),
  utilization: z.number(),
  borrow_apy: z.number(),
  supply_apy: z.number(),
  reserve_price: z.number(),
})

const Response = z.object({ data: z.array(MarketReserveRow) })

export type MarketReserve = z.infer<typeof MarketReserveRow>

export function aggregateKey(marketKey: string, reserveAddress: string): string {
  return `${marketKey}:${reserveAddress.toLowerCase()}`
}

export async function getMarketAggregates(): Promise<Map<string, MarketReserve>> {
  const raw = await tlFetch("/v1/aave/markets/latest")
  const parsed = Response.parse(raw)
  return new Map(parsed.data.map((r) => [aggregateKey(r.market_key, r.reserve_address), r]))
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/tokenlogic/markets.test.ts`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add lib/tokenlogic/markets.ts tests/tokenlogic/markets.test.ts
git commit -m "feat(tokenlogic): getMarketAggregates reserve-level snapshot"
```

---

## Phase 3 — Recursion math

### Task 3.1: classify(symbol)

**Files:** `lib/recursion/classify.ts`, `tests/recursion/classify.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { classify } from "@/lib/recursion/classify"

describe("classify", () => {
  it("returns TIER_1 for Ethena-issued tokens", () => {
    expect(classify("USDe")).toBe("TIER_1")
    expect(classify("sUSDe")).toBe("TIER_1")
    expect(classify("USDtb")).toBe("TIER_1")
  })

  it("returns PT for any PT-* maturity", () => {
    expect(classify("PT-sUSDe-25JUN2026")).toBe("PT")
  })

  it("returns TIER_2 for backing assets", () => {
    expect(classify("USDC")).toBe("TIER_2")
    expect(classify("USDT0")).toBe("TIER_2")
    expect(classify("PYUSD")).toBe("TIER_2")
  })

  it("returns OTHER for everything else", () => {
    expect(classify("WETH")).toBe("OTHER")
    expect(classify("syrupUSDT")).toBe("OTHER")
  })

  it("classifies PT before TIER lookups", () => {
    expect(classify("PT-USDe-1JAN2027")).toBe("PT")
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/recursion/classify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/recursion/classify.ts`**

```ts
import { isTier1Symbol, isTier2Symbol, isPtSymbol } from "@/config/tokens"

export type Bucket = "TIER_1" | "TIER_2" | "PT" | "OTHER"

export function classify(symbol: string): Bucket {
  if (isPtSymbol(symbol)) return "PT"
  if (isTier1Symbol(symbol)) return "TIER_1"
  if (isTier2Symbol(symbol)) return "TIER_2"
  return "OTHER"
}

export function isEthenaStack(b: Bucket): boolean {
  return b === "TIER_1" || b === "PT"
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/recursion/classify.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/recursion/classify.ts tests/recursion/classify.test.ts
git commit -m "feat(recursion): classify symbols into TIER_1 / TIER_2 / PT / OTHER"
```

---

### Task 3.2: attribute() pro-rata per row

**Files:** `lib/recursion/attribute.ts`, `tests/recursion/attribute.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { attributeRow } from "@/lib/recursion/attribute"
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

const baseRow: UserPositionRow = {
  protocol: "aave_v3",
  chain: "plasma",
  marketKey: "plasma-core-v3",
  marketLabel: "Core",
  userAddress: "0xabc",
  walletLabel: null,
  latestBlockDay: "2026-05-06",
  supplies: [],
  borrows: [],
  totalSupplyUsd: 0,
  totalBorrowUsd: 0,
  healthFactor: null,
  netApy: null,
  netUsdPerDay: null,
  daysToLiquidation: null,
}

describe("attributeRow (pro-rata)", () => {
  it("attributes a single borrow against single collateral", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [{ symbol: "USDe", amount: 100, amountUsd: 100 }],
      borrows: [{ symbol: "USDT0", amount: 80, amountUsd: 80 }],
      totalSupplyUsd: 100,
      totalBorrowUsd: 80,
    }
    const out = attributeRow(row)
    expect(out).toEqual([
      { borrowSymbol: "USDT0", collateralSymbol: "USDe", borrowedUsd: 80, collateralUsd: 100, leverage: 0.8 },
    ])
  })

  it("splits a single borrow pro-rata across two collaterals", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [
        { symbol: "USDe", amount: 75, amountUsd: 75 },
        { symbol: "USDC", amount: 25, amountUsd: 25 },
      ],
      borrows: [{ symbol: "USDT0", amount: 80, amountUsd: 80 }],
      totalSupplyUsd: 100,
      totalBorrowUsd: 80,
    }
    const out = attributeRow(row)
    expect(out).toHaveLength(2)
    const usde = out.find((a) => a.collateralSymbol === "USDe")!
    const usdc = out.find((a) => a.collateralSymbol === "USDC")!
    expect(usde.borrowedUsd).toBeCloseTo(60)
    expect(usdc.borrowedUsd).toBeCloseTo(20)
  })

  it("returns empty array for users with no borrows", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [{ symbol: "USDe", amount: 100, amountUsd: 100 }],
      borrows: [],
      totalSupplyUsd: 100,
      totalBorrowUsd: 0,
    }
    expect(attributeRow(row)).toEqual([])
  })

  it("handles zero-supply borrowers without dividing by zero", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [],
      borrows: [{ symbol: "USDT0", amount: 80, amountUsd: 80 }],
      totalSupplyUsd: 0,
      totalBorrowUsd: 80,
    }
    expect(attributeRow(row)).toEqual([])
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/recursion/attribute.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/recursion/attribute.ts`**

```ts
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

export interface Attribution {
  borrowSymbol: string
  collateralSymbol: string
  borrowedUsd: number
  collateralUsd: number
  leverage: number
}

export function attributeRow(row: UserPositionRow): Attribution[] {
  if (row.borrows.length === 0 || row.totalSupplyUsd === 0) return []

  const out: Attribution[] = []
  for (const borrow of row.borrows) {
    for (const supply of row.supplies) {
      const fraction = supply.amountUsd / row.totalSupplyUsd
      const borrowedUsd = borrow.amountUsd * fraction
      out.push({
        borrowSymbol: borrow.symbol,
        collateralSymbol: supply.symbol,
        borrowedUsd,
        collateralUsd: supply.amountUsd,
        leverage: row.totalBorrowUsd / row.totalSupplyUsd,
      })
    }
  }
  return out
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/recursion/attribute.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/recursion/attribute.ts tests/recursion/attribute.test.ts
git commit -m "feat(recursion): pro-rata attribution per (user × market) row"
```

---

### Task 3.3: Per-reserve recursion score

**Files:** `lib/recursion/score.ts`, `tests/recursion/score.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { computeReserveRecursion } from "@/lib/recursion/score"
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

const row = (overrides: Partial<UserPositionRow>): UserPositionRow => ({
  protocol: "aave_v3",
  chain: "megaeth",
  marketKey: "megaeth-core-v3",
  marketLabel: "Core",
  userAddress: "0xabc",
  walletLabel: null,
  latestBlockDay: "2026-05-06",
  supplies: [],
  borrows: [],
  totalSupplyUsd: 0,
  totalBorrowUsd: 0,
  healthFactor: null,
  netApy: null,
  netUsdPerDay: null,
  daysToLiquidation: null,
  ...overrides,
})

describe("computeReserveRecursion", () => {
  it("computes recursion for the MegaETH/USDM example case (~83%)", () => {
    const ethenaWallet = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"
    const rows: UserPositionRow[] = [
      // Single borrower posts $200m USDe collateral, borrows $179m USDM
      row({
        userAddress: "0x222",
        supplies: [{ symbol: "USDe", amount: 200_000_000, amountUsd: 200_000_000 }],
        borrows: [{ symbol: "USDm", amount: 179_000_000, amountUsd: 179_000_000 }],
        totalSupplyUsd: 200_000_000,
        totalBorrowUsd: 179_000_000,
      }),
    ]

    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows,
      aggregateDeposits: 600_000_000,
      aggregateBorrows: 179_000_000,
      ethenaSupplyByUser: new Map([[ethenaWallet, 500_000_000]]),
    })

    expect(result.ethenaSupplyShare).toBeCloseTo(500_000_000 / 600_000_000)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(1)
    expect(result.recursionScore).toBeCloseTo(500_000_000 / 600_000_000)
    expect(result.borrowsByCollateral.get("USDe")).toBeCloseTo(179_000_000)
  })

  it("returns score 0 when no recursive borrows", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDC",
      marketKey: "ethereum-core-v3",
      rows: [
        row({
          userAddress: "0x222",
          supplies: [{ symbol: "WETH", amount: 100, amountUsd: 100 }],
          borrows: [{ symbol: "USDC", amount: 50, amountUsd: 50 }],
          totalSupplyUsd: 100,
          totalBorrowUsd: 50,
        }),
      ],
      aggregateDeposits: 1_000_000,
      aggregateBorrows: 50,
      ethenaSupplyByUser: new Map(),
    })
    expect(result.recursionScore).toBe(0)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/recursion/score.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/recursion/score.ts`**

```ts
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"
import { attributeRow } from "./attribute"
import { classify, isEthenaStack } from "./classify"

export interface ReserveRecursion {
  reserveSymbol: string
  marketKey: string
  ethenaSupplyShare: number
  ethenaCollateralBorrowShare: number
  recursionScore: number
  borrowsByCollateral: Map<string, number>
}

export interface ReserveRecursionInput {
  reserveSymbol: string
  marketKey: string
  rows: UserPositionRow[]
  aggregateDeposits: number
  aggregateBorrows: number
  ethenaSupplyByUser: Map<string, number>
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

export function computeReserveRecursion(input: ReserveRecursionInput): ReserveRecursion {
  const ethenaSuppliedTotal = Array.from(input.ethenaSupplyByUser.values())
    .reduce((a, b) => a + b, 0)
  const ethenaSupplyShare = input.aggregateDeposits > 0
    ? clamp(ethenaSuppliedTotal / input.aggregateDeposits)
    : 0

  const borrowsByCollateral = new Map<string, number>()
  let ethenaStackBorrowed = 0
  let totalBorrowed = 0

  for (const row of input.rows) {
    for (const attribution of attributeRow(row)) {
      if (attribution.borrowSymbol !== input.reserveSymbol) continue
      totalBorrowed += attribution.borrowedUsd
      const prev = borrowsByCollateral.get(attribution.collateralSymbol) ?? 0
      borrowsByCollateral.set(attribution.collateralSymbol, prev + attribution.borrowedUsd)
      if (isEthenaStack(classify(attribution.collateralSymbol))) {
        ethenaStackBorrowed += attribution.borrowedUsd
      }
    }
  }

  const ethenaCollateralBorrowShare = totalBorrowed > 0
    ? clamp(ethenaStackBorrowed / totalBorrowed)
    : 0

  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: ethenaSupplyShare * ethenaCollateralBorrowShare,
    borrowsByCollateral,
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/recursion/score.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/recursion/score.ts tests/recursion/score.test.ts
git commit -m "feat(recursion): per-reserve recursion score"
```

---

## Phase 4 — UI primitives

### Task 4.1: Format helpers

**Files:** `lib/format.ts`, `tests/format.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"

describe("fmtUsd", () => {
  it("formats large numbers with M/B suffixes", () => {
    expect(fmtUsd(500_000_000)).toBe("$500.00M")
    expect(fmtUsd(1_500_000_000)).toBe("$1.50B")
    expect(fmtUsd(1_234.56)).toBe("$1.23K")
    expect(fmtUsd(0.5)).toBe("$0.50")
  })
})

describe("fmtPct", () => {
  it("formats percentages", () => {
    expect(fmtPct(0.833)).toBe("83.30%")
    expect(fmtPct(0.001)).toBe("0.10%")
    expect(fmtPct(1)).toBe("100.00%")
  })
})

describe("shortAddr", () => {
  it("returns first 6 + last 4 with ellipsis", () => {
    expect(shortAddr("0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c")).toBe("0xb873...313c")
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm test tests/format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/format.ts`**

```ts
export function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}

export function shortAddr(addr: string): string {
  if (addr.length < 11) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm test tests/format.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts tests/format.test.ts
git commit -m "feat(lib): usd, pct and address formatters"
```

---

### Task 4.2: Tag, KPI card / strip, Header

**Files:** `components/tag.tsx`, `components/kpi-card.tsx`, `components/kpi-strip.tsx`, `components/header.tsx`

- [ ] **Step 1: Implement `components/tag.tsx`**

```tsx
type Variant = "ethena" | "pt" | "anomaly" | "passive" | "default"

const STYLES: Record<Variant, string> = {
  ethena:   "border-[var(--color-success)]   text-[var(--color-success)]",
  pt:       "border-[var(--color-pt-tag)]    text-[var(--color-pt-tag)]",
  anomaly:  "border-[var(--color-recursion)] text-[var(--color-recursion)]",
  passive:  "border-[var(--color-success)]   text-[var(--color-success)]",
  default:  "border-[var(--color-border)]    text-[var(--color-text-muted)]",
}

export function Tag({ variant = "default", children }: { variant?: Variant; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${STYLES[variant]}`}>
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Implement `components/kpi-card.tsx`**

```tsx
export function KpiCard({
  label, value, subValue,
}: { label: string; value: React.ReactNode; subValue?: React.ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-2xl text-[var(--color-text)]">{value}</div>
      {subValue && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{subValue}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Implement `components/kpi-strip.tsx`**

```tsx
export function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/header.tsx`**

```tsx
import Link from "next/link"

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)] px-6 py-4">
      <Link href="/" className="text-[var(--color-accent)] uppercase tracking-wider">
        Ethena Flow Monitor
      </Link>
      <span className="ml-3 text-xs text-[var(--color-text-muted)]">
        Recursive-loop exposure on Aave V3
      </span>
    </header>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/
git commit -m "feat(ui): tag, kpi card/strip, header primitives"
```

---

## Phase 5 — View A (Ethena footprint)

### Task 5.1: View A data loader

**Files:** `lib/views/footprint.ts`

- [ ] **Step 1: Implement `lib/views/footprint.ts`**

```ts
import { getEthenaPositions } from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"

export interface FootprintRow {
  chain: string
  marketKey: string
  reserveSymbol: string
  ethenaSuppliedUsd: number
  reserveAggregateDeposits?: number
  shareOfReserve?: number
  isAnomalyBorrow: boolean
}

export async function loadFootprint(): Promise<FootprintRow[]> {
  const [positions, aggregatesByKey] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggBySymbol = new Map<string, MarketReserve>()
  for (const agg of aggregatesByKey.values()) {
    aggBySymbol.set(`${agg.market_key}:${agg.reserve_symbol}`, agg)
  }

  const out: FootprintRow[] = []
  for (const p of positions) {
    if (!isEthenaWallet(p.userAddress)) continue
    for (const supply of p.supplies) {
      const agg = aggBySymbol.get(`${p.marketKey}:${supply.symbol}`)
      out.push({
        chain: p.chain,
        marketKey: p.marketKey,
        reserveSymbol: supply.symbol,
        ethenaSuppliedUsd: supply.amountUsd,
        reserveAggregateDeposits: agg?.deposits,
        shareOfReserve: agg && agg.deposits > 0 ? supply.amountUsd / agg.deposits : undefined,
        isAnomalyBorrow: false,
      })
    }
    for (const borrow of p.borrows) {
      out.push({
        chain: p.chain,
        marketKey: p.marketKey,
        reserveSymbol: borrow.symbol,
        ethenaSuppliedUsd: -borrow.amountUsd,
        isAnomalyBorrow: true,
      })
    }
  }
  return out.sort((a, b) => Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd))
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/views/footprint.ts
git commit -m "feat(views): footprint data loader for view A"
```

---

### Task 5.2: Footprint table component

**Files:** `components/footprint-table.tsx`

- [ ] **Step 1: Implement `components/footprint-table.tsx`**

```tsx
import Link from "next/link"
import { Tag } from "./tag"
import { fmtUsd, fmtPct } from "@/lib/format"
import type { FootprintRow } from "@/lib/views/footprint"

export function FootprintTable({ rows }: { rows: FootprintRow[] }) {
  return (
    <div className="border border-[var(--color-border)]">
      <div className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        <div className="col-span-2">Chain</div>
        <div className="col-span-3">Reserve</div>
        <div className="col-span-3 text-right">Ethena Supplied</div>
        <div className="col-span-2 text-right">Share of Reserve</div>
        <div className="col-span-2 text-right">Tag</div>
      </div>
      {rows.map((r, i) => (
        <Link
          key={`${r.marketKey}-${r.reserveSymbol}-${i}`}
          href={`/reserve/${r.chain}/${encodeURIComponent(r.reserveSymbol)}`}
          className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg-card)]"
        >
          <div className="col-span-2 text-[var(--color-text-muted)] uppercase">{r.chain}</div>
          <div className="col-span-3">{r.reserveSymbol}</div>
          <div className={`col-span-3 text-right ${r.isAnomalyBorrow ? "text-[var(--color-recursion)]" : ""}`}>
            {fmtUsd(r.ethenaSuppliedUsd)}
          </div>
          <div className="col-span-2 text-right text-[var(--color-accent)]">
            {r.shareOfReserve !== undefined ? fmtPct(r.shareOfReserve) : "—"}
          </div>
          <div className="col-span-2 text-right">
            {r.isAnomalyBorrow
              ? <Tag variant="anomaly">Anomaly: borrow</Tag>
              : <Tag variant="passive">Passive</Tag>}
          </div>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/footprint-table.tsx
git commit -m "feat(ui): footprint table linking each row to reserve drill-down"
```

---

### Task 5.3: View A page

**Files:** `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import { loadFootprint } from "@/lib/views/footprint"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { FootprintTable } from "@/components/footprint-table"
import { fmtUsd } from "@/lib/format"

export const revalidate = 300

export default async function Page() {
  const rows = await loadFootprint()
  const totalSupplied = rows.filter((r) => !r.isAnomalyBorrow).reduce((a, r) => a + r.ethenaSuppliedUsd, 0)
  const reserveCount = new Set(rows.map((r) => `${r.marketKey}:${r.reserveSymbol}`)).size
  const chainCount = new Set(rows.map((r) => r.chain)).size
  const anomalyCount = rows.filter((r) => r.isAnomalyBorrow).length

  return (
    <main>
      <Header />
      <section className="px-6 py-6">
        <h1 className="mb-4 text-xl uppercase tracking-wider text-[var(--color-accent)]">Ethena footprint</h1>
        <KpiStrip>
          <KpiCard label="Total supplied" value={fmtUsd(totalSupplied)} />
          <KpiCard label="Reserves touched" value={String(reserveCount)} />
          <KpiCard label="Chains active" value={String(chainCount)} />
          <KpiCard label="Borrow anomalies" value={String(anomalyCount)} />
        </KpiStrip>
        <div className="mt-6">
          <FootprintTable rows={rows} />
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Run dev and verify**

Run `pnpm dev`. Visit http://localhost:3000.
Expected: a header, four KPI cards (totals from real API data), and a table of every Ethena reserve position. The largest two rows should be MegaETH USDM ($500M) and Plasma USDT0 ($450M) for `0xb873...313c`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(view-a): ethena footprint landing page"
```

---

## Phase 6 — View B (reserve drill-down)

### Task 6.1: View B data loader

**Files:** `lib/views/reserve.ts`

- [ ] **Step 1: Implement `lib/views/reserve.ts`**

```ts
import { getMarketPositions, getEthenaPositions } from "@/lib/tokenlogic/positions"
import { getMarketAggregates } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"
import { marketKeyForChain, type Chain } from "@/config/markets"
import { computeReserveRecursion, type ReserveRecursion } from "@/lib/recursion/score"

export interface DepositorRow {
  userAddress: string
  walletLabel: string | null
  amountUsd: number
  isEthena: boolean
}

export interface ReserveView {
  chain: Chain
  marketKey: string
  reserveSymbol: string
  reserveAddress?: string
  totalSupplyUsd: number
  totalBorrowUsd: number
  utilization: number
  supplyApy: number
  borrowApy: number
  borrowCap: number
  topDepositors: DepositorRow[]
  concentration: { top1: number; top5: number; top10: number }
  recursion: ReserveRecursion
}

export async function loadReserveView(chain: Chain, reserveSymbol: string): Promise<ReserveView> {
  const marketKey = marketKeyForChain(chain)
  const [marketRows, ethenaRows, aggregatesByKey] = await Promise.all([
    getMarketPositions(marketKey),
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggregate = Array.from(aggregatesByKey.values())
    .find((a) => a.market_key === marketKey && a.reserve_symbol === reserveSymbol)
  if (!aggregate) throw new Error(`Reserve not found: ${marketKey}/${reserveSymbol}`)

  const depositors: DepositorRow[] = []
  for (const row of marketRows) {
    for (const supply of row.supplies) {
      if (supply.symbol !== reserveSymbol) continue
      depositors.push({
        userAddress: row.userAddress,
        walletLabel: row.walletLabel,
        amountUsd: supply.amountUsd,
        isEthena: isEthenaWallet(row.userAddress),
      })
    }
  }
  depositors.sort((a, b) => b.amountUsd - a.amountUsd)

  const total = depositors.reduce((a, d) => a + d.amountUsd, 0) || 1
  const top1 = (depositors[0]?.amountUsd ?? 0) / total
  const top5 = depositors.slice(0, 5).reduce((a, d) => a + d.amountUsd, 0) / total
  const top10 = depositors.slice(0, 10).reduce((a, d) => a + d.amountUsd, 0) / total

  const ethenaSupplyByUser = new Map<string, number>()
  for (const row of ethenaRows) {
    if (row.marketKey !== marketKey) continue
    for (const supply of row.supplies) {
      if (supply.symbol !== reserveSymbol) continue
      ethenaSupplyByUser.set(row.userAddress, (ethenaSupplyByUser.get(row.userAddress) ?? 0) + supply.amountUsd)
    }
  }

  const recursion = computeReserveRecursion({
    reserveSymbol,
    marketKey,
    rows: marketRows,
    aggregateDeposits: aggregate.deposits,
    aggregateBorrows: aggregate.borrows,
    ethenaSupplyByUser,
  })

  return {
    chain,
    marketKey,
    reserveSymbol,
    reserveAddress: aggregate.reserve_address,
    totalSupplyUsd: aggregate.deposits,
    totalBorrowUsd: aggregate.borrows,
    utilization: aggregate.utilization,
    supplyApy: aggregate.supply_apy,
    borrowApy: aggregate.borrow_apy,
    borrowCap: aggregate.borrow_capacity,
    topDepositors: depositors.slice(0, 50),
    concentration: { top1, top5, top10 },
    recursion,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/views/reserve.ts
git commit -m "feat(views): reserve drill-down data loader"
```

---

### Task 6.2: Concentration panel

**Files:** `components/concentration-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
import { fmtPct } from "@/lib/format"

export function ConcentrationPanel({
  top1, top5, top10,
}: { top1: number; top5: number; top10: number }) {
  return (
    <div className="border border-[var(--color-border)] p-4">
      <div className="mb-3 text-[10px] uppercase tracking-wider text-[var(--color-accent)]">Concentration</div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Top 1", value: top1 },
          { label: "Top 5", value: top5 },
          { label: "Top 10", value: top10 },
        ].map((c) => (
          <div key={c.label} className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
            <div className="text-[10px] uppercase text-[var(--color-text-muted)]">{c.label}</div>
            <div className="mt-1 text-xl text-[var(--color-accent)]">{fmtPct(c.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/concentration-panel.tsx
git commit -m "feat(ui): concentration panel"
```

---

### Task 6.3: Depositors table

**Files:** `components/depositors-table.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Tag } from "./tag"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"
import type { DepositorRow } from "@/lib/views/reserve"

export function DepositorsTable({
  rows, totalSupplyUsd,
}: { rows: DepositorRow[]; totalSupplyUsd: number }) {
  const pinned = rows.filter((r) => r.isEthena)
  const rest   = rows.filter((r) => !r.isEthena).slice(0, 50 - pinned.length)
  const list   = [...pinned, ...rest]

  return (
    <div className="border border-[var(--color-border)]">
      <div className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        <div className="col-span-1">#</div>
        <div className="col-span-4">Wallet</div>
        <div className="col-span-3 text-right">Supplied</div>
        <div className="col-span-2 text-right">Share</div>
        <div className="col-span-2 text-right">Tag</div>
      </div>
      {list.map((r, i) => (
        <div key={r.userAddress + i} className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-sm">
          <div className="col-span-1 text-[var(--color-text-muted)]">#{i + 1}</div>
          <div className="col-span-4 text-[var(--color-accent)]">{shortAddr(r.userAddress)}</div>
          <div className="col-span-3 text-right">{fmtUsd(r.amountUsd)}</div>
          <div className="col-span-2 text-right">{fmtPct(r.amountUsd / totalSupplyUsd)}</div>
          <div className="col-span-2 text-right">
            {r.isEthena && <Tag variant="ethena">Ethena</Tag>}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/depositors-table.tsx
git commit -m "feat(ui): depositors table with ethena rows pinned"
```

---

### Task 6.4: Recursion panel

**Files:** `components/recursion-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Tag } from "./tag"
import { fmtUsd, fmtPct } from "@/lib/format"
import { classify, type Bucket } from "@/lib/recursion/classify"

interface RowData {
  collateralSymbol: string
  borrowedUsd: number
  shareOfTotal: number
}

const COLORS: Record<Bucket, string> = {
  TIER_1: "var(--color-recursion)",
  PT:     "var(--color-pt-tag)",
  TIER_2: "var(--color-chart-fill)",
  OTHER:  "#475569",
}

export function RecursionPanel({
  totalBorrowUsd, recursionScore, breakdown,
}: { totalBorrowUsd: number; recursionScore: number; breakdown: RowData[] }) {
  return (
    <div className="border border-[var(--color-border)] p-4">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-accent)]">Borrow recursion</div>
      <div className="mb-4 text-2xl">
        <span className="text-[var(--color-recursion)]">{fmtPct(recursionScore)}</span>
        <span className="ml-2 text-sm text-[var(--color-text-muted)]">of borrows are recursive Ethena loops</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={breakdown} dataKey="borrowedUsd" nameKey="collateralSymbol" innerRadius={50} outerRadius={90}>
                {breakdown.map((b, i) => (
                  <Cell key={i} fill={COLORS[classify(b.collateralSymbol)]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
                formatter={(v: number) => fmtUsd(v)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-[var(--color-border)]">
          <div className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            <div className="col-span-5">Collateral</div>
            <div className="col-span-4 text-right">Borrowed</div>
            <div className="col-span-3 text-right">Share</div>
          </div>
          {breakdown.map((b, i) => {
            const bucket = classify(b.collateralSymbol)
            return (
              <div key={i} className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-sm">
                <div className="col-span-5 flex items-center gap-2">
                  <span>{b.collateralSymbol}</span>
                  {bucket === "TIER_1" && <Tag variant="ethena">Ethena</Tag>}
                  {bucket === "PT"     && <Tag variant="pt">PT</Tag>}
                </div>
                <div className="col-span-4 text-right">{fmtUsd(b.borrowedUsd)}</div>
                <div className="col-span-3 text-right">{fmtPct(b.shareOfTotal)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/recursion-panel.tsx
git commit -m "feat(ui): recursion panel with donut and tagged collateral table"
```

---

### Task 6.5: View B page

**Files:** `app/reserve/[chain]/[asset]/page.tsx`

- [ ] **Step 1: Implement the route**

```tsx
import { loadReserveView } from "@/lib/views/reserve"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { ConcentrationPanel } from "@/components/concentration-panel"
import { DepositorsTable } from "@/components/depositors-table"
import { RecursionPanel } from "@/components/recursion-panel"
import { fmtUsd, fmtPct } from "@/lib/format"
import type { Chain } from "@/config/markets"

export const revalidate = 300

export default async function Page({
  params,
}: {
  params: Promise<{ chain: Chain; asset: string }>
}) {
  const { chain, asset } = await params
  const symbol = decodeURIComponent(asset)
  const view = await loadReserveView(chain, symbol)

  const breakdown = Array.from(view.recursion.borrowsByCollateral.entries())
    .map(([collateralSymbol, borrowedUsd]) => ({
      collateralSymbol,
      borrowedUsd,
      shareOfTotal: view.totalBorrowUsd > 0 ? borrowedUsd / view.totalBorrowUsd : 0,
    }))
    .sort((a, b) => b.borrowedUsd - a.borrowedUsd)

  return (
    <main>
      <Header />
      <section className="px-6 py-6">
        <h1 className="mb-1 text-xl uppercase tracking-wider">
          <span className="text-[var(--color-accent)]">{symbol}</span>
          <span className="ml-3 text-[var(--color-text-muted)]">on {chain}</span>
        </h1>
        <div className="mb-4 text-xs text-[var(--color-text-muted)]">{view.marketKey}</div>

        <KpiStrip>
          <KpiCard label="Total supplied" value={fmtUsd(view.totalSupplyUsd)} />
          <KpiCard label="Total borrowed" value={fmtUsd(view.totalBorrowUsd)} />
          <KpiCard label="Utilization"    value={fmtPct(view.utilization)} />
          <KpiCard label="Supply / Borrow APY" value={`${fmtPct(view.supplyApy)} / ${fmtPct(view.borrowApy)}`} />
          <KpiCard label="Borrow cap"     value={fmtUsd(view.borrowCap)} />
          <KpiCard label="Recursion score" value={fmtPct(view.recursion.recursionScore)} />
        </KpiStrip>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ConcentrationPanel {...view.concentration} />
          <RecursionPanel
            totalBorrowUsd={view.totalBorrowUsd}
            recursionScore={view.recursion.recursionScore}
            breakdown={breakdown}
          />
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-accent)]">Top depositors</h2>
          <DepositorsTable rows={view.topDepositors} totalSupplyUsd={view.totalSupplyUsd} />
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Run dev and verify**

Run `pnpm dev`. From the View A page, click the MegaETH/USDM row.
Expected: View B renders with KPI strip, concentration panel showing high Top-1, recursion panel showing high % with USDe dominating, and Ethena's `0xb873` row pinned at the top of the depositors table.

- [ ] **Step 3: Commit**

```bash
git add app/reserve
git commit -m "feat(view-b): reserve drill-down with concentration, recursion and depositors"
```

---

## Phase 7 — Deploy

### Task 7.1: Push to GitHub and Vercel

**Files:** `vercel.json` (only if framework auto-detection isn't enough)

- [ ] **Step 1: Push to GitHub**

```bash
gh repo create ethena-flow-monitor --private --source=. --remote=origin --push
```

- [ ] **Step 2: Link the Vercel project + add env**

```bash
vercel link
vercel env add TOKENLOGIC_API_KEY production
vercel env add TOKENLOGIC_API_KEY preview
vercel env add TOKENLOGIC_API_KEY development
```

Paste the API key value from `.env.local` at each prompt.

- [ ] **Step 3: Deploy**

```bash
vercel --prod
```

- [ ] **Step 4: Smoke-test the production URL**

Open the URL printed by `vercel --prod` in a browser. Expected: View A renders with the same data as local; clicking a row loads View B.

- [ ] **Step 5: Commit any vercel config**

```bash
git add .vercel vercel.json 2>/dev/null || true
git commit --allow-empty -m "chore: vercel deployment config"
```

---

## Phase 8 — README

### Task 8.1: Project README

**Files:** `README.md`

- [ ] **Step 1: Replace `README.md` content**

```markdown
# Ethena Flow Monitor

Dashboard for monitoring Ethena's recursive-loop exposure on Aave V3 across Ethereum, Base, Mantle, Plasma, and MegaETH.

## What it shows

- **View A** — every Aave reserve where the 11 monitored Ethena wallets have a position, ranked by USD size and concentration share.
- **View B** — per-reserve drill-down: top depositors (Ethena badged), concentration KPIs, and a recursion panel that splits borrows by collateral type and surfaces the headline `% of borrows are recursive Ethena loops` figure.

## Stack

- Next.js 15 (App Router) + TypeScript
- TailwindCSS aesthetic, JetBrains Mono
- Recharts for the borrow donut
- Single data source: TokenLogic internal user-positions API (`/internal/aave/user-positions/latest`)

## Local dev

```bash
cp .env.example .env.local
# fill in TOKENLOGIC_API_KEY
pnpm install
pnpm dev
```

Tests:

```bash
pnpm test
```

## Deferred (Phase 2)

- Morpho Blue integration (Ethereum + Base)
- Attribution-rule UI toggle (any-Tier-1 alternative)
- Live `viem` refresh fallback when BigQuery cadence isn't enough
- Time-series view, alert rules

## Spec

Design spec lives at `docs/superpowers/specs/2026-05-06-ethena-flow-monitor-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: project readme"
```

---

## Self-review

**Spec coverage:**
- §1 Purpose — README + View A/B implementations.
- §3 Recursion score — `lib/recursion/score.ts` (Task 3.3), wired in `lib/views/reserve.ts` (Task 6.1).
- §3.1 Multi-collateral attribution — pro-rata in `lib/recursion/attribute.ts` (Task 3.2). Alternative rule + UI toggle deferred per MVP scope and called out under "Deferred to Phase 2".
- §4 Layer 1 — `getEthenaPositions()` (Task 2.3).
- §4 Layer 2 — `getMarketPositions()` (Task 2.3).
- §4 Layer 3 — `getMarketAggregates()` (Task 2.4).
- §4 Caching — React Query (Task 0.5) + `revalidate = 300` on RSC pages.
- §5 Tech stack — Next.js + Tailwind + zod + vitest + recharts + JetBrains Mono in Tasks 0.1–0.4.
- §6 Configuration — `config/{wallets,markets,tokens,env}.ts` in Phase 1.
- §10 Open questions:
  - #1 (discovery-endpoint inconsistency) — sidestepped by hardcoding 5 market_keys in `config/markets.ts` (Task 1.3).
  - #2 (schema deviations) — handled in `lib/tokenlogic/schemas.ts` (Task 2.1).
  - #3 (PT maturity rollover) — operational; `isPtSymbol` regex in `config/tokens.ts` matches any PT-* maturity.
  - #4 (Morpho vault drilling) — deferred.

**Placeholder scan:** No "TBD", "TODO", or "implement later". Every step has executable code or commands.

**Type consistency:**
- `UserPositionRow` defined in Task 2.1, consumed in Tasks 3.2, 3.3, 5.1, 6.1.
- `MarketReserve` defined in Task 2.4, consumed in Tasks 5.1 and 6.1 with the field names from the schema (`deposits`, `borrows`, `utilization`, `supply_apy`, `borrow_apy`, `borrow_capacity`, `reserve_address`, `reserve_symbol`).
- `Bucket` and `classify()` defined in Task 3.1, used in Tasks 3.3 and 6.4.
- `Chain` type defined in Task 1.3, used in Tasks 6.1 and 6.5.
- `FootprintRow` defined in Task 5.1, consumed in Tasks 5.2 and 5.3.
- `DepositorRow` and `ReserveView` defined in Task 6.1, consumed in Tasks 6.3 and 6.5.

No drift detected.
