import Link from "next/link"
import { Tag } from "./tag"
import { fmtUsd, fmtPct } from "@/lib/format"
import type { FootprintRow } from "@/lib/views/footprint"

export function FootprintTable({ rows }: { rows: FootprintRow[] }) {
  return (
    <div className="border border-[var(--color-border)]">
      <div className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        <div className="col-span-2">Chain</div>
        <div className="col-span-3">Reserve</div>
        <div className="col-span-3 text-right">Ethena Supplied</div>
        <div className="col-span-2 text-right">Share of Reserve</div>
        <div className="col-span-2 text-right">Tag</div>
      </div>
      {rows.map((r) => (
        <Link
          key={`${r.marketKey}|${r.reserveSymbol}|${r.ethenaSuppliedUsd}|${r.isAnomalyBorrow}`}
          href={`/reserve/${r.chain}/${encodeURIComponent(r.reserveSymbol)}`}
          className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg-card)]"
        >
          <div className="col-span-2 uppercase text-[var(--color-text-muted)]">{r.chain}</div>
          <div className="col-span-3">{r.reserveSymbol}</div>
          <div
            className={`col-span-3 text-right ${r.isAnomalyBorrow ? "text-[var(--color-recursion)]" : ""}`}
          >
            {fmtUsd(r.ethenaSuppliedUsd)}
          </div>
          <div className="col-span-2 text-right text-[var(--color-accent)]">
            {r.shareOfReserve !== undefined ? fmtPct(r.shareOfReserve) : "—"}
          </div>
          <div className="col-span-2 text-right">
            {r.isAnomalyBorrow ? (
              <Tag variant="anomaly">Anomaly: borrow</Tag>
            ) : (
              <Tag variant="passive">Passive</Tag>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}
