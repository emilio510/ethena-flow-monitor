import Link from "next/link"
import { Tag } from "./tag"
import { ChainIcon } from "./chain-icon"
import { fmtUsd, fmtPct } from "@/lib/format"
import type { FootprintRow } from "@/lib/views/footprint"

const COLS =
  "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]"

export function FootprintTable({ rows }: { rows: FootprintRow[] }) {
  return (
    <div className="border border-[var(--color-border)]">
      <div
        className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
      >
        <div>Chain</div>
        <div>Reserve</div>
        <div className="text-right">Ethena Supplied</div>
        <div className="text-right">Share of Reserve</div>
        <div className="text-right">Recursion</div>
        <div className="text-right">Tag</div>
      </div>
      {rows.map((r) => {
        const share = r.shareOfReserve ?? 0
        return (
          <Link
            key={`${r.marketKey}|${r.reserveSymbol}|${r.ethenaSuppliedUsd}|${r.isAnomalyBorrow}`}
            href={`/reserve/${r.chain}/${encodeURIComponent(r.reserveSymbol)}`}
            className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 transition-colors hover:bg-[color:rgb(245_204_76_/_0.04)]`}
          >
            <div className="flex items-center gap-2">
              <ChainIcon chain={r.chain} size={18} />
              <span className="text-[13px] capitalize text-[var(--color-text)]">{r.chain}</span>
            </div>
            <div className="text-[13px] text-[var(--color-accent)]">{r.reserveSymbol}</div>
            <div
              className={`text-right text-[13px] ${
                r.isAnomalyBorrow ? "text-[var(--color-recursion)]" : "text-[var(--color-text)]"
              }`}
            >
              {fmtUsd(r.ethenaSuppliedUsd)}
            </div>
            <div className="relative">
              <div
                className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                style={{ width: `${Math.min(100, share * 100)}%` }}
                aria-hidden
              />
              <div className="relative px-2 py-0.5 text-right text-[13px] text-[var(--color-text)]">
                {r.shareOfReserve !== undefined ? fmtPct(r.shareOfReserve) : "—"}
              </div>
            </div>
            <div className="text-right text-[13px] text-[var(--color-recursion)]">
              {r.recursionScore !== undefined ? (
                <>
                  {fmtPct(r.recursionScore)}
                  {r.recursionApprox ? "*" : ""}
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="flex justify-end">
              {r.isAnomalyBorrow ? (
                <Tag variant="anomaly">Anomaly: borrow</Tag>
              ) : (
                <Tag variant="passive">Passive</Tag>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
