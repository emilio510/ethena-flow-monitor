import { Tag } from "@/components/ui/tag"
import { PositionBar } from "./position-bar"
import { fmtUsd, shortAddr } from "@/lib/format"
import type { CollateralUserRow } from "@/lib/views/reserve"

function hfTag(hf: number | null) {
  if (hf === null) return null
  if (hf < 1) return <Tag tone="risk">Liquidatable</Tag>
  if (hf < 1.1) return <Tag tone="warn">At risk</Tag>
  return null
}

const COLS =
  "grid-cols-[40px_minmax(0,1.3fr)_110px_minmax(0,1fr)_70px_minmax(0,2.4fr)]"

export function CollateralUsersTable({ rows }: { rows: CollateralUserRow[] }) {
  const pinned = rows.filter((r) => r.isEthena)
  const rest = rows.filter((r) => !r.isEthena).slice(0, 50 - pinned.length)
  const list = [...pinned, ...rest]

  return (
    <div>
      <div
        className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
      >
        <div>#</div>
        <div>Wallet</div>
        <div></div>
        <div className="text-right">As collateral</div>
        <div className="text-right">HF</div>
        <div>Position composition</div>
      </div>
      {list.map((r, i) => (
        <div
          key={r.userAddress + i}
          className={`grid ${COLS} items-center gap-4 border-b border-dashed border-[var(--color-border)] px-4 py-2.5 last:border-none transition-colors hover:bg-[var(--color-bg-elev)]`}
        >
          <div className="font-mono text-[12px] text-[var(--color-text-ghost)]">#{i + 1}</div>
          <div className="font-mono text-[13px] text-[var(--color-text-ghost)]">{shortAddr(r.userAddress)}</div>
          <div>
            {r.isEthena ? (
              <Tag tone="risk">Ethena</Tag>
            ) : (
              (hfTag(r.healthFactor) ?? <Tag tone="warn">Leveraged</Tag>)
            )}
          </div>
          <div className="text-right font-mono text-[13px] text-[var(--color-text)]">
            {fmtUsd(r.reserveSupplyUsd)}
          </div>
          <div
            className={`text-right font-mono text-[12px] ${
              r.healthFactor === null
                ? "text-[var(--color-text-ghost)]"
                : r.healthFactor < 1
                  ? "text-[var(--color-risk)]"
                  : r.healthFactor < 1.1
                    ? "text-[var(--color-warn)]"
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
