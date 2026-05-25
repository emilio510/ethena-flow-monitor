export function SectionHead({
  title,
  subtitle,
  status,
}: {
  title: string
  subtitle?: string
  status?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[11px] text-[var(--color-text-ghost)]">{subtitle}</p>
        )}
      </div>
      {status && <div className="shrink-0">{status}</div>}
    </div>
  )
}
