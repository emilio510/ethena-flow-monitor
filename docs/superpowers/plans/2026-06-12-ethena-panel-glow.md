# Ethena Panel Glow Implementation Plan

> **For agentic workers:** This is visual frontend work. The verification step for each task is a real-browser screenshot via the chrome-devtools MCP at 2x DPR, NOT a unit test (vitest here covers logic only). Execute inline in a session that has the dev server running and browser tooling, since subagents cannot screenshot-verify.

**Goal:** Give every content panel the hero's cyan dichroic glow, and turn the currently-naked data tables into glowing glass cards, while keeping the expensive refraction on the hero only.

**Architecture:** One source of truth for the glow lives in the `.glass` utility (`app/globals.css`). Upgrading it cascades to every `GlassCard`. Naked table sections are wrapped in `GlassCard` at the `app/page.tsx` level (least invasive, no per-table-component edits). KPI tiles get a lighter glow variant. Refraction stays hero-only.

**Tech Stack:** Next 16, React 19, Tailwind v4, CSS custom properties. Accent token `--color-accent` (`#5AC8FA`) already defined.

---

### Task 1: Upgrade `.glass` to the full hero glow

**Files:**
- Modify: `app/globals.css` (the `.glass` rule)

- [ ] **Step 1: Replace the `.glass` box-shadow stack with the hero-glow treatment**

```css
.glass {
  background: var(--color-bg-card);
  border: 1px solid var(--color-accent-line);
  border-radius: 12px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.10),          /* white specular top sheen */
    inset 0 0 0 1px var(--color-accent-soft),           /* cyan inner rim */
    inset 0 0 22px rgba(90, 200, 250, 0.05),            /* faint inner cyan haze */
    0 0 28px var(--color-accent-glow),                  /* soft outer cyan glow */
    0 12px 40px rgba(0, 0, 0, 0.4);                     /* existing depth shadow */
}
```

- [ ] **Step 2: Verify in browser**

Reload `http://localhost:3000/?glass=refractive` at 2x DPR, screenshot. Expected: the existing GlassCard panels (`flows-table`, `concentration-panel`, `vault-allocation-panel`) and the page container now show a cyan rim + soft glow. Hero still strongest (it has refraction + its own stronger overlay).

- [ ] **Step 3: tsc + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/globals.css && git commit -m "feat(glass): upgrade base glass utility to cyan dichroic glow"
```

---

### Task 2: Wrap the naked data tables in glass cards

These render as bare rows on the page background today. Wrapping them at the page level turns each into a glowing panel without touching the table components.

**Files:**
- Modify: `app/page.tsx` (the `<section className="px-6 pb-6">` data block, lines ~147-181)

- [ ] **Step 1: Wrap each naked section in `GlassCard`**

`FootprintTable`, both `TokenBalanceTable`s, `ReconciliationPanel`, and `MonitoredWalletsTable` are currently inside bare `<div className="mt-N">` wrappers. Wrap each component in `<GlassCard className="p-5">`. Do NOT wrap `FlowsTable` (it already renders its own `GlassCard`). Import `GlassCard` at the top of `page.tsx`.

Example for the footprint section:

```tsx
<div className="mt-6">
  <GlassCard className="p-5">
    <FootprintTable rows={rows} />
  </GlassCard>
</div>
```

Apply the same wrap to: the Idle `TokenBalanceTable`, the Reserve-fund `TokenBalanceTable`, the `ReconciliationPanel`, and `MonitoredWalletsTable`.

- [ ] **Step 2: Verify in browser**

Reload + full-page screenshot (scroll through). Expected: every data section is now a discrete glowing glass card. Check padding/title spacing reads correctly inside the card; if a table's own title sits oddly, note it for Task 4 tuning. Confirm no double-card on `FlowsTable`.

- [ ] **Step 3: tsc + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/page.tsx && git commit -m "feat(home): wrap data tables in glass panels"
```

---

### Task 3: Give the KPI tiles a lighter glow

The 4 KPI tiles (`kpi-card`) are flat `bg-elev`. Full hero glow on 4 small tiles would be busy, so they get a restrained variant: cyan border + faint glow, no inner haze.

**Files:**
- Modify: `app/globals.css` (add a `.glass-tile` utility)
- Modify: `components/kpi-card.tsx:21` (swap the flat root for `.glass-tile`)

- [ ] **Step 1: Add the `.glass-tile` utility to `globals.css`**

```css
.glass-tile {
  background: var(--color-bg-card);
  border: 1px solid var(--color-accent-line);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 16px rgba(90, 200, 250, 0.07);
}
```

- [ ] **Step 2: Apply it in `kpi-card.tsx`**

Change the root div from `className="bg-[var(--color-bg-elev)] px-4 py-3 efm-rise"` to `className="glass-tile px-4 py-3 efm-rise"`.

- [ ] **Step 3: Verify in browser**

Reload + screenshot the KPI strip. Expected: 4 tiles with a subtle cyan edge and faint glow, clearly lighter than the data panels and hero.

- [ ] **Step 4: tsc + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/globals.css components/kpi-card.tsx && git commit -m "feat(kpi): light cyan glow on KPI tiles"
```

---

### Task 4: Whole-page intensity pass

**Files:**
- Modify: `app/globals.css` accent tokens, if tuning needed

- [ ] **Step 1: Full-page screenshot, top to bottom, at 2x DPR.** Judge the cyan as a system: hero strongest, data panels medium, KPI tiles lightest, gridlines neutral. Confirm dense tables stay legible (the `--color-border-subtle` gridlines must remain neutral).

- [ ] **Step 2: Tune only the accent tokens if needed** (`--color-accent-line/-soft/-glow`). One place, cascades everywhere. Re-screenshot.

- [ ] **Step 3: Final tsc + build, then commit any tuning**

```bash
npx tsc --noEmit && npm run build
git add app/globals.css && git commit -m "style(glass): final cyan intensity pass"
```

---

## Out of scope
- Refraction on non-hero panels (rejected: GPU cost, invisible over flat backgrounds).
- `recursion-panel` / detail-page panels (not on the homepage; revisit if we extend to reserve/vault routes).
- incentive-engine rollout (separate plan, after ethena is signed off).

## Notes
- Nothing here is committed until the look is signed off; commits above are local on the working branch.
- The hero (`refractive-glass.tsx`) is unchanged by this plan.
