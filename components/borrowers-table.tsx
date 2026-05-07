import { Tag } from "./tag"
import { PositionBar } from "./position-bar"
import { fmtUsd, shortAddr } from "@/lib/format"
import type { BorrowerRow } from "@/lib/views/reserve"

function hfTag(hf: number | null) {
  if (hf === null) return null
  if (hf < 1) return <Tag variant="anomaly">Liquidatable</Tag>
  if (hf < 1.1) return <Tag variant="pt">At risk</Tag>
  return null
}

const COLS =
  "grid-cols-[40px_minmax(0,1.3fr)_110px_minmax(0,1fr)_70px_minmax(0,2.4fr)]"

export function BorrowersTable({ rows }: { rows: BorrowerRow[] }) {
  const pinned = rows.filter((r) => r.isEthena)
  const rest = rows.filter((r) => !r.isEthena).slice(0, 50 - pinned.length)
  const list = [...pinned, ...rest]

  return (
    <div className="border border-[var(--color-border)]">
      <div
        className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
      >
        <div>#</div>
        <div>Wallet</div>
        <div></div>
        <div className="text-right">Borrowed</div>
        <div className="text-right">HF</div>
        <div>Position composition</div>
      </div>
      {list.map((r, i) => (
        <div
          key={r.userAddress + i}
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5`}
        >
          <div className="text-[12px] text-[var(--color-text-ghost)]">#{i + 1}</div>
          <div className="text-[13px] text-[var(--color-accent)]">{shortAddr(r.userAddress)}</div>
          <div>
            {r.isEthena ? (
              <Tag variant="ethena">Ethena</Tag>
            ) : (
              (hfTag(r.healthFactor) ?? <Tag variant="default">Borrower</Tag>)
            )}
          </div>
          <div className="text-right text-[13px] text-[var(--color-text)]">
            {fmtUsd(r.borrowOfReserveUsd)}
          </div>
          <div
            className={`text-right text-[12px] ${
              r.healthFactor === null
                ? "text-[var(--color-text-ghost)]"
                : r.healthFactor < 1
                  ? "text-[var(--color-recursion)]"
                  : r.healthFactor < 1.1
                    ? "text-[var(--color-pt-tag)]"
                    : "text-[var(--color-text-dim)]"
            }`}
          >
            {r.healthFactor === null ? "—" : r.healthFactor.toFixed(2)}
          </div>
          <div>
            <PositionBar supplies={r.supplies} borrows={r.borrows} />
          </div>
        </div>
      ))}
    </div>
  )
}
