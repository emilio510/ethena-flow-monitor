import { Tag } from "./tag"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"
import type { DepositorRow } from "@/lib/views/reserve"

export function DepositorsTable({
  rows,
  totalSupplyUsd,
}: {
  rows: DepositorRow[]
  totalSupplyUsd: number
}) {
  const pinned = rows.filter((r) => r.isEthena)
  const rest = rows.filter((r) => !r.isEthena).slice(0, 50 - pinned.length)
  const list = [...pinned, ...rest]

  return (
    <div className="border border-[var(--color-border)]">
      <div className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        <div className="col-span-1">#</div>
        <div className="col-span-4">Wallet</div>
        <div className="col-span-3 text-right">Supplied</div>
        <div className="col-span-2 text-right">Share</div>
        <div className="col-span-2 text-right">Tag</div>
      </div>
      {list.map((r, i) => (
        <div
          key={r.userAddress + i}
          className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <div className="col-span-1 text-[var(--color-text-muted)]">#{i + 1}</div>
          <div className="col-span-4 text-[var(--color-accent)]">{shortAddr(r.userAddress)}</div>
          <div className="col-span-3 text-right">{fmtUsd(r.amountUsd)}</div>
          <div className="col-span-2 text-right">{fmtPct(r.amountUsd / totalSupplyUsd)}</div>
          <div className="col-span-2 text-right">
            {r.isEthena && <Tag variant="ethena">Ethena</Tag>}
          </div>
        </div>
      ))}
    </div>
  )
}
