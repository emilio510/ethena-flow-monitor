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
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
      <div className="mb-4 text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
        Concentration
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Top 1", value: top1 },
          { label: "Top 5", value: top5 },
          { label: "Top 10", value: top10 },
        ].map((c) => (
          <div
            key={c.label}
            className="border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3"
          >
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
              {c.label}
            </div>
            <div className="mt-1.5 text-[22px] leading-[1.1] tracking-tight text-[var(--color-success)]">
              {fmtPct(c.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
