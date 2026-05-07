"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Tag } from "./tag"
import { fmtUsd, fmtPct } from "@/lib/format"
import { classify, type Bucket } from "@/lib/recursion/classify"

interface RowData {
  collateralSymbol: string
  borrowedUsd: number
  shareOfTotal: number
}

const COLORS: Record<Bucket, string> = {
  TIER_1: "var(--color-recursion)",
  PT: "var(--color-pt-tag)",
  TIER_2: "var(--color-chart-fill)",
  OTHER: "#3a4054",
}

const ROW_FILL: Record<Bucket, string> = {
  TIER_1: "rgba(239,68,68,0.12)",
  PT: "rgba(245,158,11,0.12)",
  TIER_2: "rgba(93,214,197,0.10)",
  OTHER: "rgba(58,64,84,0.18)",
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
    <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
      <div className="mb-4 text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
        Borrow recursion
      </div>
      <div className="mb-6 flex items-baseline gap-2">
        <span className="text-[26px] tracking-tight text-[var(--color-text)]">
          {fmtPct(ethenaCollateralBorrowShare)}
        </span>
        <span className="text-[12px] text-[var(--color-text-dim)]">
          of borrows are collateralised by Ethena-stack assets
        </span>
      </div>
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
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                }}
                formatter={(v) => (typeof v === "number" ? fmtUsd(v) : String(v))}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[18px] tracking-tight text-[var(--color-text)]">
              {fmtUsd(totalBorrowed)}
            </div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-ghost)]">
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
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-2 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: COLORS[bucket] }}
                  />
                  <span className="text-[13px] text-[var(--color-text)]">
                    {b.collateralSymbol}
                  </span>
                  {bucket === "TIER_1" && <Tag variant="ethena">Ethena</Tag>}
                  {bucket === "PT" && <Tag variant="pt">PT</Tag>}
                </div>
                <div className="text-right text-[13px] text-[var(--color-text)]">
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
                  <div className="relative px-2 py-0.5 text-right text-[13px] text-[var(--color-text)]">
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
