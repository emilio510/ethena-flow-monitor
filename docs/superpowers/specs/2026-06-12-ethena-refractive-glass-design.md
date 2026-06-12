# Ethena Refractive Hero Glass — Design Spec

**Date:** 2026-06-12
**Status:** SHIPPED to ethena working tree (gated by `?glass=refractive`), signed off by user.
**Final state:** context-aware tone (red risk hero, cyan default); real `RefractiveGlass` (refraction + chroma + dichroic) on the hero, header (bare mode, scroll-under lensing), the 4 KPI bubbles, and the 5 bounded data panels; enriched CSS glass on the big Recent-flows table (5.5 Mpx carve-out). KPI strip regridded to spaced bubbles (was joined tiles with cyan hairlines). Outer-glow bleed removed. Measured 86 FPS / 2 dropped frames over an aggressive scroll with 11 refractive surfaces; user accepted for max consistency.
**Scope:** ethena-flow-monitor only. incentive-engine is a planned follow-up (separate front-gate cycle). gho-lm-dashboard is explicitly out of scope.
**Supersedes nothing.** Extends `docs/superpowers/specs/2026-05-25-monochrome-glass-redesign-design.md` with an opt-in refractive tier.

## 1. Goal

Add an optional "liquid glass" tier on top of the existing monochrome `.glass` system: real optical edge refraction plus a dichroic cyan edge treatment, reserved for a small number of hero surfaces. The default frosted `.glass` everywhere else is unchanged. The win over plain `backdrop-filter` is that the glass edge bends and lenses the content behind it and carries a subtle accent hue, instead of only blurring.

## 2. Background and prior art

- Plain CSS `backdrop-filter: blur()` cannot bend light; it only blurs and tints. The Aave article (`aave.com/design/building-glass-for-the-web`) drives real refraction with an SVG `feDisplacementMap` applied to the painted backdrop.
- Confirmed in a real Chrome 149 on this project: `CSS.supports('backdrop-filter','url(#x)')` is true, the generated displacement map (data URI) is applied, and the dichroic cyan rim renders.

## 3. Mechanism

A new client component `components/ui/refractive-glass.tsx`, used as a drop-in for `GlassCard`.

- Default (no `?glass=refractive` flag, or unsupported engine): renders byte-identical `.glass` markup. Zero change to the rest of the app.
- Active: three stacked layers inside a clipped frame:
  1. **Refraction layer.** An absolutely-positioned overlay with `backdrop-filter: blur(N) url(#filter)`. The SVG filter feeds a canvas-generated rounded-rect displacement map (R = x-shift, G = y-shift, neutral in the flat centre, inward near the bezel) into `feDisplacementMap`, with an optional 3-pass chromatic-aberration split. It refracts the *painted backdrop*, so DOM behind stays selectable and clickable.
  2. **Specular + dichroic layer.** A white top sheen, a cyan-to-warm hue wash across the surface, a cyan inner rim, and a soft cyan outer glow. Content stays monochrome; only the glass material carries hue.
  3. **Content layer.** The children, above the overlays.

The displacement map regenerates only on size change (via `ResizeObserver`), never on scroll or position, so motion is a free compositor shift.

## 4. Scope: which surfaces (REVISED 2026-06-12)

Decoupled into two effects with very different costs:

- **Dichroic edge glow** (rim + glow + hue): pure CSS box-shadow/gradients, nearly free. **Applied to every glass surface** (the `.glass` utility upgraded; naked data tables wrapped in `GlassCard`; KPI tiles via `.glass-tile`). Tone is context-aware (cyan default, red/green via tone classes). DONE.
- **Refraction** (displacement map + `backdrop-filter: url()`): expensive. **Reserved for hero + header only.** Hero is DONE; header is the new work (section 5b).

Intensity tiers (current):
- **Base glass (all panels):** cyan rim + glow + specular sheen.
- **KPI tiles:** lighter cyan edge + faint glow.
- **Hero (refractive):** red (context-aware) rim/glow + displacement refraction.
- **Header (refractive, planned):** cyan, glass-as-background, displacement of scrolling content.
- **Gridlines/dividers:** neutral (legibility guardrail).

## 5. The accent decision (RE-RESOLVED 2026-06-12 — now context-aware)

Superseded the earlier "cyan everywhere" call. After seeing it live, the uniform cyan was too much and clashed on the red risk card. **Resolved as option (b): context-aware tone.** The glass material takes a semantic hue from its content; cyan is the calm default.

Implemented (DONE, verified in browser):
- `.glass` parameterised with `--glass-line/-soft/-glow`, defaulting to the cyan accent.
- `.tone-risk` (red) and `.tone-ok` (green) override those vars; a card opts in by adding the tone class.
- The cyan accent tokens were tempered (line 0.32→0.24, etc.) since uniform cyan was over-hyped.
- The `HeroMeter` risk card now renders red glass (`accent="#ff453a"`) instead of cyan, matching its red data.

## 5b. Refractive header (DONE — verified)

Shipped and measured: full scroll-through ran at ~120 FPS, 0 dropped frames, worst frame 9.4ms. The perf risk below did not materialise, so the displacement was kept (no fallback).

The user's headline ask: implement Aave's real refraction where it actually looks awesome. On a dashboard that surface is the **sticky header**, because content scrolls *underneath* it, so the glass lenses live data in motion (Aave's nav-bar effect).

Design:
- The glass must BE the header background, not sit behind an opaque bar. If the header keeps its `bg rgba(10,10,12,0.6)`, the refraction samples that opaque black and shows nothing. So: remove the header's opaque bg + its own `backdrop-blur`, and let a refraction layer provide blur + displacement of the scrolling content, with a faint dark tint (~`rgba(10,10,12,0.35)`) for text legibility and the header text rendered on top.
- Reuse `RefractiveGlass` via a new `bare` mode: no card border/radius/drop-shadow, full-width, displacement + a light bottom specular only.
- `header.tsx` becomes a client component (it currently has no hooks; adding `'use client'` is safe — it only renders `next/link` + `DataAge`).
- Tone: the header is neutral, so it stays cyan.

Perf stance (unchanged): refraction is reserved for **hero + header only**. NOT applied to in-flow panels (the page's big `.glass` container alone would need a ~1337×4128 displacement map, and stacked nested backdrop-filters risk scroll jank). In-flow panels keep the cheap glow.

Open risk to validate during implementation: a full-width sticky refraction layer over fast-scrolling tables is the most GPU-intensive case in this whole design. The plan MUST include a chrome-devtools performance trace on scroll; if it janks, fall back to the header keeping plain blur (no displacement).

## 5c. Panels: closing the gap with the hero (NEW — to be planned)

Observed: the hero and header read as much more "Aave" than the in-flow panels. Reason — the hero/header render through the real `RefractiveGlass` component (displacement refraction + chromatic aberration + dichroic hue wash + rich multi-layer specular), while panels use the cheaper `.glass` CSS utility (a single rim + glow only). The panels got ~30% of the treatment.

Goal: bring the panels closer to the hero's flavor.

**Key measurement (panel areas, live):** FlowsTable **5.52 Mpx**, Monitored wallets 1.16, Reconciliation 0.93, Footprint 0.85, Idle 0.56, Reserve fund 0.30. The hero/header are each ~0.06 Mpx. The displacement map is generated by a per-pixel canvas loop and repainted over the whole region, so cost scales with area. FlowsTable is ~90x the hero; even the "small" panels are 5–20x.

**Design insight:** on a flat dark background, the *displacement* (light-bending) shows almost nothing inside a panel — there is no busy content behind it to bend. What actually reads as "Aave" is the **dichroic hue wash + rich specular + chroma edge**, and three of those four are pure CSS. So most of the visible gap can be closed cheaply, and the expensive part (displacement) is the part that shows least on panels.

**Two approaches:**

- **A — Rich-glass CSS enrichment (recommended).** Bring the hero's dichroic hue wash, richer multi-layer specular, and a static chroma-like edge color into the `.glass` utility. All panels get ~80–90% of the flavor. Zero perf risk, no map generation, no carve-out. One CSS change, cascades to every `GlassCard`.
- **B — True displacement on bounded panels (optional, additive).** Add a `refractive` opt-in to `GlassCard` and turn it on for a few bounded focal panels (e.g. Footprint 0.85 Mpx), **excluding FlowsTable (5.52 Mpx)** and any panel above a ~1.5 Mpx threshold. Gate on a scroll FPS measurement; fall back to A-only if it janks. Marginal visual gain over A on flat-bg panels.

**Recommendation:** do **A** for all panels (the real win), then optionally **B** on the single Footprint table if literal light-bending is still wanted, behind the perf gate. FlowsTable stays glow-only regardless.

## 6. Tuned parameters (verified in browser)

Defaults baked into the component, all overridable via props:

| Prop | Value | Role |
|------|-------|------|
| `depth` | 18 | max edge displacement (px) |
| `curvature` | 0.6 | bezel band width (fraction of half-min-side) |
| `radius` | 12 | corner radius, matches `.glass` |
| `blur` | 8 | backdrop blur under refraction |
| `glow` | 0.5 | specular highlight intensity |
| `chroma` | 0.08 | chromatic aberration at the edge |
| `accent` | `#5AC8FA` | dichroic hue |
| `accentStrength` | 0.9 | dichroic rim/glow strength |

Lesson recorded: on the `#0a0a0c` surface, accent alphas below ~0.3 are imperceptible; the rim sits at 0.45 and the outer glow at ~0.28.

## 7. Portability

`accent`, `accentStrength`, and `frameBackground/Border/Shadow` are props defaulting to ethena tokens, so the same component can be adopted by incentive-engine later by passing its token strings, with no fork.

## 8. Fallback, performance, accessibility

- **Fallback:** feature-detect `backdrop-filter: url()`; if absent, render plain `.glass`. Firefox is the likely fallback case.
- **Performance:** at most 2 refractive surfaces per page. Map regenerates only on resize.
- **Accessibility:** content contrast unchanged (effect is an edge/backdrop layer, not a restyle of text). `prefers-reduced-motion` has nothing to disable since there is no animated displacement.

## 9. Verification checklist

- [ ] tsc clean, `next build` green.
- [ ] Real-browser screenshot at 2x DPR shows the cyan glass on the hero, and the baseline (`/`) is unchanged.
- [ ] Reserve and vault hero meters (other `HeroMeter` sites) are unaffected even with the flag on.
- [ ] Accent decision from section 5 applied.
- [ ] Whether the tier is flag-gated (`?glass=refractive`) or promoted to always-on for the chosen hero is decided.

## 10. Out of scope

- gho-lm-dashboard (dropped).
- Blanket replacement of all glass surfaces (rejected: perf + legibility).
- Committing/deploying: each repo is its own commit/PR later; nothing is committed under this spec until the look is signed off.
