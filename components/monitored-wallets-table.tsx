import { fmtUsd } from "@/lib/format"
import type { WalletInventoryRow } from "@/lib/views/footprint"

const COLS = "grid-cols-[minmax(0,2.4fr)_110px_minmax(0,1fr)]"

const ROLE_LABEL: Record<WalletInventoryRow["role"], string> = {
  backing: "Backing",
  "reserve-fund": "Reserve fund",
}

/**
 * The flagged address list — the dashboard's source of truth for whose
 * holdings count as Ethena's. Full addresses are shown (not truncated) so
 * they're independently verifiable on a block explorer.
 */
export function MonitoredWalletsTable({ rows }: { rows: WalletInventoryRow[] }) {
  const total = rows.reduce((s, r) => s + r.totalUsd, 0)
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          Monitored wallets — source of truth
        </h2>
        <span className="text-[12px] text-[var(--color-text-ghost)]">
          {rows.length} addresses · {fmtUsd(total)}
        </span>
      </div>
      <p className="mb-3 text-[11px] text-[var(--color-text-ghost)]">
        Every address the dashboard treats as Ethena&apos;s. Holdings = idle
        wallet balances + deployed lending positions; the reserve-fund row
        folds in its Curve LP. Reserve fund is shown for completeness but is
        excluded from backing totals.
      </p>
      <div className="border border-[var(--color-border)]">
        <div
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
        >
          <div>Address</div>
          <div>Role</div>
          <div className="text-right">Holdings</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.address}
            className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5`}
          >
            <a
              href={`https://etherscan.io/address/${r.address}`}
              target="_blank"
              rel="noreferrer"
              className="truncate font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-accent)] hover:underline"
            >
              {r.address}
            </a>
            <div
              className={`text-[11px] uppercase tracking-[0.06em] ${
                r.role === "reserve-fund"
                  ? "text-[var(--color-text-ghost)]"
                  : "text-[var(--color-text-dim)]"
              }`}
            >
              {ROLE_LABEL[r.role]}
            </div>
            <div className="text-right text-[13px] text-[var(--color-text)]">
              {fmtUsd(r.totalUsd)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
