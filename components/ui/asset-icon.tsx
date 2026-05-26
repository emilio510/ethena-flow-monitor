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
