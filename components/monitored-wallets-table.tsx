import { fmtUsd } from "@/lib/format"
import { ChainIcon } from "./chain-icon"
import type { WalletInventoryRow } from "@/lib/views/footprint"

const COLS = "grid-cols-[minmax(0,2.3fr)_90px_minmax(0,1fr)_minmax(0,1fr)]"

const ROLE_LABEL: Record<WalletInventoryRow["role"], string> = {
  backing: "Backing",
  "reserve-fund": "Reserve fund",
}

function explorerUrl(row: WalletInventoryRow): string {
  switch (row.chain) {
    case "solana":
      return `https://solscan.io/account/${row.address}`
    case "xrpl":
      return `https://xrpscan.com/account/${row.address}`
    default:
      return `https://etherscan.io/address/${row.address}`
  }
}

/**
 * The flagged address list — the dashboard's source of truth for whose
 * holdings count as Ethena's. Full addresses are shown (not truncated) so
 * they're independently verifiable. The "Ethena API" column shows what
 * Ethena's own backing API labels each address as — blank means the
 * address isn't disclosed there (custodian-omnibus or reserve fund).
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
        balances + deployed lending positions (Solana rows use Ethena&apos;s
        reported USDG). The Ethena API column is the counterparty/strategy
        the address is disclosed under — blank means undisclosed
        (custodian-omnibus or reserve fund).
      </p>
      <div className="border border-[var(--color-border)]">
        <div
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
        >
          <div>Address</div>
          <div>Role</div>
          <div>Ethena API</div>
          <div className="text-right">Holdings</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.address}
            className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <ChainIcon chain={r.chain} size={14} />
              <a
                href={explorerUrl(r)}
                target="_blank"
                rel="noreferrer"
                className="truncate font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-accent)] hover:underline"
              >
                {r.address}
              </a>
            </div>
            <div
              className={`text-[11px] uppercase tracking-[0.06em] ${
                r.role === "reserve-fund"
                  ? "text-[var(--color-text-ghost)]"
                  : "text-[var(--color-text-dim)]"
              }`}
            >
              {ROLE_LABEL[r.role]}
            </div>
            <div className="truncate text-[12px]">
              {r.apiLabel ? (
                <span className="text-[var(--color-text)]">{r.apiLabel}</span>
              ) : (
                <span className="text-[var(--color-text-ghost)]">not disclosed</span>
              )}
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
