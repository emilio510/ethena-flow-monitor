import Link from "next/link"
import { ChainIcon } from "./chain-icon"
import { AssetIcon } from "@/components/asset-icon"
import { fmtUsd, fmtPct } from "@/lib/format"
import type { FootprintRow } from "@/lib/views/footprint"

const COLS =
  "grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)]"

export function FootprintTable({ rows }: { rows: FootprintRow[] }) {
  return (
    <div>
      <div
        className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
      >
        <div>Chain</div>
        <div>Protocol</div>
        <div>Reserve / Vault</div>
        <div className="text-right">Ethena Supplied</div>
        <div className="text-right">Share</div>
        <div className="text-right">Recursion</div>
      </div>
      {rows.map((r) => {
        const share = r.shareOfReserve ?? 0
        // Any row with a vaultAddress drills into the per-vault page. Reserve
        // rows (Aave) route by chain+symbol instead.
        const href = r.vaultAddress
          ? `/vault/${r.chain}/${r.vaultAddress}`
          : `/reserve/${r.chain}/${encodeURIComponent(r.reserveSymbol)}`
        return (
          <Link
            key={`${r.marketKey}|${r.reserveSymbol}|${r.ethenaSuppliedUsd}|${r.isAnomalyBorrow}`}
            href={href}
            className={`grid ${COLS} items-center gap-4 border-b border-dashed border-[var(--color-border)] px-4 py-2.5 last:border-none transition-colors hover:bg-[var(--color-bg-elev)]`}
          >
            <div className="flex items-center gap-2">
              <ChainIcon chain={r.chain} size={18} />
              <span className="text-[13px] capitalize text-[var(--color-text)]">{r.chain}</span>
            </div>
            <div
              className={`text-[12px] uppercase tracking-[0.08em] ${
                r.protocol === "MORPHO"
                  ? "text-[var(--color-ok)]"
                  : r.protocol === "KAMINO" || r.protocol === "JUPITER LEND"
                    ? "text-[var(--color-risk)]"
                    : "text-[var(--color-text)]"
              }`}
            >
              {r.protocol}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <AssetIcon symbol={r.reserveSymbol} size={16} />
              <div className="min-w-0">
                <div className="truncate text-[13px] text-[var(--color-text-ghost)]">
                  {r.vaultName ?? r.reserveSymbol}
                </div>
                {r.vaultName ? (
                  <div className="truncate text-[10px] text-[var(--color-text-ghost)]">
                    {r.reserveSymbol} vault
                  </div>
                ) : null}
              </div>
            </div>
            <div
              className={`text-right font-mono text-[13px] ${
                r.isAnomalyBorrow ? "text-[var(--color-risk)]" : "text-[var(--color-text)]"
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
              <div className="relative px-2 py-0.5 text-right font-mono text-[13px] text-[var(--color-text)]">
                {r.shareOfReserve !== undefined ? fmtPct(r.shareOfReserve) : "—"}
              </div>
            </div>
            <div className="text-right">
              {r.recursionScore !== undefined ? (
                <>
                  <div className="font-mono text-[13px] text-[var(--color-risk)]">
                    {fmtPct(r.recursionScore)}
                    {r.recursionApprox ? "*" : ""}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--color-text-ghost)]">
                    {fmtUsd(r.ethenaSuppliedUsd * r.recursionScore)}
                  </div>
                </>
              ) : (
                <span className="font-mono text-[13px] text-[var(--color-risk)]">—</span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
