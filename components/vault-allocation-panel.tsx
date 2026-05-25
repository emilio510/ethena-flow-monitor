"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Tag } from "@/components/ui/tag"
import { fmtUsd, fmtPct } from "@/lib/format"
import { classify, type Bucket } from "@/lib/recursion/classify"
import type { VaultMarketAllocation } from "@/lib/views/vault"

const COLORS: Record<Bucket, string> = {
  TIER_1: "var(--color-risk)",
  PT: "var(--color-warn)",
  TIER_2: "rgba(255,255,255,0.45)",
  OTHER: "#3a4054",
}

const ROW_FILL: Record<Bucket, string> = {
  TIER_1: "rgba(239,68,68,0.12)",
  PT: "rgba(245,158,11,0.12)",
  TIER_2: "rgba(93,214,197,0.10)",
  OTHER: "rgba(58,64,84,0.18)",
}

function rowBucket(a: VaultMarketAllocation): Bucket {
  // Use the collateral as the dominant signal; loan asset is usually the
  // vault's own asset which is itself often Tier-2.
  if (a.collateralSymbol) return classify(a.collateralSymbol)
  if (a.loanSymbol) return classify(a.loanSymbol)
  return "OTHER"
}

export function VaultAllocationPanel({
  totalAssetsUsd,
  vaultRecursionShare,
  allocation,
}: {
  totalAssetsUsd: number
  vaultRecursionShare: number
  allocation: VaultMarketAllocation[]
}) {
  const allocated = allocation.reduce((a, m) => a + m.supplyAssetsUsd, 0)

  return (
    <div className="glass p-5">
      <div className="mb-4 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
        Vault allocation
      </div>
      <div className="mb-6 flex items-baseline gap-2">
        <span className="font-mono text-[26px] tracking-tight text-[var(--color-text)]">
          {fmtPct(vaultRecursionShare)}
        </span>
        <span className="text-[12px] text-[var(--color-text-dim)]">
          of vault TVL is actively borrowed against Ethena-stack collateral
          (idle liquidity excluded)
        </span>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
        <div className="relative h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocation}
                dataKey="supplyAssetsUsd"
                nameKey="marketUniqueKey"
                innerRadius={62}
                outerRadius={90}
                strokeWidth={0}
              >
                {allocation.map((a, i) => (
                  <Cell key={i} fill={COLORS[rowBucket(a)]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                }}
                formatter={(v) => (typeof v === "number" ? fmtUsd(v) : String(v))}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono text-[18px] tracking-tight text-[var(--color-text)]">
              {fmtUsd(totalAssetsUsd)}
            </div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-ghost)]">
              Vault TVL
            </div>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-2 py-2 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
            <div>Market</div>
            <div className="text-right">Allocated</div>
            <div className="text-right">Borrowed</div>
            <div className="text-right">Utilization</div>
          </div>
          {allocation.map((a) => {
            const bucket = rowBucket(a)
            return (
              <div
                key={a.marketUniqueKey}
                className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-2 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLORS[bucket] }}
                  />
                  <span className="truncate text-[13px] text-[var(--color-text)]">
                    <span className="text-[var(--color-text-ghost)]">
                      {a.collateralSymbol ?? "—"}
                    </span>
                    <span className="mx-1.5 text-[var(--color-text-ghost)]">/</span>
                    <span>{a.loanSymbol ?? "—"}</span>
                  </span>
                  {a.isRecursive ? <Tag tone="risk">Recursive</Tag> : null}
                </div>
                <div className="text-right font-mono text-[13px] text-[var(--color-text)]">
                  {fmtUsd(a.supplyAssetsUsd)}
                </div>
                <div
                  className={`text-right font-mono text-[13px] ${
                    a.attributedBorrowUsd > 0
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-text-ghost)]"
                  }`}
                >
                  {a.attributedBorrowUsd > 0 ? fmtUsd(a.attributedBorrowUsd) : "idle"}
                </div>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm"
                    style={{
                      width: `${Math.min(100, a.marketUtilization * 100)}%`,
                      background: ROW_FILL[bucket],
                    }}
                    aria-hidden
                  />
                  <div className="relative px-2 py-0.5 text-right font-mono text-[13px] text-[var(--color-text)]">
                    {fmtPct(a.marketUtilization)}
                  </div>
                </div>
              </div>
            )
          })}
          {allocation.length === 0 ? (
            <div className="px-2 py-4 text-center text-[12px] text-[var(--color-text-ghost)]">
              No allocations above the dust threshold.
            </div>
          ) : null}
          {totalAssetsUsd > allocated ? (
            <div className="mt-2 px-2 text-[10px] text-[var(--color-text-ghost)]">
              {fmtPct((totalAssetsUsd - allocated) / totalAssetsUsd)} idle / dust below
              threshold
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
