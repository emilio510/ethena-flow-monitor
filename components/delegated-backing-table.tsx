import { fmtUsd, fmtPct } from "@/lib/format"
import type { EthenaExchangeRow } from "@/lib/ethena/transparency"

const COLS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]"

export function DelegatedBackingTable({
  rows,
  total,
  reserveFundUsd,
}: {
  rows: EthenaExchangeRow[]
  total: number
  reserveFundUsd: number
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          Delegated to CEX — funding-rate harvest{" "}
          <span className="ml-2 text-[var(--color-text-ghost)] normal-case tracking-normal">
            via app.ethena.fi/dashboards/transparency
          </span>
        </h2>
        <span className="text-[12px] text-[var(--color-text-ghost)]">
          {fmtUsd(total)} total
        </span>
      </div>
      <div className="border border-[var(--color-border)]">
        <div
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
        >
          <div>Exchange</div>
          <div className="text-right">USD Value</div>
          <div className="text-right">Share of Delegated</div>
        </div>
        {rows.map((r) => {
          const share = total > 0 ? r.usd / total : 0
          return (
            <div
              key={r.exchange}
              className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5`}
            >
              <div className="text-[13px] text-[var(--color-accent)]">
                {r.exchange}
              </div>
              <div className="text-right text-[13px] text-[var(--color-text)]">
                {fmtUsd(r.usd)}
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
            Ethena transparency feed unavailable — refresh in a moment.
          </div>
        ) : null}
      </div>
      {reserveFundUsd > 0 ? (
        <div className="mt-2 text-[10px] text-[var(--color-text-ghost)]">
          + {fmtUsd(reserveFundUsd)} reserve fund (insurance)
        </div>
      ) : null}
    </div>
  )
}
