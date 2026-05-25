# Monochrome Glass Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark-navy terminal aesthetic with a monochrome liquid-glass design system, keeping all data and tables intact.

**Architecture:** Token-first refactor (globals.css), then 6 shared UI primitives (`components/ui/*`), then page-by-page rewiring. Each batch leaves the app in a buildable, green-test state for safe commits.

**Tech Stack:** Next.js 16 (App Router), Tailwind v4 (`@theme` directive), React 19, vitest, Inter + JetBrains Mono via `next/font/google`.

**Spec:** `docs/superpowers/specs/2026-05-25-monochrome-glass-redesign-design.md`

**Key fact:** Tests live in `tests/` and only cover `lib/`, `config/`, `views/` — no component tests exist today. The 165 existing tests are insensitive to cosmetic changes, so the risk of breakage from CSS/JSX edits is near-zero. New primitives will get their own component tests via `@testing-library/react` (already installed).

**Commit cadence:** One commit per task. Run `pnpm test` + `pnpm build` at the end of each batch to verify green state before moving on.

---

## Reference: Shared token replacements

Several tasks reference this list verbatim. When restyling an existing component file, walk the file once and apply every replacement below. **No structural changes**, no prop changes, no data changes — these are pure search-and-replace.

**Color token swaps:**
- `var(--color-accent)` → `var(--color-text-ghost)`
- `var(--color-success)` → `var(--color-ok)`
- `var(--color-recursion)` → `var(--color-risk)`
- `var(--color-pt-tag)` → `var(--color-warn)`
- `var(--color-chart-fill)` → literal `rgba(255,255,255,0.45)`
- `var(--color-chart-blue)` → literal `rgba(255,255,255,0.25)`

**Surface treatment:**
- Outer wrappers using `border border-[var(--color-border)] bg-[var(--color-bg-card)]` for a card effect → replace with the `glass` utility class (drop both classes).
- For inner row containers (table rows, list items) keep them flat with `transition-colors hover:bg-[var(--color-bg-elev)]`.

**Headings:**
- Any local `<h2>` with `uppercase tracking-[0.1em] text-[var(--color-accent)]` → wrap in `<SectionHead title="..." subtitle="..." />` (import from `@/components/ui/section-head`).

**Typography:**
- Cells / spans rendering numbers, percentages, USD, addresses → ensure `font-mono` is on the className.
- Labels and copy stay sans (no class needed; body font is now sans by default).

**Tag API conversion** (import becomes `@/components/ui/tag`):
- `<Tag variant="ethena">` → `<Tag tone="risk">`
- `<Tag variant="pt">` → `<Tag tone="warn">`
- `<Tag variant="anomaly">` → `<Tag tone="risk">`
- `<Tag variant="passive">` → `<Tag tone="ok">`
- `<Tag variant="default">` → `<Tag tone="ghost">`

This is the complete playbook — don't add anything beyond it (no relayouts, no new tags, no removed columns).

## Reference: Shared table re-skin procedure

Used in every task under Batch 9. Apply the **Shared token replacements** above plus these table-specific steps:

1. **Outer wrapper**: remove `border border-[var(--color-border)]` / `bg-[var(--color-bg-card)]` from the outermost table wrapper. Sections handle separation now — the table renders flush.
2. **Column headers**: `<th>` (or header row `<div>`) gets `border-b border-[var(--color-border)]`, `font-medium`, `text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`.
3. **Row borders**: between rows, replace solid `border-b border-[var(--color-border)]` with `border-b border-dashed border-[var(--color-border)]`. Last row drops the border.
4. **Row hover**: add `transition-colors hover:bg-[var(--color-bg-elev)]` to each row.
5. **Numeric cells**: ensure `font-mono` (covered by Shared token replacements, just verify).
6. **Asset name column** (only if there is a clear single-symbol column): prepend `<AssetIcon symbol={...} />` from `@/components/ui/asset-icon` inside a `flex items-center gap-2.5` wrapper.

Do not change column order, sort behavior, or data computation.

---

## Batch 1 — Foundation tokens & shell

Establishes the new design tokens and base page shell. After this batch the app still uses old components but they read new token values (most read the *names* `--color-text`, `--color-border` etc, which we keep — just remap the values).

### Task 1.1: Rewrite `app/globals.css` tokens

**Files:**
- Modify: `app/globals.css` (full rewrite)

- [ ] **Step 1: Replace `globals.css` with the new token set**

```css
@import "tailwindcss";

@theme {
  /* Surfaces */
  --color-bg: #0a0a0c;
  --color-bg-elev: rgba(255, 255, 255, 0.03);
  --color-bg-card: rgba(255, 255, 255, 0.04);
  --color-bg-card-hover: rgba(255, 255, 255, 0.06);

  /* Borders */
  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.14);
  --color-border-subtle: rgba(255, 255, 255, 0.05);
  --color-hairline: rgba(255, 255, 255, 0.08);

  /* Text — three tiers */
  --color-text: #f5f5f7;
  --color-text-muted: rgba(255, 255, 255, 0.6);
  --color-text-dim: rgba(255, 255, 255, 0.6);
  --color-text-ghost: rgba(255, 255, 255, 0.35);

  /* Semantic — color reserved for signals only */
  --color-risk: #ff453a;
  --color-risk-soft: rgba(255, 69, 58, 0.12);
  --color-ok: #30d158;
  --color-ok-soft: rgba(48, 209, 88, 0.10);
  --color-warn: #ff9f0a;
  --color-warn-soft: rgba(255, 159, 10, 0.10);

  /* Back-compat aliases (existing components reference these — keep until rewired) */
  --color-accent: rgba(255, 255, 255, 0.55);
  --color-accent-soft: rgba(255, 255, 255, 0.35);
  --color-success: #30d158;
  --color-recursion: #ff453a;
  --color-pt-tag: #ff9f0a;
  --color-chart-fill: rgba(255, 255, 255, 0.45);
  --color-chart-blue: rgba(255, 255, 255, 0.25);

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 200ms;
  --dur-rise: 500ms;
  --dur-meter: 900ms;

  /* Fonts (variables set by next/font/google in layout.tsx) */
  --font-sans: var(--font-sans), -apple-system, system-ui, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
}

html, body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums slashed-zero;
}

.tabular {
  font-variant-numeric: tabular-nums slashed-zero;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums slashed-zero;
}

/* Glass surface utility */
.glass {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 12px 40px rgba(0, 0, 0, 0.4);
}

/* Motion keyframes */
@keyframes efm-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes efm-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes efm-fill {
  from { width: 0; }
  to { width: var(--efm-fill-to, 100%); }
}
@keyframes efm-risk-pulse {
  0%, 100% { text-shadow: none; }
  50% { text-shadow: 0 0 24px rgba(255, 69, 58, 0.5); }
}
@keyframes efm-glow-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(255, 69, 58, 0.3); }
  50% { box-shadow: 0 0 18px rgba(255, 69, 58, 0.6); }
}

.efm-rise { opacity: 0; animation: efm-rise var(--dur-rise) var(--ease-out) forwards; }
.efm-fade { opacity: 0; animation: efm-fade var(--dur-fast) var(--ease-out) forwards; }

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

The back-compat aliases (`--color-accent`, `--color-success`, etc) are mapped to neutral/monochrome values so existing components instantly look on-system. They get removed in Batch 12 once every consumer is rewired.

- [ ] **Step 2: Run build to verify CSS compiles**

Run: `cd ~/Projects/ethena-flow-monitor && pnpm build 2>&1 | tail -20`
Expected: build succeeds; no Tailwind errors.

- [ ] **Step 3: Run tests**

Run: `cd ~/Projects/ethena-flow-monitor && pnpm test 2>&1 | tail -5`
Expected: 165 tests pass.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ethena-flow-monitor
git add app/globals.css
git commit -m "feat(design): rewrite globals.css tokens to monochrome glass system"
```

### Task 1.2: Add page-level glow backdrop

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace layout body with glow backdrop wrapper**

Replace the contents of `app/layout.tsx` with:

```tsx
import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Ethena Flow Monitor",
  description:
    "Ethena backing composition and recursive-loop exposure across Aave, Morpho, Kamino and Jupiter Lend.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="relative min-h-screen overflow-x-hidden">
        {/* Background glows — fixed so they don't scroll with content */}
        <div
          aria-hidden
          className="pointer-events-none fixed -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-white opacity-[0.04] blur-[100px]"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed -right-40 top-[20vh] h-[420px] w-[420px] rounded-full opacity-[0.18] blur-[100px]"
          style={{ background: "var(--color-risk)" }}
        />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Run dev server visually (optional sanity check)**

Run: `cd ~/Projects/ethena-flow-monitor && pnpm dev` (then open http://localhost:3000, then Ctrl-C)
Expected: page background is near-black with two soft glows visible behind content.

- [ ] **Step 3: Run build + tests**

Run: `cd ~/Projects/ethena-flow-monitor && pnpm build && pnpm test 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(design): add fixed glow backdrop on body"
```

---

## Batch 2 — Glass primitive + Tag rewrite

Introduces the first two shared primitives. Tag is rewritten in place (drops old variant names, adds tone-based API) — the existing `tag.tsx` consumers (recursion-panel) will be updated to the new API in Batch 8.

### Task 2.1: Add `<GlassCard>` primitive

**Files:**
- Create: `components/ui/glass-card.tsx`
- Create: `tests/components/glass-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/glass-card.test.tsx
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GlassCard } from "@/components/ui/glass-card"

describe("GlassCard", () => {
  it("renders children and applies glass class", () => {
    const { getByText, container } = render(<GlassCard>hello</GlassCard>)
    expect(getByText("hello")).toBeDefined()
    expect(container.firstChild).toHaveClass("glass")
  })

  it("merges custom className", () => {
    const { container } = render(<GlassCard className="p-4">x</GlassCard>)
    expect(container.firstChild).toHaveClass("glass", "p-4")
  })
})
```

- [ ] **Step 2: Add jest-dom matcher import to `tests/setup.ts`**

Read `tests/setup.ts` and add at top if not present:
```ts
import "@testing-library/jest-dom/vitest"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Projects/ethena-flow-monitor && pnpm test glass-card 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `GlassCard`**

```tsx
// components/ui/glass-card.tsx
import type { HTMLAttributes } from "react"

export function GlassCard({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass ${className}`} {...rest}>
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test glass-card 2>&1 | tail -10`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/ui/glass-card.tsx tests/components/glass-card.test.tsx tests/setup.ts
git commit -m "feat(ui): add GlassCard primitive"
```

### Task 2.2: Rewrite `<Tag>` with tone-based API

**Files:**
- Create: `components/ui/tag.tsx`
- Create: `tests/components/tag.test.tsx`
- Modify (later in this task): nothing yet — old `components/tag.tsx` stays until consumers are rewired.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/tag.test.tsx
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Tag } from "@/components/ui/tag"

describe("Tag", () => {
  it("renders children", () => {
    const { getByText } = render(<Tag>verified</Tag>)
    expect(getByText("verified")).toBeDefined()
  })

  it("applies ok tone classes", () => {
    const { container } = render(<Tag tone="ok">ok</Tag>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain("color-ok")
  })

  it("applies risk tone classes", () => {
    const { container } = render(<Tag tone="risk">bad</Tag>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain("color-risk")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tag 2>&1 | tail -10`
Expected: FAIL — `components/ui/tag` not found.

- [ ] **Step 3: Implement `Tag`**

```tsx
// components/ui/tag.tsx
type Tone = "ok" | "risk" | "warn" | "ghost"

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-[color:rgba(48,209,88,0.25)]",
  risk: "bg-[var(--color-risk-soft)] text-[var(--color-risk)] border-[color:rgba(255,69,58,0.25)]",
  warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-[color:rgba(255,159,10,0.25)]",
  ghost:
    "bg-[color:rgba(255,255,255,0.05)] text-[var(--color-text-ghost)] border-[var(--color-border)]",
}

export function Tag({
  tone = "ghost",
  children,
}: {
  tone?: Tone
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-[3px] font-mono text-[10px] tracking-[0.04em] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tag 2>&1 | tail -10`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/ui/tag.tsx tests/components/tag.test.tsx
git commit -m "feat(ui): add Tag primitive with tone API"
```

---

## Batch 3 — AssetIcon + CoverageBar primitives

### Task 3.1: Add `<AssetIcon>`

**Files:**
- Create: `components/ui/asset-icon.tsx`
- Create: `tests/components/asset-icon.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// tests/components/asset-icon.test.tsx
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AssetIcon } from "@/components/ui/asset-icon"

describe("AssetIcon", () => {
  it("renders the first letter uppercase", () => {
    const { getByText } = render(<AssetIcon symbol="usde" />)
    expect(getByText("U")).toBeDefined()
  })

  it("handles empty symbol gracefully", () => {
    const { container } = render(<AssetIcon symbol="" />)
    expect(container.firstChild).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test asset-icon 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AssetIcon`**

```tsx
// components/ui/asset-icon.tsx
export function AssetIcon({ symbol }: { symbol: string }) {
  const letter = (symbol[0] ?? "?").toUpperCase()
  return (
    <span
      aria-hidden
      className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[color:rgba(255,255,255,0.06)] font-mono text-[9px] font-medium text-[var(--color-text)]"
    >
      {letter}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test asset-icon 2>&1 | tail -10`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/ui/asset-icon.tsx tests/components/asset-icon.test.tsx
git commit -m "feat(ui): add AssetIcon primitive"
```

### Task 3.2: Add `<CoverageBar>`

**Files:**
- Create: `components/ui/coverage-bar.tsx`
- Create: `tests/components/coverage-bar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// tests/components/coverage-bar.test.tsx
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CoverageBar } from "@/components/ui/coverage-bar"

describe("CoverageBar", () => {
  it("renders ok fill class when coverage >= 0.95", () => {
    const { container } = render(<CoverageBar value={100} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill).toBeDefined()
    expect(fill.dataset.tone).toBe("ok")
  })

  it("renders warn tone for 80-94% coverage", () => {
    const { container } = render(<CoverageBar value={85} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.dataset.tone).toBe("warn")
  })

  it("renders risk tone below 80% coverage", () => {
    const { container } = render(<CoverageBar value={60} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.dataset.tone).toBe("risk")
  })

  it("clamps width to 100% when over-reported", () => {
    const { container } = render(<CoverageBar value={120} reported={100} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.style.width).toBe("100%")
  })

  it("renders 0% width when reported is zero", () => {
    const { container } = render(<CoverageBar value={0} reported={0} />)
    const fill = container.querySelector("[data-fill]") as HTMLElement
    expect(fill.style.width).toBe("0%")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test coverage-bar 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CoverageBar`**

```tsx
// components/ui/coverage-bar.tsx
type Tone = "ok" | "warn" | "risk"

const TONE_BG: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  risk: "var(--color-risk)",
}

function tone(coverage: number): Tone {
  if (coverage >= 0.95) return "ok"
  if (coverage >= 0.8) return "warn"
  return "risk"
}

export function CoverageBar({
  value,
  reported,
}: {
  /** On-chain (verified) value in USD. */
  value: number
  /** Reported value in USD — denominator. */
  reported: number
}) {
  const coverage = reported > 0 ? value / reported : 0
  const widthPct = Math.min(100, Math.max(0, coverage * 100))
  const t = tone(coverage)
  return (
    <div className="h-[4px] w-full overflow-hidden rounded-sm bg-[color:rgba(255,255,255,0.06)]">
      <div
        data-fill
        data-tone={t}
        className="h-full rounded-sm"
        style={{ width: `${widthPct}%`, background: TONE_BG[t] }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test coverage-bar 2>&1 | tail -10`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/ui/coverage-bar.tsx tests/components/coverage-bar.test.tsx
git commit -m "feat(ui): add CoverageBar primitive"
```

---

## Batch 4 — SectionHead + HeroMeter primitives

### Task 4.1: Add `<SectionHead>`

**Files:**
- Create: `components/ui/section-head.tsx`
- Create: `tests/components/section-head.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// tests/components/section-head.test.tsx
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SectionHead } from "@/components/ui/section-head"

describe("SectionHead", () => {
  it("renders title", () => {
    const { getByText } = render(<SectionHead title="Reconciliation" />)
    expect(getByText("Reconciliation")).toBeDefined()
  })

  it("renders subtitle when given", () => {
    const { getByText } = render(<SectionHead title="X" subtitle="hello" />)
    expect(getByText("hello")).toBeDefined()
  })

  it("renders status node when given", () => {
    const { getByText } = render(
      <SectionHead title="X" status={<span>BADGE</span>} />,
    )
    expect(getByText("BADGE")).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test section-head 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SectionHead`**

```tsx
// components/ui/section-head.tsx
export function SectionHead({
  title,
  subtitle,
  status,
}: {
  title: string
  subtitle?: string
  status?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[11px] text-[var(--color-text-ghost)]">{subtitle}</p>
        )}
      </div>
      {status && <div className="shrink-0">{status}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test section-head 2>&1 | tail -10`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/ui/section-head.tsx tests/components/section-head.test.tsx
git commit -m "feat(ui): add SectionHead primitive"
```

### Task 4.2: Add `<HeroMeter>`

**Files:**
- Create: `components/ui/hero-meter.tsx`
- Create: `tests/components/hero-meter.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// tests/components/hero-meter.test.tsx
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HeroMeter } from "@/components/ui/hero-meter"

describe("HeroMeter", () => {
  it("renders label and percentage", () => {
    const { getByText } = render(
      <HeroMeter
        label="Recursive exposure"
        ratio={0.204}
        rightCaption="$1.31B of $6.42B"
      />,
    )
    expect(getByText("Recursive exposure")).toBeDefined()
    expect(getByText("20.4")).toBeDefined()
    expect(getByText("$1.31B of $6.42B")).toBeDefined()
  })

  it("adds pulse class when ratio exceeds threshold", () => {
    const { container } = render(
      <HeroMeter
        label="x"
        ratio={0.25}
        rightCaption=""
        threshold={0.2}
      />,
    )
    const value = container.querySelector("[data-meter-value]") as HTMLElement
    expect(value.dataset.pulse).toBe("true")
  })

  it("does not pulse when ratio is at or below threshold", () => {
    const { container } = render(
      <HeroMeter label="x" ratio={0.2} rightCaption="" threshold={0.2} />,
    )
    const value = container.querySelector("[data-meter-value]") as HTMLElement
    expect(value.dataset.pulse).toBe("false")
  })

  it("clamps bar fill to 100% even with ratio > 1", () => {
    const { container } = render(
      <HeroMeter label="x" ratio={1.5} rightCaption="" />,
    )
    const fill = container.querySelector("[data-meter-fill]") as HTMLElement
    expect(fill.style.getPropertyValue("--efm-fill-to")).toBe("100%")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test hero-meter 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `HeroMeter`**

```tsx
// components/ui/hero-meter.tsx
const DEFAULT_THRESHOLD = 0.2

export function HeroMeter({
  label,
  ratio,
  rightCaption,
  threshold = DEFAULT_THRESHOLD,
}: {
  label: string
  /** 0..1 fraction — drives bar fill and value display. */
  ratio: number
  /** Right-aligned caption (e.g. "$1.31B of $6.42B"). */
  rightCaption: React.ReactNode
  /** Pulse the value above this fraction. */
  threshold?: number
}) {
  const pct = ratio * 100
  const fillPct = Math.min(100, Math.max(0, pct))
  const pulse = ratio > threshold
  const pulseStyle = pulse
    ? {
        animation:
          "efm-rise 700ms var(--ease-out) 200ms forwards, efm-risk-pulse 3s ease-in-out 1.5s infinite",
      }
    : {
        animation: "efm-rise 700ms var(--ease-out) 200ms forwards",
      }
  const fillAnimation = pulse
    ? "efm-fill var(--dur-meter) var(--ease-out) 400ms forwards, efm-glow-pulse 3s ease-in-out 1.5s infinite"
    : "efm-fill var(--dur-meter) var(--ease-out) 400ms forwards"
  return (
    <div className="glass flex flex-col justify-between p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
            {label}
          </div>
          <div
            data-meter-value
            data-pulse={pulse}
            className="mt-1 font-mono text-[36px] font-light leading-none tracking-[-0.03em] text-[var(--color-risk)] opacity-0"
            style={pulseStyle}
          >
            {pct.toFixed(1)}
            <span className="ml-[2px] text-[22px] text-[var(--color-text-ghost)]">%</span>
          </div>
        </div>
        <div className="text-right font-mono text-[10px] leading-[1.5] text-[var(--color-text-ghost)]">
          {rightCaption}
        </div>
      </div>
      <div className="mt-4 h-[8px] overflow-hidden rounded-sm bg-[color:rgba(255,255,255,0.06)]">
        <div
          data-meter-fill
          className="h-full rounded-sm bg-[var(--color-risk)]"
          style={{
            width: 0,
            ["--efm-fill-to" as string]: `${fillPct}%`,
            animation: fillAnimation,
            boxShadow: "0 0 10px rgba(255,69,58,0.4)",
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test hero-meter 2>&1 | tail -10`
Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite and build to verify no regressions**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green + build success.

- [ ] **Step 6: Commit**

```bash
git add components/ui/hero-meter.tsx tests/components/hero-meter.test.tsx
git commit -m "feat(ui): add HeroMeter primitive with threshold pulse"
```

---

## Batch 5 — Header redesign

### Task 5.1: Rewrite `Header` as glass nav

**Files:**
- Modify: `components/header.tsx`
- Modify: `components/data-age.tsx`

- [ ] **Step 1: Read current `DataAge` to know the contract**

Run: `cat ~/Projects/ethena-flow-monitor/components/data-age.tsx`

It exports `<DataAge timestamp={number} />` rendering "Updated X ago". Keep the prop shape; just restyle internally in step 3.

- [ ] **Step 2: Rewrite `components/header.tsx`**

Replace its full contents with:

```tsx
import Link from "next/link"
import { DataAge } from "./data-age"
import { ETHENA_WALLETS } from "@/config/wallets"

export function Header({
  renderedAt,
  failedWallets,
}: {
  renderedAt?: number
  failedWallets?: string[]
}) {
  const hasFailures = failedWallets && failedWallets.length > 0
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[color:rgba(10,10,12,0.6)] backdrop-blur-[20px]">
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="text-[13px] font-medium tracking-[-0.01em] text-[var(--color-text)]">
            Ethena Flow Monitor
          </span>
          <span className="hidden text-[11px] text-[var(--color-text-ghost)] md:inline">
            Recursive-loop exposure across Aave, Morpho, Kamino &amp; Jupiter
          </span>
        </Link>
        {renderedAt ? <DataAge timestamp={renderedAt} /> : null}
      </div>
      {hasFailures ? (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-md border border-[color:rgba(255,69,58,0.25)] bg-[var(--color-risk-soft)] px-3 py-2 font-mono text-[11px] text-[var(--color-risk)]">
          <span className="font-medium">Partial data</span>
          <span className="text-[var(--color-text-ghost)]">
            {failedWallets!.length} of {ETHENA_WALLETS.length} Ethena wallet
            {failedWallets!.length === 1 ? "" : "s"} failed; figures may be understated
          </span>
        </div>
      ) : null}
    </header>
  )
}
```

- [ ] **Step 3: Restyle `DataAge` to a glass pill**

Replace `components/data-age.tsx` content (preserving the timer behavior) with:

```tsx
"use client"

import { useEffect, useState } from "react"

function fmtAgo(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

export function DataAge({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(48,209,88,0.3)] bg-[var(--color-ok-soft)] px-2.5 py-[3px] font-mono text-[10px] text-[var(--color-ok)]"
      title={new Date(timestamp).toISOString()}
    >
      <span
        aria-hidden
        className="h-[6px] w-[6px] rounded-full bg-current"
        style={{ boxShadow: "0 0 8px currentColor" }}
      />
      live · {fmtAgo(now - timestamp)}
    </span>
  )
}
```

If the existing `DataAge` already includes additional behavior not captured above (different format, error states), preserve it instead of overwriting blindly — adapt the styling onto whatever it currently does. Re-read it before editing.

- [ ] **Step 4: Run build + tests**

Run: `pnpm build && pnpm test 2>&1 | tail -10`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add components/header.tsx components/data-age.tsx
git commit -m "feat(design): glass nav header + live pill DataAge"
```

---

## Batch 6 — Hero replacement on home page

### Task 6.1: Rebuild `app/page.tsx` hero structure

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/kpi-card.tsx`
- Modify: `components/kpi-strip.tsx`

- [ ] **Step 1: Update `kpi-card.tsx` to glass tile style**

Replace its contents with:

```tsx
type Tone = "default" | "recursion" | "accent"

const VALUE_TONE: Record<Tone, string> = {
  default: "text-[var(--color-text)]",
  recursion: "text-[var(--color-risk)]",
  accent: "text-[var(--color-ok)]",
}

export function KpiCard({
  label,
  value,
  subValue,
  tone = "default",
}: {
  label: string
  value: React.ReactNode
  subValue?: React.ReactNode
  tone?: Tone
}) {
  return (
    <div className="bg-[var(--color-bg-elev)] px-4 py-3 efm-rise">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-[18px] font-light leading-[1.1] tracking-[-0.02em] ${VALUE_TONE[tone]}`}>
        {value}
      </div>
      {subValue && (
        <div className="mt-1 font-mono text-[10px] text-[var(--color-text-ghost)]">{subValue}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `kpi-strip.tsx` to be a 1px-gap grid container**

Replace contents with:

```tsx
export function KpiStrip({
  children,
  columns = 4,
}: {
  children: React.ReactNode
  columns?: 2 | 3 | 4 | 6
}) {
  const cls =
    columns === 6
      ? "md:grid-cols-3 lg:grid-cols-6"
      : columns === 4
        ? "md:grid-cols-2 lg:grid-cols-4"
        : columns === 3
          ? "grid-cols-2 md:grid-cols-3"
          : "grid-cols-2"
  return (
    <div
      className={`grid grid-cols-2 gap-[1px] overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-border)] ${cls}`}
    >
      {children}
    </div>
  )
}
```

This gives the strip the hairline-divider look from the spec (1px gap on a border-colored background creates the divider effect).

- [ ] **Step 3: Read current `app/page.tsx` in full**

Run: `cat ~/Projects/ethena-flow-monitor/app/page.tsx`

Note the existing computed values: `ethenaTotal`, `onchainBacking`, `verifierDeltaPct`, `verifierOk`, `deployedUsd`, `idle.totalUsd`, `recursiveUsd`, `backingBase`, `nonRecursiveUsd`, `ethenaCustodial`, `weightedRecursion`. Some you'll keep, some move into the hero.

- [ ] **Step 4: Rewrite the JSX return of `app/page.tsx` — top half only**

Locate the existing `return ( <main> ... )` and replace the section that currently renders the `<h1>Ethena footprint</h1>` and the 6-tile `<KpiStrip>` with the new hero block. The exact new content for that region (everything from `<Header ...>` through the bottom of the KPI strip):

```tsx
<Header renderedAt={renderedAt} failedWallets={failedWallets} />

<section className="px-6 pt-8 pb-6">
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
        Total backing
      </div>
      <div
        className="mt-2 font-mono text-[44px] font-light leading-none tracking-[-0.03em] text-[var(--color-text)] opacity-0"
        style={{ animation: "efm-rise 700ms var(--ease-out) 100ms forwards" }}
      >
        {ethenaTotal !== null ? fmtUsd(ethenaTotal) : fmtUsd(onchainBacking)}
      </div>
      {ethenaTotal !== null && verifierDeltaPct !== null ? (
        <span
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] ${
            verifierOk
              ? "border-[color:rgba(48,209,88,0.25)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
              : "border-[color:rgba(255,159,10,0.25)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
          }`}
        >
          {verifierOk ? "✓" : "⚠"} on-chain {verifierDeltaPct >= 0 ? "+" : ""}
          {fmtPct(verifierDeltaPct)} vs Ethena reported
        </span>
      ) : (
        <span className="mt-3 inline-flex rounded-full border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-ghost)]">
          on-chain only — Ethena API unavailable
        </span>
      )}
    </div>
    <HeroMeter
      label="Recursive exposure"
      ratio={backingBase > 0 ? recursiveUsd / backingBase : 0}
      rightCaption={
        <>
          {fmtUsd(recursiveUsd)}
          <br />
          of {fmtUsd(backingBase)}
        </>
      }
    />
  </div>
</section>

<section className="px-6 pb-6">
  <KpiStrip columns={4}>
    <KpiCard
      label="Custodial / off-chain"
      value={ethenaCustodial !== null ? fmtUsd(ethenaCustodial) : "—"}
      subValue="Copper + BTC-anchored"
    />
    <KpiCard label="Deployed in lending" value={fmtUsd(deployedUsd)} />
    <KpiCard label="Idle backing" value={fmtUsd(idle.totalUsd)} />
    <KpiCard label="Non-recursive backing" value={fmtUsd(nonRecursiveUsd)} />
  </KpiStrip>
</section>
```

Add `import { HeroMeter } from "@/components/ui/hero-meter"` to the top of `app/page.tsx`.

Leave everything below this point (reconciliation panel, tables, monitored wallets) untouched in this task — they get updated in later batches.

- [ ] **Step 5: Run dev server visually to verify layout**

Run: `pnpm dev` then open http://localhost:3000. Verify hero shows total backing on the left and recursion meter on the right, with the 4-tile strip below. Ctrl-C when done.
Expected: matches the spec hero mockup.

- [ ] **Step 6: Run build + tests**

Run: `pnpm build && pnpm test 2>&1 | tail -10`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx components/kpi-card.tsx components/kpi-strip.tsx
git commit -m "feat(design): replace KPI strip with hero + recursion meter"
```

---

## Batch 7 — Reconciliation panel

### Task 7.1: Rewrite `reconciliation-panel.tsx`

**Files:**
- Modify: `components/reconciliation-panel.tsx`

- [ ] **Step 1: Inspect the data type to keep prop contract intact**

Run: `cat ~/Projects/ethena-flow-monitor/lib/views/reconciliation.ts | head -80`

Confirm `Reconciliation` shape: `{ rows: Array<{ asset, ethenaUsd, onchainUsd, gapUsd, status, note? }>, ethenaTotal, onchainTotal, gapTotal }` and `ReconciliationStatus = "verified" | "gap" | "off-chain"`.

- [ ] **Step 2: Replace component body**

Replace `components/reconciliation-panel.tsx` contents with:

```tsx
import { fmtUsd } from "@/lib/format"
import type { Reconciliation, ReconciliationStatus } from "@/lib/views/reconciliation"
import { SectionHead } from "@/components/ui/section-head"
import { Tag } from "@/components/ui/tag"
import { AssetIcon } from "@/components/ui/asset-icon"
import { CoverageBar } from "@/components/ui/coverage-bar"

function fmtGap(usd: number): string {
  if (Math.abs(usd) < 5e5) return "≈ $0"
  return (usd > 0 ? "+" : "−") + fmtUsd(Math.abs(usd))
}

const STATUS_TONE: Record<ReconciliationStatus, "ok" | "risk" | "ghost"> = {
  verified: "ok",
  gap: "risk",
  "off-chain": "ghost",
}

const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  verified: "verified",
  gap: "gap",
  "off-chain": "off-chain",
}

export function ReconciliationPanel({ data }: { data: Reconciliation }) {
  return (
    <div>
      <SectionHead
        title="Per-asset reconciliation"
        subtitle="Ethena reported vs on-chain verified. Off-chain rows have no reader (XRPL, Copper) — their gap is structural."
        status={<Tag tone="ghost">{fmtGap(data.gapTotal)} unverified</Tag>}
      />
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
            <th className="py-2 pl-3 pr-3 font-medium">Asset</th>
            <th className="py-2 pr-3 text-right font-medium">Reported</th>
            <th className="py-2 pr-3 text-right font-medium">On-chain</th>
            <th className="py-2 pr-3 font-medium">Coverage</th>
            <th className="py-2 pr-3 text-right font-medium">Δ</th>
            <th className="py-2 pr-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr
              key={r.asset}
              className="border-b border-dashed border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-elev)]"
            >
              <td className="py-2.5 pl-3 pr-3">
                <span className="flex items-center gap-2.5">
                  <AssetIcon symbol={r.asset} />
                  <span className="text-[var(--color-text)]">{r.asset}</span>
                </span>
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-[var(--color-text)]">
                {fmtUsd(r.ethenaUsd)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-[var(--color-text)]">
                {fmtUsd(r.onchainUsd)}
              </td>
              <td className="py-2.5 pr-3" style={{ width: 140 }}>
                {r.status === "off-chain" ? (
                  <span className="text-[10px] text-[var(--color-text-ghost)]">n/a</span>
                ) : (
                  <CoverageBar value={r.onchainUsd} reported={r.ethenaUsd} />
                )}
              </td>
              <td
                className={`py-2.5 pr-3 text-right font-mono ${
                  r.status === "verified"
                    ? "text-[var(--color-ok)]"
                    : r.status === "gap"
                      ? "text-[var(--color-risk)]"
                      : "text-[var(--color-text-ghost)]"
                }`}
              >
                {fmtGap(r.gapUsd)}
              </td>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <Tag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                  {r.note ? (
                    <span className="truncate text-[10px] text-[var(--color-text-ghost)]">
                      {r.note}
                    </span>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-[var(--color-text-dim)]">
            <td className="py-2.5 pl-3 pr-3 text-[10px] uppercase tracking-[0.1em]">Total</td>
            <td className="py-2.5 pr-3 text-right font-mono">{fmtUsd(data.ethenaTotal)}</td>
            <td className="py-2.5 pr-3 text-right font-mono">{fmtUsd(data.onchainTotal)}</td>
            <td />
            <td className="py-2.5 pr-3 text-right font-mono">{fmtGap(data.gapTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Run tests + build**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add components/reconciliation-panel.tsx
git commit -m "feat(design): reconciliation panel with coverage bars + tags"
```

---

## Batch 8 — Recursion panel + Solana composition

### Task 8.1: Rewrite `recursion-panel.tsx` to use new tokens + Tag API

**Files:**
- Modify: `components/recursion-panel.tsx`

- [ ] **Step 1: Replace component**

Replace `components/recursion-panel.tsx` contents with:

```tsx
"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { fmtUsd, fmtPct } from "@/lib/format"
import { classify, type Bucket } from "@/lib/recursion/classify"
import { Tag } from "@/components/ui/tag"
import { SectionHead } from "@/components/ui/section-head"

interface RowData {
  collateralSymbol: string
  borrowedUsd: number
  shareOfTotal: number
}

const COLORS: Record<Bucket, string> = {
  TIER_1: "var(--color-risk)",
  PT: "var(--color-warn)",
  TIER_2: "rgba(255,255,255,0.55)",
  OTHER: "rgba(255,255,255,0.22)",
}

const ROW_FILL: Record<Bucket, string> = {
  TIER_1: "rgba(255,69,58,0.10)",
  PT: "rgba(255,159,10,0.10)",
  TIER_2: "rgba(255,255,255,0.05)",
  OTHER: "rgba(255,255,255,0.03)",
}

export function RecursionPanel({
  ethenaCollateralBorrowShare,
  breakdown,
}: {
  ethenaCollateralBorrowShare: number
  breakdown: RowData[]
}) {
  const totalBorrowed = breakdown.reduce((a, b) => a + b.borrowedUsd, 0)

  return (
    <div>
      <SectionHead
        title="Borrow recursion"
        subtitle="Share of total borrows collateralised by Ethena-stack assets"
        status={<Tag tone="risk">{fmtPct(ethenaCollateralBorrowShare)} Ethena-collateralised</Tag>}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
        <div className="relative h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="borrowedUsd"
                nameKey="collateralSymbol"
                innerRadius={62}
                outerRadius={90}
                strokeWidth={0}
              >
                {breakdown.map((b, i) => (
                  <Cell key={i} fill={COLORS[classify(b.collateralSymbol)]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-strong)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  borderRadius: "8px",
                  backdropFilter: "blur(20px)",
                }}
                formatter={(v) => (typeof v === "number" ? fmtUsd(v) : String(v))}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono text-[18px] font-light tracking-[-0.02em] text-[var(--color-text)]">
              {fmtUsd(totalBorrowed)}
            </div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
              Borrowed
            </div>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-2 py-2 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
            <div>Collateral</div>
            <div className="text-right">Borrowed</div>
            <div className="text-right">Share</div>
          </div>
          {breakdown.map((b, i) => {
            const bucket = classify(b.collateralSymbol)
            return (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-dashed border-[var(--color-border)] px-2 py-2 transition-colors hover:bg-[var(--color-bg-elev)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: COLORS[bucket] }}
                  />
                  <span className="text-[13px] text-[var(--color-text)]">
                    {b.collateralSymbol}
                  </span>
                  {bucket === "TIER_1" && <Tag tone="risk">Ethena</Tag>}
                  {bucket === "PT" && <Tag tone="warn">PT</Tag>}
                </div>
                <div className="text-right font-mono text-[13px] text-[var(--color-text)]">
                  {fmtUsd(b.borrowedUsd)}
                </div>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm"
                    style={{
                      width: `${Math.min(100, b.shareOfTotal * 100)}%`,
                      background: ROW_FILL[bucket],
                    }}
                    aria-hidden
                  />
                  <div className="relative px-2 py-0.5 text-right font-mono text-[13px] text-[var(--color-text)]">
                    {fmtPct(b.shareOfTotal)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

Note: the import of `./tag` is replaced with `@/components/ui/tag`. The old `components/tag.tsx` is now unused — it gets deleted in Batch 12 alongside the back-compat token cleanup.

- [ ] **Step 2: Run tests + build**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add components/recursion-panel.tsx
git commit -m "feat(design): recursion panel uses ui/Tag + SectionHead"
```

### Task 8.2: Restructure `solana-composition-panel.tsx` into vault cards

**Files:**
- Modify: `components/solana-composition-panel.tsx`

The spec mockup shows the Solana vaults (Kamino, Jupiter Lend) as a 2-column grid of glass cards, not table rows. This task does both the structural change and the token replacements.

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/solana-composition-panel.tsx`

Identify the array of vault rows currently rendered (typically `composition.rows` or similar) and the per-row fields displayed (vault name, recursion %, borrowed amount, utilization or HF or LTV).

- [ ] **Step 2: Apply token replacements (see the "Shared replacements" reference below)**

Walk the file once and apply every replacement listed in the **Shared token replacements** reference at the top of this document. This handles colors, Tag variants, headings, and font-mono.

- [ ] **Step 3: Replace row layout with vault-card grid**

Find the existing row-rendering JSX. Replace it with:

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  {composition.rows.map((row) => (
    <a
      key={row.address}
      href={`/vault/${row.chain}/${row.address}`}
      className="block rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 backdrop-blur-[16px] transition-all duration-[250ms] hover:-translate-y-[1px] hover:bg-[var(--color-bg-card-hover)] hover:border-[var(--color-border-strong)]"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-medium text-[var(--color-text)]">{row.name}</div>
        <div className="font-mono text-[14px] text-[var(--color-risk)]">
          {fmtPct(row.recursionShare)}
        </div>
      </div>
      <div className="mt-2 h-[6px] overflow-hidden rounded-sm bg-[color:rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-sm bg-[var(--color-risk)]"
          style={{
            width: `${Math.min(100, row.recursionShare * 100)}%`,
            boxShadow: "0 0 6px rgba(255,69,58,0.3)",
          }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--color-text-ghost)]">
        <span>{fmtUsd(row.borrowedUsd)} borrowed</span>
        <span>{row.healthFactor ? `HF ${row.healthFactor.toFixed(2)}` : `util ${fmtPct(row.utilization ?? 0)}`}</span>
      </div>
    </a>
  ))}
</div>
```

**Important**: the field names (`row.name`, `row.address`, `row.chain`, `row.recursionShare`, `row.borrowedUsd`, `row.healthFactor`, `row.utilization`) reflect the spec's intent — the actual field names in the current `composition.rows` may differ. **Read the file first**, then map the per-card values to whatever fields the existing row type actually uses. Do not invent fields; derive cleanly from what's already passed in. If a row doesn't have a recursion share, fall back to displaying `row.shareOfTotal` and rename the card label.

- [ ] **Step 4: Wrap with SectionHead at the top**

Replace any existing heading with:

```tsx
<SectionHead
  title="Recursive footprint · Solana core"
  subtitle="USDe collateral → USDG debt loops, isolated markets at ~100% utilization"
  status={<Tag tone="risk">{fmtUsd(totalRecursiveUsd)} · 100% recursive</Tag>}
/>
```

where `totalRecursiveUsd` is whatever total the component already computes (or sum at top).

- [ ] **Step 5: Run tests + build**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

- [ ] **Step 6: Visual check**

Run: `pnpm dev`. Open http://localhost:3000. Scroll to the Solana composition section. Verify two glass vault cards, hover-lift works, click navigates to drilldown. Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add components/solana-composition-panel.tsx
git commit -m "feat(design): solana composition becomes vault-card grid"
```

---

## Batch 9 — Generic table re-skin

Six table components share the same visual treatment. They all currently use `border border-[var(--color-border)]` rounded boxes, `text-[var(--color-accent)]` for headers, and per-row `border-b`. The new treatment is uniform: hairline-separated rows, dashed bottom borders, hover bg, mono numbers, no outer card.

### Task 9.1: Re-skin `footprint-table.tsx`

**Files:**
- Modify: `components/footprint-table.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/footprint-table.tsx`

- [ ] **Step 2: Apply Shared token replacements + Shared table re-skin procedure**

See the "Reference: Shared token replacements" and "Reference: Shared table re-skin procedure" sections at the top of this document. Apply both, in order, to this file.

- [ ] **Step 3: Run tests + build**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add components/footprint-table.tsx
git commit -m "feat(design): footprint table glass treatment"
```

### Task 9.2: Re-skin `token-balance-table.tsx`

**Files:**
- Modify: `components/token-balance-table.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/token-balance-table.tsx`

- [ ] **Step 2: Apply Shared token replacements + Shared table re-skin procedure**

See the two Reference sections at the top of this document. Apply both, in order.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/token-balance-table.tsx
git commit -m "feat(design): token balance table glass treatment"
```

### Task 9.3: Re-skin `monitored-wallets-table.tsx`

**Files:**
- Modify: `components/monitored-wallets-table.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/monitored-wallets-table.tsx`

- [ ] **Step 2: Apply Shared token replacements + Shared table re-skin procedure**

See the two Reference sections at the top of this document.

- [ ] **Step 3: Apply monitored-wallets-specific edits**

- Address cells (the `<td>` rendering the wallet address): use `font-mono text-[11px] text-[var(--color-text-dim)]`. Preserve whatever truncation helper already exists (first-4/last-4); do **not** introduce a new helper.
- "Source" column (or whichever column denotes disclosure status): replace with `<Tag tone="ok">disclosed</Tag>` when the existing boolean indicates the wallet is API/attestation-disclosed, and `<Tag tone="ghost">omnibus</Tag>` otherwise. The boolean source field is whatever the component currently uses to drive the existing visual signal.

- [ ] **Step 4: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/monitored-wallets-table.tsx
git commit -m "feat(design): monitored wallets table glass treatment"
```

### Task 9.4: Re-skin `depositors-table.tsx`

**Files:**
- Modify: `components/depositors-table.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/depositors-table.tsx`

- [ ] **Step 2: Apply Shared token replacements + Shared table re-skin procedure**

See the two Reference sections at the top of this document.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/depositors-table.tsx
git commit -m "feat(design): depositors table glass treatment"
```

### Task 9.5: Re-skin `borrowers-table.tsx`

**Files:**
- Modify: `components/borrowers-table.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/borrowers-table.tsx`

- [ ] **Step 2: Apply Shared token replacements + Shared table re-skin procedure**

See the two Reference sections at the top of this document.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/borrowers-table.tsx
git commit -m "feat(design): borrowers table glass treatment"
```

### Task 9.6: Re-skin `collateral-users-table.tsx`

**Files:**
- Modify: `components/collateral-users-table.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/collateral-users-table.tsx`

- [ ] **Step 2: Apply Shared token replacements + Shared table re-skin procedure**

See the two Reference sections at the top of this document.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/collateral-users-table.tsx
git commit -m "feat(design): collateral users table glass treatment"
```

### Task 9.7: Batch verification

- [ ] **Step 1: Visual sanity check on home page**

Run: `pnpm dev` and open http://localhost:3000. Scroll through every section. Verify:
- Tables read as continuous hairline-separated rows with dashed inner borders
- Hover lights up the row subtly
- No section has a stray hard border-box wrapper
- All numbers render in JetBrains Mono
Ctrl-C when done.

- [ ] **Step 2: Run full tests + build**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

---

## Batch 10 — Remaining panels

### Task 10.1: Re-skin `position-bar.tsx`

**Files:**
- Modify: `components/position-bar.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/position-bar.tsx`

- [ ] **Step 2: Apply Shared token replacements**

See the "Reference: Shared token replacements" section at the top of this document. Apply to this file. No structural changes.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/position-bar.tsx
git commit -m "feat(design): position bar adopts new tokens"
```

### Task 10.2: Re-skin `vault-allocation-panel.tsx`

**Files:**
- Modify: `components/vault-allocation-panel.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/vault-allocation-panel.tsx`

- [ ] **Step 2: Apply Shared token replacements**

See the "Reference: Shared token replacements" section at the top of this document. Apply to this file. No structural changes.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/vault-allocation-panel.tsx
git commit -m "feat(design): vault allocation panel adopts new tokens"
```

### Task 10.3: Re-skin `concentration-panel.tsx`

**Files:**
- Modify: `components/concentration-panel.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/concentration-panel.tsx`

- [ ] **Step 2: Apply Shared token replacements**

See the "Reference: Shared token replacements" section at the top of this document. Apply to this file. No structural changes.

- [ ] **Step 3: Build + tests + commit**

```bash
pnpm test && pnpm build 2>&1 | tail -10
git add components/concentration-panel.tsx
git commit -m "feat(design): concentration panel adopts new tokens"
```

### Task 10.4: Re-skin `chain-icon.tsx`

**Files:**
- Modify: `components/chain-icon.tsx`

- [ ] **Step 1: Read current file**

Run: `cat ~/Projects/ethena-flow-monitor/components/chain-icon.tsx`

- [ ] **Step 2: Adjust chain background colors**

The chain icon uses per-chain hardcoded hex colors. For the monochrome system, soften background opacity to ~0.15 and use chain accent colors for the foreground only. Keep the per-chain hue palette but apply it through `bg-[color:<hex>]/15` rather than full saturation.

- [ ] **Step 3: Run tests + build, commit**

```bash
git add components/chain-icon.tsx
git commit -m "feat(design): chain icon softened for monochrome system"
```

---

## Batch 11 — Drilldown pages

### Task 11.1: Restyle `app/vault/[chain]/[address]/page.tsx`

**Files:**
- Modify: `app/vault/[chain]/[address]/page.tsx`

- [ ] **Step 1: Read current page**

Run: `cat ~/Projects/ethena-flow-monitor/app/vault/[chain]/[address]/page.tsx`

- [ ] **Step 2: Apply changes**

- The page-level `<h1>` becomes the hero section using the same pattern as `app/page.tsx`: vault name on the left (large, font-light tracking-tight), and if the vault has a utilization/recursion ratio, render `<HeroMeter label="Utilization" ratio={utilization} rightCaption={...} threshold={0.95} />` on the right.
- Wrap section headings with `<SectionHead title=... subtitle=... />`.
- Token replacements from Task 10.1 step 2.
- No data/computation changes.

- [ ] **Step 3: Run tests + build**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Visual check on a known vault**

Run: `pnpm dev`. Open http://localhost:3000 — click into the Kamino or Jupiter vault row. Verify the drilldown matches the new system.

- [ ] **Step 5: Commit**

```bash
git add 'app/vault/[chain]/[address]/page.tsx'
git commit -m "feat(design): vault drilldown adopts new design system"
```

### Task 11.2: Restyle `app/reserve/[chain]/[asset]/page.tsx`

**Files:**
- Modify: `app/reserve/[chain]/[asset]/page.tsx`

- [ ] **Step 1: Read current page**

Run: `cat ~/Projects/ethena-flow-monitor/app/reserve/[chain]/[asset]/page.tsx`

- [ ] **Step 2: Apply changes**

- The page-level `<h1>` becomes a hero section: reserve symbol + market name on the left (large, `font-light tracking-tight font-mono` for the symbol, `text-[var(--color-text-ghost)]` for the market name).
- When the reserve has a utilization ratio, render `<HeroMeter label="Utilization" ratio={utilizationRate} rightCaption={...} threshold={0.95} />` on the right of the hero (use the same 1.5fr/1fr grid as `app/page.tsx`).
- Wrap section headings with `<SectionHead title=... subtitle=... />` (import from `@/components/ui/section-head`).
- Apply the "Reference: Shared token replacements" at the top of this document.
- No data/computation changes.

- [ ] **Step 3: Build + tests**

Run: `pnpm test && pnpm build 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add 'app/reserve/[chain]/[asset]/page.tsx'
git commit -m "feat(design): reserve drilldown adopts new design system"
```

### Task 11.3: Restyle reserve-tabs and loading skeletons

**Files:**
- Modify: `components/reserve-tabs.tsx`
- Modify: `app/loading.tsx`
- Modify: `app/vault/[chain]/[address]/loading.tsx`
- Modify: `app/reserve/[chain]/[asset]/loading.tsx`

- [ ] **Step 1: Read each file**

Run: `cat ~/Projects/ethena-flow-monitor/components/reserve-tabs.tsx ~/Projects/ethena-flow-monitor/app/loading.tsx`

- [ ] **Step 2: Restyle reserve-tabs**

- Active tab indicator: bottom border `border-b-2 border-[var(--color-text)]` instead of accent yellow
- Inactive tab: `text-[var(--color-text-ghost)]`, hover → `text-[var(--color-text)]`
- Tab container: `border-b border-[var(--color-border)]`

- [ ] **Step 3: Restyle loading skeletons**

Skeletons should match the new surface tones: `bg-[color:rgba(255,255,255,0.04)]` shimmer, `rounded-[12px]`. Replace any hard `bg-[var(--color-bg-card)]` with the new tone.

- [ ] **Step 4: Build + tests + commit**

```bash
git add components/reserve-tabs.tsx app/loading.tsx 'app/vault/[chain]/[address]/loading.tsx' 'app/reserve/[chain]/[asset]/loading.tsx'
git commit -m "feat(design): reserve tabs + loading skeletons adopt new system"
```

---

## Batch 12 — Polish, cleanup, verification

### Task 12.1: Delete unused `components/tag.tsx` shim

**Files:**
- Delete: `components/tag.tsx`

- [ ] **Step 1: Verify no remaining references**

Run: `cd ~/Projects/ethena-flow-monitor && grep -rn "from \"./tag\"\|from \"@/components/tag\"" components app 2>/dev/null`
Expected: no matches.

- [ ] **Step 2: Delete**

Run: `rm ~/Projects/ethena-flow-monitor/components/tag.tsx`

- [ ] **Step 3: Build + tests**

Run: `pnpm build && pnpm test 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A components/tag.tsx
git commit -m "refactor(design): remove legacy Tag, superseded by ui/Tag"
```

### Task 12.2: Remove back-compat token aliases

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Verify no consumer references the back-compat tokens**

Run: `cd ~/Projects/ethena-flow-monitor && grep -rn 'color-accent\|color-success\|color-recursion\|color-pt-tag\|color-chart-fill\|color-chart-blue' app components 2>/dev/null`
Expected: no matches. If matches exist, replace each before continuing:
- `--color-accent` → `--color-text-ghost`
- `--color-success` → `--color-ok`
- `--color-recursion` → `--color-risk`
- `--color-pt-tag` → `--color-warn`
- `--color-chart-fill` → literal `rgba(255,255,255,0.45)`
- `--color-chart-blue` → literal `rgba(255,255,255,0.25)`

- [ ] **Step 2: Remove the back-compat block from `app/globals.css`**

Delete the block labeled `/* Back-compat aliases ... */` and the 6 lines following it.

- [ ] **Step 3: Build + tests**

Run: `pnpm build && pnpm test 2>&1 | tail -10`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "refactor(design): remove back-compat token aliases"
```

### Task 12.3: Accessibility + reduced-motion verification

- [ ] **Step 1: Run Lighthouse against running dev server**

Run: `pnpm dev` (in one shell), then in another: `npx -y lighthouse http://localhost:3000 --only-categories=accessibility --quiet --chrome-flags="--headless"`
Expected: accessibility score ≥ 95. Ctrl-C the dev server when done.

If the score drops below 95, the most likely culprits are contrast (light-on-dark-on-glass surfaces) — bump `--color-text-ghost` from `0.35` to `0.45` opacity if so.

- [ ] **Step 2: Manually verify `prefers-reduced-motion`**

In macOS System Settings → Accessibility → Display → enable "Reduce motion". Reload http://localhost:3000.
Expected: no rise-in animations, no meter pulse, no transitions; everything renders instantly. Disable the setting again.

- [ ] **Step 3: No commit needed unless a fix was applied** — if you bumped `--color-text-ghost`, commit as:

```bash
git add app/globals.css
git commit -m "fix(design): raise text-ghost contrast for a11y"
```

### Task 12.4: Final verification + summary

- [ ] **Step 1: Full clean build**

Run: `cd ~/Projects/ethena-flow-monitor && rm -rf .next && pnpm build 2>&1 | tail -30`
Expected: clean build, no warnings except the usual Next.js info logs.

- [ ] **Step 2: Full test suite**

Run: `pnpm test 2>&1 | tail -10`
Expected: 165 original tests + new component tests (5–15 added), all green.

- [ ] **Step 3: Diff summary**

Run: `git log --oneline main..HEAD`
Expected: ~25 commits covering tokens → primitives → header → hero → reconciliation → recursion → tables → drilldowns → cleanup.

- [ ] **Step 4: Final push prep**

Plan is complete when the dev server matches the assembled mockup in `.superpowers/brainstorm/.../content/full-design.html`. No additional commit needed; the branch is ready for review and merge.

---

## Plan summary

- **12 batches** producing **~25 commits**, each leaving the app green
- **6 new shared primitives** (`components/ui/*`) each with focused tests
- **~21 component edits** mostly mechanical token replacements + Tag API conversion
- **Zero data-layer or routing changes** — pure cosmetic refactor
- **Risk surface**: backdrop-filter performance (mitigated by limiting scope) and Lighthouse contrast (with prepared fallback)

Total estimated effort: 4–6 hours of focused work for a developer fresh to the codebase.
