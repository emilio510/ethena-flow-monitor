type Tone = "default" | "recursion" | "accent"

const VALUE_TONE: Record<Tone, string> = {
  default: "text-[var(--color-text)]",
  recursion: "text-[var(--color-recursion)]",
  accent: "text-[var(--color-success)]",
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
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
        {label}
      </div>
      <div className={`mt-1.5 text-[24px] leading-[1.1] tracking-tight ${VALUE_TONE[tone]}`}>
        {value}
      </div>
      {subValue && (
        <div className="mt-1 text-[10px] text-[var(--color-text-ghost)]">{subValue}</div>
      )}
    </div>
  )
}
