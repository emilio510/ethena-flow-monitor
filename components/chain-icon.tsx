type ChainKey =
  | "ethereum"
  | "base"
  | "mantle"
  | "plasma"
  | "megaeth"
  | "solana"
  | "xrpl"
  | string

interface Meta {
  initial: string
  /** Full-saturation hue used for the foreground glyph. */
  fg: string
  /** Softened background at ~0.15 opacity for the pill. */
  bgSoft: string
}

const META: Record<ChainKey, Meta> = {
  ethereum: { initial: "Ξ", fg: "#3c4ad7", bgSoft: "rgba(60,74,215,0.15)" },
  base: { initial: "B", fg: "#0052ff", bgSoft: "rgba(0,82,255,0.15)" },
  mantle: { initial: "M", fg: "#8b9099", bgSoft: "rgba(35,39,45,0.15)" },
  plasma: { initial: "P", fg: "#34d399", bgSoft: "rgba(52,211,153,0.15)" },
  megaeth: { initial: "M", fg: "#cccccc", bgSoft: "rgba(204,204,204,0.15)" },
  solana: { initial: "◎", fg: "#9945ff", bgSoft: "rgba(153,69,255,0.15)" },
  xrpl: { initial: "✕", fg: "#8b9099", bgSoft: "rgba(35,41,47,0.15)" },
}

const FALLBACK: Meta = { initial: "?", fg: "#8b8d96", bgSoft: "rgba(38,41,50,0.15)" }

export function ChainIcon({
  chain,
  size = 20,
}: {
  chain: ChainKey
  size?: number
}) {
  const meta = META[chain] ?? FALLBACK
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-medium"
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
