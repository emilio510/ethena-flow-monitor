# Ethena Flow Monitor — Monochrome Glass Redesign

**Date:** 2026-05-25
**Status:** Approved design, ready for implementation plan
**Scope:** Pure cosmetic refactor — no data-layer or business-logic changes

## Summary

Replace the current Bloomberg-terminal aesthetic (dark navy, yellow accent, all-JetBrains-Mono) with a monochrome liquid-glass treatment. Same information density, same data shape, same component count — different visual personality.

The redesign keeps the dashboard's purpose front-and-center: surfacing how much of Ethena's collateral is levered in recursive DeFi loops. The new hero gives the recursion ratio co-headline treatment with a meter that pulses subtly when exposure exceeds threshold.

## Goals

1. Look unmistakably premium — Apple/Vercel/Linear-grade polish rather than terminal-style
2. Preserve every existing data point and table — this is not a feature redesign
3. Surface the *point* of the tool (recursive exposure %) in the hero, not buried in row 4
4. Make motion carry information — animate on load, on data threshold crossings, on hover; static at rest
5. Respect `prefers-reduced-motion`

## Non-goals

- Data layer changes (`lib/`, `config/`, fetching, snapshot path)
- Adding/removing data points
- Routing changes (drilldown URLs stay)
- Building new features (recursion alerts, history, etc.)

## Design system

### Tokens (replace contents of `app/globals.css` `@theme` block)

```css
@theme {
  /* Surfaces */
  --color-bg: #0a0a0c;                          /* near-black canvas */
  --color-bg-elev: rgba(255,255,255,0.03);      /* table rows, tiles */
  --color-bg-card: rgba(255,255,255,0.04);      /* glass surfaces */
  --color-bg-card-hover: rgba(255,255,255,0.06);

  /* Borders */
  --color-border: rgba(255,255,255,0.08);       /* default hairline */
  --color-border-strong: rgba(255,255,255,0.14); /* glass cards */

  /* Text — three tiers */
  --color-text: #f5f5f7;                        /* primary */
  --color-text-dim: rgba(255,255,255,0.6);      /* secondary */
  --color-text-ghost: rgba(255,255,255,0.35);   /* labels, captions */

  /* Semantic — color reserved for signals only */
  --color-risk: #ff453a;
  --color-risk-soft: rgba(255,69,58,0.12);
  --color-ok: #30d158;
  --color-ok-soft: rgba(48,209,88,0.10);
  --color-warn: #ff9f0a;
  --color-warn-soft: rgba(255,159,10,0.10);

  /* Fonts */
  --font-sans: "Inter", -apple-system, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 200ms;
  --dur-rise: 500ms;
  --dur-meter: 900ms;
}
```

The yellow accent (`#f5cc4c`) and warm cream text (`#d9d3c0`) tokens are removed entirely. Tag/section labels that used `text-[var(--color-accent)]` move to `text-[var(--color-text-ghost)]` with the `font-sans` uppercase treatment.

### Typography pairing

- **Inter** — labels, section titles, copy, table headers, tags
- **JetBrains Mono** — every number, address, balance, percentage, delta
- Numbers always use `font-variant-numeric: tabular-nums slashed-zero`
- Labels: `font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em`
- Hero numbers: `font-weight: 300; letter-spacing: -0.03em` for an optical-sized feel

Load Inter via `next/font/google` in `app/layout.tsx` alongside JetBrains Mono.

### Glass surface recipe

Standard glass card:

```css
.glass {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 40px rgba(0,0,0,0.4);
}
```

The inset highlight on the top edge is what makes liquid-glass read as a layered material rather than a colored panel.

### Background glows

The page body gets two fixed-position blurred circles ("orbs") behind everything:

- One large white-vibrancy orb top-left (`opacity: 0.05; filter: blur(80px)`) — gives the page a subtle gradient floor
- One red-tinted orb behind the hero meter (`opacity: 0.2; filter: blur(80px)`) — semantic anchor, color radiates from "the risk number"

Orbs are static (no drift) — that was the M3 expressive option we rejected.

### Motion

| Trigger | Animation | Duration | Easing |
|---|---|---|---|
| Page load — hero number, hero meter value | `rise` (8px translate + fade) | 700ms | `--ease-out` |
| Page load — KPI tiles | `rise`, staggered 80ms each | 500ms | `--ease-out` |
| Page load — meter bar | `width: 0 → actual%` | 900ms | `--ease-out` |
| Recursion meter at rest, `% > threshold` | `riskPulse` (text-shadow oscillation) + `glowPulse` (box-shadow) | 3s | `ease-in-out` infinite |
| Hover on vault card | `translateY(-1px)` + brighten | 250ms | ease |
| Hover on table row | bg → `--color-bg-elev` | 200ms | ease |

Threshold for the meter pulse: recursive exposure > 20%. Below that, the meter is static red. (This is configurable in a single constant.)

All animations wrap in `@media (prefers-reduced-motion: reduce) { animation: none !important; transition: none !important; }`.

## Layout changes

### Header (`components/header.tsx`)

Before: stacked banner + title + DataAge pill, hairline-bordered.

After: single glass nav bar with `backdrop-filter: blur(20px)`, brand on left, live status pill on right. The current "Partial data" failure banner stays but uses `--color-risk-soft` instead of the inline rgba.

### Hero (replaces top of `app/page.tsx`)

Replaces the current `<h1>` + 6-tile `KpiStrip`. New structure:

```
┌─────────────────────────────────────────────────┐
│  TOTAL BACKING               RECURSIVE EXPOSURE │
│  $6,418,442,107             ┌────────────────┐  │
│  ✓ +0.1% vs Ethena          │ 20.4%   $1.31B │  │
│                             │ ▓▓░░░░░░░░░░░░ │  │
│                             └────────────────┘  │
└─────────────────────────────────────────────────┘
┌─────────┬─────────┬─────────┬───────────────┐
│Custodial│Deployed │ Idle    │ Reserve fund   │
│ $2.10B  │ $3.00B  │ $1.30B  │  $42M          │
└─────────┴─────────┴─────────┴───────────────┘
```

- Hero grid: `1.5fr 1fr` two-column. Total backing left, recursion meter card (glass) right.
- The Ethena-vs-on-chain delta moves from a tiny subValue into a colored pill below the total ("✓ +0.1% vs Ethena reported" — green pill when within 2%, amber when out).
- Strip below shrinks to **4 tiles** (Custodial, Deployed, Idle, Reserve fund). Recursive moves into the hero meter and is no longer a strip tile.

### Section structure

Replace bare `<h1 className="...uppercase...">` headings with a new `<SectionHead>` primitive:

```tsx
<SectionHead
  title="Per-asset reconciliation"
  subtitle="Ethena reported vs on-chain verified · gap ~$210M unverified"
  status={<Tag tone="ghost">9 assets</Tag>}
/>
```

Sections are separated by hairline top borders (`border-t border-[var(--color-border)]`) rather than card containers — the page reads as one continuous scrolling document with embedded glass elements.

### Tables (`*-table.tsx`)

Generic table treatment for all five table components:

- Header row: `border-b border-[var(--color-border)]`, `font-sans uppercase` labels in `--color-text-ghost`
- Body rows: `border-b border-dashed border-[var(--color-border)]`, hover bg `--color-bg-elev`
- Numeric cells: `font-mono tabular-nums`, right-aligned
- Asset name cell: new `<AssetIcon symbol="USDe" />` 22×22 circle on the left

### Reconciliation panel (`reconciliation-panel.tsx`)

Add a **coverage bar** column between "On-chain" and "Δ" — visual encoding of (on-chain / reported). Green fill when within 5%, red when below. This lets users scan for under-reconciled assets without reading the delta column.

Status column uses `<Tag>` primitive:
- `ok` (green) when coverage ≥ 95%
- `warn` (amber) when 80% ≤ coverage < 95%
- `risk` (red) when coverage < 80%

### Recursion panel (`recursion-panel.tsx`) + Solana composition

Convert the current row-based layout into **vault cards** in a 2-column grid:

```
┌──────────────────────────┐  ┌──────────────────────────┐
│ Kamino · Prime kvault    │  │ Jupiter Lend · Bitwise×E │
│                    100%  │  │                    100%  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ $251.0M USDG    util 99% │  │ $250.4M USDG  HF 1.02    │
└──────────────────────────┘  └──────────────────────────┘
```

Each card is a glass surface, hover-lifts on entry, links to the existing drilldown route.

### Monitored wallets table

Compact glass table. Address cells: monospace, dimmed, with first-4/last-4 truncation. Disclosure source uses the same `<Tag>` system (`ok`=disclosed, `ghost`=omnibus).

### Drilldown pages (`app/vault/[chain]/[address]/page.tsx`, `app/reserve/[chain]/[asset]/page.tsx`)

Inherit the new design system automatically through globals + shared primitives. Specific changes:

- Vault page hero gets the same split treatment (vault TVL on left, utilization/recursion meter on right)
- Position bar, composition panels, vault allocation panels all use the same glass + tag + coverage-bar vocabulary

## New shared primitives

Add under `components/ui/`:

- `<SectionHead title subtitle status?>` — used on every section
- `<Tag tone="ok" | "risk" | "warn" | "ghost">` — replaces existing `tag.tsx`
- `<AssetIcon symbol>` — circular badge with first-letter fallback (extend later with real logos)
- `<CoverageBar value reported>` — used in reconciliation
- `<HeroMeter label value totalLabel barFill threshold>` — used in hero + drilldowns
- `<GlassCard>` — wraps the glass recipe for reuse

Each lives in its own file (per coding-style.md "many small files" rule).

## Files touched

| File | Change |
|---|---|
| `app/globals.css` | Full token rewrite |
| `app/layout.tsx` | Add Inter font, page-level glow backdrop |
| `app/page.tsx` | Restructure into hero + 4-tile strip + sections |
| `components/header.tsx` | Glass nav + live pill |
| `components/kpi-card.tsx` | Repurpose as tile variant; new `HeroNumber` extracted |
| `components/kpi-strip.tsx` | Becomes 4-col grid only |
| `components/tag.tsx` | Delete — superseded by `components/ui/tag.tsx` |
| `components/reconciliation-panel.tsx` | Add coverage bar, asset icons, tag column |
| `components/recursion-panel.tsx` | Card-grid layout |
| `components/solana-composition-panel.tsx` | Card-grid layout |
| `components/monitored-wallets-table.tsx` | Glass table styling |
| `components/footprint-table.tsx` | Glass table styling |
| `components/token-balance-table.tsx` | Glass table styling |
| `components/depositors-table.tsx`, `borrowers-table.tsx`, `collateral-users-table.tsx` | Glass table styling |
| `components/position-bar.tsx` | Re-style to glass + new color tokens |
| `components/vault-allocation-panel.tsx` | Re-style to new card vocabulary |
| `components/concentration-panel.tsx` | Re-style |
| `components/data-age.tsx` | Re-style to glass pill |
| `components/chain-icon.tsx` | Adapt colors to new palette |
| `components/ui/section-head.tsx` | NEW |
| `components/ui/tag.tsx` | NEW (replaces top-level `tag.tsx`) |
| `components/ui/asset-icon.tsx` | NEW |
| `components/ui/coverage-bar.tsx` | NEW |
| `components/ui/hero-meter.tsx` | NEW |
| `components/ui/glass-card.tsx` | NEW |
| `app/vault/[chain]/[address]/page.tsx` | Restructure to use new primitives |
| `app/reserve/[chain]/[asset]/page.tsx` | Restructure to use new primitives |

## Acceptance criteria

1. Page renders identical data — no numbers move, no tables disappear
2. All existing tests pass (vitest run shows green)
3. Hero recursion meter shows live recursion %, with bar fill = `recursiveUsd / backingBase`
4. Meter pulses when `recursionShare > 0.20`; static otherwise
5. Page respects `prefers-reduced-motion` (manually verified by toggling OS setting)
6. Build passes (`pnpm build`) with no new console warnings
7. Drilldown pages (vault, reserve) inherit the new design without ad-hoc styling
8. Lighthouse accessibility score ≥ 95 on `/` (current baseline is the regression check)

## Out of scope (deliberately deferred)

- Real token logos in `<AssetIcon>` — first-letter fallback for v1, swap in SVGs later
- Recursion threshold customization (hardcoded 20% for now)
- Mobile layout polish beyond what the existing breakpoints provide
- Animating between drilldown pages (View Transitions API) — could come later
- Replacing recharts with a custom chart layer

## Risks

1. **Backdrop-filter performance**: lots of `blur(20px)` surfaces on the same page can chug on lower-end laptops. Mitigation: only the meter card + nav + vault cards use it. Tables use solid `--color-bg-elev`.
2. **Inter font CSS load**: `next/font/google` will add bytes. Acceptable cost — preload critical subsets.
3. **Tag/CoverageBar test coverage**: new primitives need component tests. Build out alongside.
