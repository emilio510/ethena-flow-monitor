import { fmtPct } from "@/lib/format"

export function ConcentrationPanel({
  top1,
  top5,
  top10,
}: {
  top1: number
  top5: number
  top10: number
}) {
  return (
    <div className="border border-[var(--color-border)] p-4">
      <div className="mb-3 text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
        Concentration
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Top 1", value: top1 },
          { label: "Top 5", value: top5 },
          { label: "Top 10", value: top10 },
        ].map((c) => (
          <div
            key={c.label}
            className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3"
          >
            <div className="text-[10px] uppercase text-[var(--color-text-muted)]">{c.label}</div>
            <div className="mt-1 text-xl text-[var(--color-accent)]">{fmtPct(c.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
