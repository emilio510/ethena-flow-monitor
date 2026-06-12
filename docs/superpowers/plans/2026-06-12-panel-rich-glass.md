# Panel Rich-Glass Implementation Plan

> **For agentic workers:** Visual work. Verification per task is a real-browser screenshot / FPS measurement via chrome-devtools MCP at 2x DPR, not a unit test. Execute inline with the dev server running. Implements section 5c of `docs/superpowers/specs/2026-06-12-ethena-refractive-glass-design.md`.

**Goal:** Close the visual gap between the in-flow panels and the hero, giving the panels the hero's "Aave flavor" without the perf cost of refracting large surfaces.

**Architecture:** Approach A (recommended, default) enriches the `.glass` CSS utility with the hero's dichroic hue wash + rich multi-layer specular, cascading to every `GlassCard` for ~free. Approach B (optional, gated on a Gate-1 decision and an FPS check) adds true displacement to the single bounded Footprint panel via a `refractive` opt-in on `GlassCard`; FlowsTable (5.52 Mpx) is excluded regardless.

**Tech Stack:** Next 16, React 19, Tailwind v4, CSS custom properties, `color-mix()`.

---

### Task 1: Enrich `.glass` with dichroic wash + rich specular (Approach A)

**Files:**
- Modify: `app/globals.css` (the `.glass` rule)

- [ ] **Step 1: Replace the `.glass` rule**

```css
.glass {
  --glass-line: var(--color-accent-line);
  --glass-soft: var(--color-accent-soft);
  --glass-glow: var(--color-accent-glow);
  /* Dichroic hue wash: the glass colour shifts diagonally across the surface,
     tone-aware via --glass-glow (cyan default, red/green under .tone-*). */
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--glass-line) 70%, transparent) 0%,
      transparent 42%,
      transparent 64%,
      rgba(255, 207, 138, 0.05) 100%
    ),
    var(--color-bg-card);
  border: 1px solid var(--glass-line);
  border-radius: 12px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.20),                                   /* bright top sheen */
    inset 0 0 0 1px color-mix(in srgb, var(--glass-glow) 90%, transparent),    /* rim */
    inset 0 0 22px color-mix(in srgb, var(--glass-glow) 45%, transparent),     /* inner glow */
    0 0 30px var(--glass-glow),                                                 /* outer glow */
    0 12px 40px rgba(0, 0, 0, 0.4);                                            /* depth */
}
```

- [ ] **Step 2: Verify in browser, top + scrolled**

Reload `?glass=refractive` at 2x DPR, screenshot top and a data section. Expected: panels now show the diagonal dichroic wash + brighter rim/glow, visibly closer to the hero. The red risk hero should still read as the strongest/distinct surface (it also has refraction + chroma). Confirm tables stay legible.

- [ ] **Step 3: Tune the wash/specular alphas if needed** (in `.glass` only), re-screenshot. Keep panels a notch below the hero so the hero still leads.

- [ ] **Step 4: tsc + build**

Run `npx tsc --noEmit && npm run build`. Expected: both green. (CSS-only; low risk, but `color-mix` + the build must pass.)

---

### Task 2: GATE — decide on Approach B

- [ ] **Step 1:** Look at the Task 1 result with the user. If the enriched CSS closed the gap to their satisfaction, **STOP here** (Approach A only). If they still want literal light-bending on a panel, proceed to Task 3.

---

### Task 3: True displacement on the Footprint panel (Approach B, only if chosen)

**Files:**
- Modify: `components/ui/glass-card.tsx`
- Modify: `app/page.tsx` (Footprint wrapper only)

- [ ] **Step 1: Add a `refractive` opt-in to `GlassCard`**

```tsx
import type { HTMLAttributes } from "react"
import { RefractiveGlass } from "@/components/ui/refractive-glass"

export function GlassCard({
  className = "",
  children,
  refractive = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { refractive?: boolean }) {
  if (refractive) {
    return (
      <RefractiveGlass className={className} {...rest}>
        {children}
      </RefractiveGlass>
    )
  }
  return (
    <div className={`glass ${className}`} {...rest}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Turn it on for the Footprint panel only** (`app/page.tsx`)

Change the Footprint wrapper from `<GlassCard className="p-5">` to `<GlassCard refractive className="p-5">`. Leave every other panel (especially FlowsTable) as-is.

- [ ] **Step 3: FPS measurement (the gate)**

Reload, run the rAF frame-timing scroll loop (same method as the header check: drive a 3s down-and-up scroll, record frame deltas). Expected to keep: avg > 55 FPS, 0 frames over 32ms. If it janks, revert Step 2 (Footprint goes back to glow-only) and record the outcome in the spec.

- [ ] **Step 4: tsc + build**

Run `npx tsc --noEmit && npm run build`. Expected: both green.

---

### Task 4: Final + hold for sign-off

- [ ] **Step 1:** `npx tsc --noEmit && npm run build` green.
- [ ] **Step 2:** Full-page screenshot for the user.
- [ ] **Step 3:** Do NOT commit. Report and wait for sign-off.

---

## Out of scope
- Refraction on FlowsTable or any panel > ~1.5 Mpx (perf; stays glow-only).
- incentive-engine port (separate front-gate cycle).

## Notes
- Approach A is tone-aware for free: the wash and glow use `--glass-glow`, which `.tone-risk`/`.tone-ok` already override.
- The recommendation is A-only; B is there if the user explicitly wants literal refraction on the Footprint panel after seeing A.
