export function KpiCard({
  label,
  value,
  subValue,
}: {
  label: string
  value: React.ReactNode
  subValue?: React.ReactNode
}) {
  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-2xl text-[var(--color-text)]">{value}</div>
      {subValue && (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">{subValue}</div>
      )}
    </div>
  )
}
