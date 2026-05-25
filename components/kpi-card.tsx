type Tone = "default" | "recursion" | "accent"

const VALUE_TONE: Record<Tone, string> = {
  default: "text-[var(--color-text)]",
  recursion: "text-[var(--color-risk)]",
  accent: "text-[var(--color-ok)]",
}

export function KpiCard({
  label,
  value,
  subValue,
  tone = "default",
}: {
  label: string
  value: React.ReactNode
  subValue?: React.ReactNode
  tone?: Tone
}) {
  return (
    <div className="bg-[var(--color-bg-elev)] px-4 py-3 efm-rise">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-[18px] font-light leading-[1.1] tracking-[-0.02em] ${VALUE_TONE[tone]}`}>
        {value}
      </div>
      {subValue && (
        <div className="mt-1 font-mono text-[10px] text-[var(--color-text-ghost)]">{subValue}</div>
      )}
    </div>
  )
}
