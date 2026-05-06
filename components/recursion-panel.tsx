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
  OTHER: "#475569",
}

export function RecursionPanel({
  recursionScore,
  breakdown,
}: {
  totalBorrowUsd: number
  recursionScore: number
  breakdown: RowData[]
}) {
  return (
    <div className="border border-[var(--color-border)] p-4">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
        Borrow recursion
      </div>
      <div className="mb-4 text-2xl">
        <span className="text-[var(--color-recursion)]">{fmtPct(recursionScore)}</span>
        <span className="ml-2 text-sm text-[var(--color-text-muted)]">
          of borrows are recursive Ethena loops
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="borrowedUsd"
                nameKey="collateralSymbol"
                innerRadius={50}
                outerRadius={90}
              >
                {breakdown.map((b, i) => (
                  <Cell key={i} fill={COLORS[classify(b.collateralSymbol)]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                }}
                formatter={(v: number) => fmtUsd(v)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-[var(--color-border)]">
          <div className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            <div className="col-span-5">Collateral</div>
            <div className="col-span-4 text-right">Borrowed</div>
            <div className="col-span-3 text-right">Share</div>
          </div>
          {breakdown.map((b, i) => {
            const bucket = classify(b.collateralSymbol)
            return (
              <div
                key={i}
                className="grid grid-cols-12 border-b border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <div className="col-span-5 flex items-center gap-2">
                  <span>{b.collateralSymbol}</span>
                  {bucket === "TIER_1" && <Tag variant="ethena">Ethena</Tag>}
                  {bucket === "PT" && <Tag variant="pt">PT</Tag>}
                </div>
                <div className="col-span-4 text-right">{fmtUsd(b.borrowedUsd)}</div>
                <div className="col-span-3 text-right">{fmtPct(b.shareOfTotal)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
