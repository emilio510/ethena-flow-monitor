import { fmtUsd, fmtPct } from "@/lib/format"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

const COLS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]"

export function IdleBackingTable({
  rows,
  total,
}: {
  rows: IdleBalanceRow[]
  total: number
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          Idle backing — not deployed in lending
        </h2>
        <span className="text-[12px] text-[var(--color-text-ghost)]">
          {fmtUsd(total)} total
        </span>
      </div>
      <div className="border border-[var(--color-border)]">
        <div
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
        >
          <div>Token</div>
          <div className="text-right">USD Value</div>
          <div className="text-right">Share of Idle</div>
        </div>
        {rows.map((r) => {
          const share = total > 0 ? r.totalUsd / total : 0
          return (
            <div
              key={r.symbol}
              className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--color-accent)]">
                  {r.symbol}
                </span>
                {r.isErc4626 ? (
                  <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-ghost)]">
                    vault
                  </span>
                ) : null}
              </div>
              <div className="text-right text-[13px] text-[var(--color-text)]">
                {fmtUsd(r.totalUsd)}
              </div>
              <div className="relative">
                <div
                  className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                  style={{ width: `${Math.min(100, share * 100)}%` }}
                  aria-hidden
                />
                <div className="relative px-2 py-0.5 text-right text-[13px] text-[var(--color-text)]">
                  {fmtPct(share)}
                </div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-[var(--color-text-ghost)]">
            No idle balances detected.
          </div>
        ) : null}
      </div>
    </div>
  )
}
