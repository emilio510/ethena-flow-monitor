type Tone = "default" | "recursion" | "accent"

const VALUE_TONE: Record<Tone, string> = {
  default: "text-[var(--color-text)]",
  recursion: "text-[var(--color-recursion)]",
  accent: "text-[var(--color-accent)]",
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
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-2xl ${VALUE_TONE[tone]}`}>{value}</div>
      {subValue && (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">{subValue}</div>
      )}
    </div>
  )
}
