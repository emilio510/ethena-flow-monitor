import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"
import { Tag } from "@/components/ui/tag"
import { SectionHead } from "@/components/ui/section-head"
import type { SolanaCompositionRow } from "@/lib/views/solana-vault"

function fmtHealth(hf: number | null): string {
  if (hf === null) return "—"
  return hf >= 100 ? ">100" : hf.toFixed(2)
}

function fmtLeverage(lev: number | null): string {
  if (lev === null) return "—"
  return `${lev.toFixed(1)}x`
}

export function SolanaCompositionPanel({
  rows,
  title,
  subtitle,
}: {
  rows: SolanaCompositionRow[]
  title: string
  subtitle: string
}) {
  if (rows.length === 0) {
    return (
      <div className="px-2 py-4 text-[12px] text-[var(--color-text-ghost)]">
        No composition data available.
      </div>
    )
  }

  const totalBorrowedUsd = rows.reduce((a, r) => a + r.borrowUsd, 0)

  return (
    <div>
      <SectionHead
        title={title}
        subtitle={subtitle}
        status={
          <Tag tone="risk">{fmtUsd(totalBorrowedUsd)} · 100% recursive</Tag>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((r) => {
          // For reserves: use utilization as fill metric.
          // For pairs: use currentLtv as fill metric (debt / collateral).
          const fillRatio =
            r.kind === "reserve"
              ? (r.utilization ?? 0)
              : (r.currentLtv ?? 0)

          const fillLabel =
            r.kind === "reserve" ? "utilization" : "current LTV"

          const rightMetric =
            r.kind === "pair"
              ? r.healthFactor !== null
                ? `HF ${fmtHealth(r.healthFactor)}`
                : `lev ${fmtLeverage(r.leverage)}`
              : `util ${fmtPct(r.utilization ?? 0)}`

          return (
            <div
              key={r.address}
              className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 backdrop-blur-[16px] transition-all duration-[250ms] hover:-translate-y-[1px] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-card-hover)]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                    {r.label}
                  </span>
                  {r.isOutflowLeg && <Tag tone="risk">Recursive leg</Tag>}
                </div>
                <div className="shrink-0 font-mono text-[14px] text-[var(--color-ok)]">
                  {fmtPct(fillRatio)}
                </div>
              </div>
              <div className="mt-2 h-[6px] overflow-hidden rounded-sm bg-[color:rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-sm bg-[var(--color-ok)]"
                  style={{
                    width: `${Math.min(100, fillRatio * 100)}%`,
                    boxShadow: "0 0 6px rgba(48,209,88,0.25)",
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--color-text-ghost)]">
                <span>{shortAddr(r.address)}</span>
                <span>{rightMetric}</span>
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--color-text-ghost)]">
                <span>{fmtUsd(r.supplyUsd)} supplied</span>
                <span>{fmtUsd(r.borrowUsd)} borrowed · {fillLabel}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
