import { Tag } from "@/components/ui/tag"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"
import type { DepositorRow } from "@/lib/views/reserve"

function rowTag(r: DepositorRow) {
  if (r.isEthena) return <Tag tone="risk">Ethena</Tag>
  if (r.isLeveraged) return <Tag tone="warn">Leveraged</Tag>
  return <Tag tone="ok">Passive</Tag>
}

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
    <div>
      <div className="grid grid-cols-[40px_minmax(0,1.5fr)_110px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
        <div>#</div>
        <div>Wallet</div>
        <div></div>
        <div className="text-right">Supplied</div>
        <div className="text-right">Share</div>
      </div>
      {list.map((r, i) => {
        const share = totalSupplyUsd > 0 ? r.amountUsd / totalSupplyUsd : 0
        return (
          <div
            key={r.userAddress + i}
            className="grid grid-cols-[40px_minmax(0,1.5fr)_110px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-dashed border-[var(--color-border)] px-4 py-2.5 last:border-none transition-colors hover:bg-[var(--color-bg-elev)]"
          >
            <div className="font-mono text-[12px] text-[var(--color-text-ghost)]">#{i + 1}</div>
            <div className="font-mono text-[13px] text-[var(--color-text-ghost)]">{shortAddr(r.userAddress)}</div>
            <div>{rowTag(r)}</div>
            <div className="text-right font-mono text-[13px] text-[var(--color-text)]">
              {fmtUsd(r.amountUsd)}
            </div>
            <div className="relative">
              <div
                className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                style={{ width: `${Math.min(100, share * 100)}%` }}
                aria-hidden
              />
              <div className="relative px-2 py-0.5 text-right font-mono text-[13px] text-[var(--color-text)]">
                {totalSupplyUsd > 0 ? fmtPct(share) : "—"}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
