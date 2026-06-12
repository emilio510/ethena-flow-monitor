# Refractive Header Implementation Plan

> **For agentic workers:** Visual work. Verification per task is a real-browser screenshot / performance trace via chrome-devtools MCP at 2x DPR, not a unit test. Execute inline in a session with the dev server running. Implements section 5b of `docs/superpowers/specs/2026-06-12-ethena-refractive-glass-design.md`.

**Goal:** Make the sticky header a real Aave-style refractive glass bar, so the tables lens and bend as they scroll underneath it.

**Architecture:** Add a `bare` mode to the existing `RefractiveGlass` (no card frame; the glass IS the bar background). Convert `header.tsx` to a client component that drops its opaque background and wraps its content in `RefractiveGlass bare`. Keep refraction reserved to hero + header. Validate scroll performance; fall back to plain blur if it janks.

**Tech Stack:** Next 16, React 19, Tailwind v4, SVG `feDisplacementMap`, `backdrop-filter: url()`.

---

### Task 1: Add `bare` mode to `RefractiveGlass`

**Files:**
- Modify: `components/ui/refractive-glass.tsx`

- [ ] **Step 1: Add the prop to the type**

In `RefractiveGlassProps`, add:

```ts
  /** Bare mode: no card frame (border/radius/drop-shadow). For full-width bars like the header. */
  bare?: boolean
```

- [ ] **Step 2: Destructure it** (default `false`) alongside the other props:

```ts
  bare = false,
```

- [ ] **Step 3: Make the inactive fallback bare-aware**

Replace the inactive return block:

```tsx
  if (!wantRefractive) {
    if (bare) {
      return (
        <div
          className={className}
          style={{
            background: frameBackground,
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
          }}
          {...rest}
        >
          {children}
        </div>
      )
    }
    return (
      <div className={`glass ${className}`} {...rest}>
        {children}
      </div>
    )
  }
```

- [ ] **Step 4: Drop the frame chrome when bare**

In `frameStyle`:

```ts
    borderRadius: bare ? 0 : radius,
    border: bare ? "none" : frameBorder,
    boxShadow: bare ? "none" : frameShadow,
```

In `overlayBase`:

```ts
    borderRadius: bare ? 0 : radius,
```

- [ ] **Step 5: Lighter specular when bare**

Replace `specularStyle` construction so bare uses a subtle top sheen + a single accent hairline at the bottom (where the bar meets the page), instead of a full card rim:

```ts
  const a = accentStrength
  const specularStyle: CSSProperties = bare
    ? {
        ...overlayBase,
        backgroundImage: `linear-gradient(180deg, rgba(255,255,255,${0.05 * glow}) 0%, rgba(255,255,255,0) 55%)`,
        boxShadow: `inset 0 -1px 0 ${hexToRgba(accent, 0.18 * a)}`,
      }
    : {
        ...overlayBase,
        backgroundImage: [
          `linear-gradient(180deg, rgba(255,255,255,${0.14 * glow}) 0%, rgba(255,255,255,0) 30%)`,
          `linear-gradient(160deg, ${hexToRgba(accent, 0.22 * a)} 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 62%, ${hexToRgba(
            DICHROIC_COUNTER,
            0.12 * a,
          )} 100%)`,
        ].join(", "),
        boxShadow: [
          `inset 0 1px 0 rgba(255,255,255,${0.6 * glow})`,
          `inset 0 0 0 1px ${hexToRgba(accent, 0.5 * a)}`,
          `inset 0 0 18px ${hexToRgba(accent, 0.16 * a)}`,
          `0 0 30px ${hexToRgba(accent, 0.28 * a)}`,
        ].join(", "),
      }
```

- [ ] **Step 6: Verify**

Run `npx tsc --noEmit`. Expected: exit 0. No visual change yet (no consumer uses `bare`).

---

### Task 2: Convert the header to refractive glass

**Files:**
- Modify: `components/header.tsx`

- [ ] **Step 1: Rewrite header to use `RefractiveGlass bare`**

Add `"use client"` at the top. Drop the opaque `bg-[color:rgba(10,10,12,0.6)]` and `backdrop-blur-[20px]` from `<header>` (the refraction layer provides blur now). Wrap the bar content:

```tsx
"use client"

import Link from "next/link"
import { DataAge } from "./data-age"
import { ETHENA_WALLETS } from "@/config/wallets"
import { RefractiveGlass } from "@/components/ui/refractive-glass"

export function Header({
  renderedAt,
  failedWallets,
}: {
  renderedAt?: number
  failedWallets?: string[]
}) {
  const hasFailures = failedWallets && failedWallets.length > 0
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)]">
      <RefractiveGlass bare radius={0} blur={16} depth={14} frameBackground="rgba(10, 10, 12, 0.35)">
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
      </RefractiveGlass>
    </header>
  )
}
```

Note: the non-flag default header tint goes from `0.6` to `0.35` (slightly more transparent). Acceptable; flag the diff to the user.

- [ ] **Step 2: Verify in browser**

Reload `?glass=refractive` at 2x DPR. Scroll the page so tables pass under the header. Screenshot. Expected: the header blurs AND lenses/bends the table rows scrolling under it; header text stays legible; bottom hairline reads cyan.

- [ ] **Step 3: tsc + build**

Run `npx tsc --noEmit && npm run build`. Expected: both green.

---

### Task 3: Performance trace on scroll (the gating check)

**Files:** none (measurement only)

- [ ] **Step 1: Record a scroll trace**

Use chrome-devtools `performance_start_trace` (reload+autostop), scroll the page top-to-bottom, `performance_stop_trace`. Inspect for long frames / dropped FPS while the header refracts moving content.

- [ ] **Step 2: Decide**

If scrolling holds ~60fps (no sustained long frames): keep it. If it janks: in `header.tsx` remove the `RefractiveGlass` displacement and keep a plain blurred bar (set the header back to `backdrop-blur` only), per the spec fallback. Record the outcome in the spec.

---

### Task 4: Final check + hold for sign-off

- [ ] **Step 1:** `npx tsc --noEmit && npm run build` green.
- [ ] **Step 2:** Full-page screenshot top + scrolled, for the user to judge.
- [ ] **Step 3:** Do NOT commit. Report and wait for the user's sign-off (commit-only-when-asked).

---

## Out of scope
- Refraction on in-flow panels (perf; stays glow-only).
- incentive-engine port (separate plan).

## Notes
- `header.tsx` becoming a client component is safe: it only renders `next/link` + `DataAge` and takes serializable props.
- Risk owner: Task 3 is the gate. A full-width sticky refraction over fast scroll is the heaviest case in the design.
