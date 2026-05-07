type ChainKey = "ethereum" | "base" | "mantle" | "plasma" | "megaeth" | string

interface Meta {
  initial: string
  bg: string
  fg: string
}

const META: Record<ChainKey, Meta> = {
  ethereum: { initial: "Ξ", bg: "#3c4ad7", fg: "#ffffff" },
  base: { initial: "B", bg: "#0052ff", fg: "#ffffff" },
  mantle: { initial: "M", bg: "#23272d", fg: "#ffffff" },
  plasma: { initial: "P", bg: "#34d399", fg: "#0b0c0f" },
  megaeth: { initial: "M", bg: "#cccccc", fg: "#0b0c0f" },
}

const FALLBACK: Meta = { initial: "?", bg: "#262932", fg: "#8b8d96" }

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
        backgroundColor: meta.bg,
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
