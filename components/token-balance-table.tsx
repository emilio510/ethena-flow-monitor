import { AssetIcon } from "@/components/ui/asset-icon"
import { fmtUsd, fmtPct } from "@/lib/format"
import type { IdleBalanceRow } from "@/lib/onchain/balances"

const COLS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]"

/**
 * Generic per-token balance table — used for both the idle-backing breakdown
 * and the reserve-fund breakdown. Title and the share-column label are
 * parameterised so the same component reads accurately in both contexts.
 */
export function TokenBalanceTable({
  rows,
  total,
  title,
  shareLabel,
  note,
  emptyText = "No balances detected.",
}: {
  rows: IdleBalanceRow[]
  total: number
  title: string
  shareLabel: string
  /** Optional caption shown under the title (e.g. why this isn't backing). */
  note?: string
  emptyText?: string
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          {title}
        </h2>
        <span className="text-[12px] text-[var(--color-text-ghost)]">
          {fmtUsd(total)} total
        </span>
      </div>
      {note ? (
        <p className="mb-3 text-[11px] text-[var(--color-text-ghost)]">{note}</p>
      ) : null}
      <div>
        <div
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
        >
          <div>Token</div>
          <div className="text-right">USD Value</div>
          <div className="text-right">{shareLabel}</div>
        </div>
        {rows.map((r) => {
          const share = total > 0 ? r.totalUsd / total : 0
          return (
            <div
              key={r.symbol}
              className={`grid ${COLS} items-center gap-4 border-b border-dashed border-[var(--color-border)] px-4 py-2.5 last:border-none transition-colors hover:bg-[var(--color-bg-elev)]`}
            >
              <div className="flex items-center gap-2.5">
                <AssetIcon symbol={r.symbol} />
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--color-text-ghost)]">{r.symbol}</span>
                  {r.isErc4626 ? (
                    <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-ghost)]">
                      vault
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="text-right font-mono text-[13px] text-[var(--color-text)]">
                {fmtUsd(r.totalUsd)}
              </div>
              <div className="relative">
                <div
                  className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                  style={{ width: `${Math.min(100, share * 100)}%` }}
                  aria-hidden
                />
                <div className="relative px-2 py-0.5 text-right font-mono text-[13px] text-[var(--color-text)]">
                  {fmtPct(share)}
                </div>
              </div>
            </div>
          )
        })}
        {rows.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-[var(--color-text-ghost)]">
            {emptyText}
          </div>
        ) : null}
      </div>
    </div>
  )
}
