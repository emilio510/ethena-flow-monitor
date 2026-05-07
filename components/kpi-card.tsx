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
    <div className="rounded-lg bg-[var(--color-bg-card)] px-5 py-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
        {label}
      </div>
      <div
        className={`mono mt-2 text-[28px] font-semibold leading-[1.1] tracking-tight ${VALUE_TONE[tone]}`}
      >
        {value}
      </div>
      {subValue && (
        <div className="mt-1.5 text-[11px] text-[var(--color-text-ghost)]">{subValue}</div>
      )}
    </div>
  )
}
