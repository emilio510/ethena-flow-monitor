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
    <div className="rounded-lg bg-[var(--color-bg-card)] p-6">
      <div className="mb-5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
        Concentration
      </div>
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: "Top 1", value: top1 },
          { label: "Top 5", value: top5 },
          { label: "Top 10", value: top10 },
        ].map((c) => (
          <div key={c.label}>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-ghost)]">
              {c.label}
            </div>
            <div className="mono mt-2 text-2xl font-semibold tracking-tight text-[var(--color-accent)]">
              {fmtPct(c.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
