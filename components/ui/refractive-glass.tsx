"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react"

/**
 * RefractiveGlass -- PROTOTYPE.
 *
 * A drop-in alternative to <GlassCard>. By default it renders byte-identical
 * markup to the canonical `.glass` utility, so dropping it in changes nothing.
 *
 * Only when the page is opened with `?glass=refractive` (and the browser
 * supports SVG filters inside backdrop-filter) does it swap in an Aave-style
 * refraction layer: a generated displacement map drives `feDisplacementMap`
 * over the *backdrop* (content painted behind the card), so real DOM behind
 * stays selectable and clickable. See docs comparison in the chat thread.
 *
 * Tunables default to a look that matches the house monochrome glass, with a
 * subtle chromatic edge (chroma) enabled because it is what sells real glass.
 */
type RefractiveGlassProps = HTMLAttributes<HTMLDivElement> & {
  /** Max pixel displacement at the refracting edge. */
  depth?: number
  /** Thickness of the refracting bezel, as a fraction of the card's half-min-side (0..1). */
  curvature?: number
  /** Corner radius in px. Matches the `.glass` token (12) by default. */
  radius?: number
  /** Backdrop blur in px applied under the refraction. */
  blur?: number
  /** Specular edge-highlight intensity (0..1). */
  glow?: number
  /** Chromatic aberration at the edge (0 disables; ~0.06-0.12 is tasteful). */
  chroma?: number
  /** Accent hue carried by the glass material (dichroic rim + glow). Content stays monochrome. */
  accent?: string
  /** Strength of the dichroic accent treatment (0 disables, 1 is strongest). */
  accentStrength?: number
  /** Frame tokens, overridable per dashboard so the component is portable across token sets. */
  frameBackground?: string
  frameBorder?: string
  frameShadow?: string
  /** Bare mode: no card frame (border/radius/drop-shadow). For full-width bars like the header. */
  bare?: boolean
}

/** Warm counter-tint for the dichroic shift (cyan on the lit edge, gold on the far edge). */
const DICHROIC_COUNTER = "#FFCF8A"

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function supportsBackdropFilterUrl(): boolean {
  if (typeof CSS === "undefined" || !CSS.supports) return false
  return (
    CSS.supports("backdrop-filter", "url(#x)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#x)")
  )
}

/**
 * Build a displacement map PNG (data URL) for a rounded rectangle.
 * R channel encodes horizontal displacement, G encodes vertical, both centred
 * on 128 (no displacement). The field is non-zero only inside the bezel band
 * near the edge, pointing inward so the edge magnifies the content behind it.
 */
function makeDisplacementMap(
  w: number,
  h: number,
  radius: number,
  curvature: number,
): string {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  const img = ctx.createImageData(w, h)
  const data = img.data
  const halfW = w / 2
  const halfH = h / 2
  const r = Math.max(0, Math.min(radius, Math.min(halfW, halfH)))
  const bezel = Math.max(1, curvature * Math.min(halfW, halfH))

  // Signed distance to a rounded rectangle centred on the origin.
  const sd = (x: number, y: number): number => {
    const qx = Math.abs(x) - (halfW - r)
    const qy = Math.abs(y) - (halfH - r)
    const ox = Math.max(qx, 0)
    const oy = Math.max(qy, 0)
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r
  }

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px - halfW + 0.5
      const y = py - halfH + 0.5
      const d = sd(x, y)

      let nx = 0
      let ny = 0
      if (d < 0 && d > -bezel) {
        // Surface normal from the SDF gradient (points outward).
        const gx = sd(x + 1, y) - sd(x - 1, y)
        const gy = sd(x, y + 1) - sd(x, y - 1)
        const gl = Math.hypot(gx, gy) || 1
        const t = -d / bezel // 0 at the edge, 1 at the inner edge of the bezel
        const m = Math.pow(1 - t, 1.4) // strongest at the edge, decays inward
        nx = -(gx / gl) * m // negative -> pull inward -> magnify
        ny = -(gy / gl) * m
      }

      const i = (py * w + px) * 4
      data[i] = Math.round((0.5 + 0.5 * nx) * 255)
      data[i + 1] = Math.round((0.5 + 0.5 * ny) * 255)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

type Size = { w: number; h: number }

export function RefractiveGlass({
  className = "",
  children,
  depth = 18,
  curvature = 0.6,
  radius = 12,
  blur = 8,
  glow = 0.5,
  chroma = 0.08,
  accent = "#5AC8FA",
  accentStrength = 0.9,
  frameBackground = "var(--color-bg-card)",
  frameBorder = "1px solid var(--color-border-strong)",
  frameShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 40px rgba(0, 0, 0, 0.4)",
  bare = false,
  ...rest
}: RefractiveGlassProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rawId = useId()
  const filterId = `efm-glass-${rawId.replace(/:/g, "")}`

  const [wantRefractive, setWantRefractive] = useState(false)
  const [size, setSize] = useState<Size | null>(null)
  const [mapUrl, setMapUrl] = useState("")

  // Always-on: active wherever the engine supports SVG filters in backdrop-filter
  // (client-only, after mount). Unsupported engines fall back to plain .glass.
  useEffect(() => {
    setWantRefractive(supportsBackdropFilterUrl())
  }, [])

  // Track the card size so the displacement map matches its box.
  useEffect(() => {
    if (!wantRefractive) return
    const el = frameRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      const w = Math.max(1, Math.round(box.width))
      const h = Math.max(1, Math.round(box.height))
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [wantRefractive])

  // Regenerate the map only when shape changes (not on position changes).
  useEffect(() => {
    if (!wantRefractive || !size) return
    setMapUrl(makeDisplacementMap(size.w, size.h, radius, curvature))
  }, [wantRefractive, size, radius, curvature])

  // Inactive path. Bare bars fall back to a plain blurred tinted bar; cards fall back to
  // byte-identical <GlassCard>, so nothing else in the app shifts.
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

  const frameStyle: CSSProperties = {
    position: "relative",
    borderRadius: bare ? 0 : radius,
    border: bare ? "none" : frameBorder,
    background: frameBackground,
    boxShadow: bare ? "none" : frameShadow,
    overflow: "hidden",
    isolation: "isolate",
  }

  const overlayBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: bare ? 0 : radius,
    pointerEvents: "none",
    zIndex: 0,
  }

  const refractionStyle: CSSProperties = {
    ...overlayBase,
    backdropFilter: mapUrl ? `blur(${blur}px) url(#${filterId})` : `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
  }

  // Dichroic accent: a cyan-lit top edge shifting to a faint warm far edge, plus
  // a cyan inner rim and soft outer glow. The content behind stays monochrome;
  // only the glass material carries the hue. Bare bars use a lighter treatment:
  // a faint top sheen and a single accent hairline where the bar meets the page.
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

  const scale = depth * 2

  return (
    <div ref={frameRef} style={frameStyle} {...rest}>
      <svg
        aria-hidden
        width="0"
        height="0"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <filter
          id={filterId}
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={size?.w ?? 0}
          height={size?.h ?? 0}
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={mapUrl}
            x="0"
            y="0"
            width={size?.w ?? 0}
            height={size?.h ?? 0}
            preserveAspectRatio="none"
            result="map"
          />
          {chroma > 0 ? (
            <>
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale * (1 + chroma)}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dR"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dG"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale * (1 - chroma)}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dB"
              />
              <feColorMatrix
                in="dR"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="cR"
              />
              <feColorMatrix
                in="dG"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="cG"
              />
              <feColorMatrix
                in="dB"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="cB"
              />
              <feBlend in="cR" in2="cG" mode="screen" result="rg" />
              <feBlend in="rg" in2="cB" mode="screen" />
            </>
          ) : (
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          )}
        </filter>
      </svg>

      <div style={refractionStyle} />
      <div style={specularStyle} />
      <div className={className} style={{ position: "relative", zIndex: 1, height: "100%" }}>
        {children}
      </div>
    </div>
  )
}
