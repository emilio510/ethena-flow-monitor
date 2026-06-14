// Chain logos vendored from bgd-labs/web3-icons into public/icons/chains.
// Server-renderable: gate on the known-available set; fall back to the
// on-brand letter/glyph pill for chains we don't have a logo for (xrpl).
type ChainKey =
  | "ethereum"
  | "base"
  | "mantle"
  | "plasma"
  | "megaeth"
  | "solana"
  | "xrpl"
  | string

const AVAILABLE = new Set(["ethereum", "base", "mantle", "plasma", "megaeth", "solana"])

interface Meta {
  initial: string
  fg: string
  bgSoft: string
}

const FALLBACK_META: Record<string, Meta> = {
  xrpl: { initial: "✕", fg: "#8b9099", bgSoft: "rgba(35,41,47,0.15)" },
}
const FALLBACK: Meta = { initial: "?", fg: "#8b8d96", bgSoft: "rgba(38,41,50,0.15)" }

export function ChainIcon({ chain, size = 20 }: { chain: ChainKey; size?: number }) {
  if (AVAILABLE.has(chain)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/icons/chains/${chain}.svg`}
        alt={chain}
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        style={{ width: size, height: size }}
      />
    )
  }
  const meta = FALLBACK_META[chain] ?? FALLBACK
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        backgroundColor: meta.bgSoft,
        color: meta.fg,
        fontSize: Math.max(9, size * 0.5),
        lineHeight: 1,
      }}
      aria-label={chain}
    >
      {meta.initial}
    </span>
  )
}
