import { Tag } from "./tag"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"
import type { SolanaCompositionRow } from "@/lib/views/solana-vault"

const RESERVE_COLS =
  "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_90px_90px_70px]"
const PAIR_COLS =
  "grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_100px_80px_90px_80px]"

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
      <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 text-[12px] text-[var(--color-text-ghost)]">
        No composition data available.
      </div>
    )
  }

  // A panel's rows are homogeneous — all reserves or all pairs.
  const isPair = rows[0]!.kind === "pair"
  const cols = isPair ? PAIR_COLS : RESERVE_COLS

  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
          {title}
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-text-dim)]">{subtitle}</div>
      </div>
      <div
        className={`grid ${cols} items-center gap-4 border-b border-[var(--color-border)] px-5 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
      >
        {isPair ? (
          <>
            <div>Pair</div>
            <div className="text-right">Collateral</div>
            <div className="text-right">Debt</div>
            <div className="text-right">Current LTV</div>
            <div className="text-right">Health</div>
            <div className="text-right">Leverage</div>
            <div className="text-right">Liq. Thr.</div>
          </>
        ) : (
          <>
            <div>Reserve</div>
            <div className="text-right">Supplied</div>
            <div className="text-right">Borrowed</div>
            <div className="text-right">Utilization</div>
            <div className="text-right">Supply APY</div>
            <div className="text-right">Borrow APY</div>
            <div className="text-right">Max LTV</div>
          </>
        )}
      </div>
      {rows.map((r) => (
        <div
          key={r.address}
          className={`grid ${cols} items-center gap-4 border-b border-[var(--color-border)] px-5 py-2.5`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-accent)]">
              <span className="truncate">{r.label}</span>
              {r.isOutflowLeg && <Tag variant="anomaly">Recursive leg</Tag>}
            </div>
            <div className="truncate text-[10px] text-[var(--color-text-ghost)]">
              {shortAddr(r.address)}
              {r.positions !== null ? ` · ${r.positions.toLocaleString()} positions` : ""}
            </div>
          </div>
          <div className="text-right text-[13px] text-[var(--color-text)]">
            {fmtUsd(r.supplyUsd)}
          </div>
          <div className="text-right text-[13px] text-[var(--color-text)]">
            {fmtUsd(r.borrowUsd)}
          </div>
          {isPair ? (
            <>
              <div className="relative">
                <div
                  className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                  style={{ width: `${Math.min(100, (r.currentLtv ?? 0) * 100)}%` }}
                  aria-hidden
                />
                <div className="relative px-2 py-0.5 text-right text-[13px] text-[var(--color-text)]">
                  {r.currentLtv !== null ? fmtPct(r.currentLtv) : "—"}
                </div>
              </div>
              <div className="text-right text-[13px] text-[var(--color-text)]">
                {fmtHealth(r.healthFactor)}
              </div>
              <div className="text-right text-[13px] text-[var(--color-recursion)]">
                {fmtLeverage(r.leverage)}
              </div>
              <div className="text-right text-[12px] text-[var(--color-text-dim)]">
                {r.liquidationThreshold !== null ? fmtPct(r.liquidationThreshold) : "—"}
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <div
                  className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                  style={{ width: `${Math.min(100, (r.utilization ?? 0) * 100)}%` }}
                  aria-hidden
                />
                <div className="relative px-2 py-0.5 text-right text-[13px] text-[var(--color-text)]">
                  {r.utilization !== null ? fmtPct(r.utilization) : "—"}
                </div>
              </div>
              <div className="text-right text-[13px] text-[var(--color-text)]">
                {fmtPct(r.supplyApy)}
              </div>
              <div className="text-right text-[13px] text-[var(--color-text)]">
                {fmtPct(r.borrowApy)}
              </div>
              <div className="text-right text-[12px] text-[var(--color-text-dim)]">
                {r.maxLtv > 0 ? fmtPct(r.maxLtv) : "—"}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
