"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { fmtUsd, fmtPct } from "@/lib/format"
import { classify, type Bucket } from "@/lib/recursion/classify"
import { Tag } from "@/components/ui/tag"
import { SectionHead } from "@/components/ui/section-head"
import { AssetIcon } from "@/components/asset-icon"

interface RowData {
  collateralSymbol: string
  borrowedUsd: number
  shareOfTotal: number
}

const COLORS: Record<Bucket, string> = {
  TIER_1: "var(--color-risk)",
  PT: "var(--color-warn)",
  TIER_2: "rgba(255,255,255,0.55)",
  OTHER: "rgba(255,255,255,0.22)",
}

const ROW_FILL: Record<Bucket, string> = {
  TIER_1: "rgba(255,69,58,0.10)",
  PT: "rgba(255,159,10,0.10)",
  TIER_2: "rgba(255,255,255,0.05)",
  OTHER: "rgba(255,255,255,0.03)",
}

export function RecursionPanel({
  ethenaCollateralBorrowShare,
  breakdown,
}: {
  ethenaCollateralBorrowShare: number
  breakdown: RowData[]
}) {
  const totalBorrowed = breakdown.reduce((a, b) => a + b.borrowedUsd, 0)

  return (
    <div>
      <SectionHead
        title="Borrow recursion"
        subtitle="Share of total borrows collateralised by Ethena-stack assets"
        status={<Tag tone="risk">{fmtPct(ethenaCollateralBorrowShare)} Ethena-collateralised</Tag>}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
        <div className="relative h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="borrowedUsd"
                nameKey="collateralSymbol"
                innerRadius={62}
                outerRadius={90}
                strokeWidth={0}
              >
                {breakdown.map((b, i) => (
                  <Cell key={i} fill={COLORS[classify(b.collateralSymbol)]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-strong)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  borderRadius: "8px",
                  backdropFilter: "blur(20px)",
                }}
                formatter={(v) => (typeof v === "number" ? fmtUsd(v) : String(v))}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono text-[18px] font-light tracking-[-0.02em] text-[var(--color-text)]">
              {fmtUsd(totalBorrowed)}
            </div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
              Borrowed
            </div>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-2 py-2 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
            <div>Collateral</div>
            <div className="text-right">Borrowed</div>
            <div className="text-right">Share</div>
          </div>
          {breakdown.map((b, i) => {
            const bucket = classify(b.collateralSymbol)
            return (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-dashed border-[var(--color-border)] px-2 py-2 transition-colors hover:bg-[var(--color-bg-elev)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: COLORS[bucket] }}
                  />
                  <AssetIcon symbol={b.collateralSymbol} size={16} />
                  <span className="text-[13px] text-[var(--color-text)]">
                    {b.collateralSymbol}
                  </span>
                  {bucket === "TIER_1" && <Tag tone="risk">Ethena</Tag>}
                  {bucket === "PT" && <Tag tone="warn">PT</Tag>}
                </div>
                <div className="text-right font-mono text-[13px] text-[var(--color-text)]">
                  {fmtUsd(b.borrowedUsd)}
                </div>
                <div className="relative">
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm"
                    style={{
                      width: `${Math.min(100, b.shareOfTotal * 100)}%`,
                      background: ROW_FILL[bucket],
                    }}
                    aria-hidden
                  />
                  <div className="relative px-2 py-0.5 text-right font-mono text-[13px] text-[var(--color-text)]">
                    {fmtPct(b.shareOfTotal)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
