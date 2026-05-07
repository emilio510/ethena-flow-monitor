import { classify, type Bucket } from "@/lib/recursion/classify"
import { fmtUsd } from "@/lib/format"

interface Asset {
  symbol: string
  amountUsd: number
}

const FILL: Record<Bucket, string> = {
  TIER_1: "#ef4444",
  PT: "#f59e0b",
  TIER_2: "#5dd6c5",
  OTHER: "#3a4054",
}

const BORROW_FILL: Record<Bucket, string> = {
  TIER_1: "#b91c1c",
  PT: "#b45309",
  TIER_2: "#0f766e",
  OTHER: "#475569",
}

/**
 * Stacked horizontal bar showing the user's full Aave position. Supplies
 * on the left, borrows on the right (in darker shades). Each segment width
 * is proportional to the asset's USD value relative to the user's total
 * (supply + borrow). Labels render inline if the segment is wide enough,
 * full label always available on hover via title attr.
 */
export function PositionBar({
  supplies,
  borrows,
}: {
  supplies: Asset[]
  borrows: Asset[]
}) {
  const total =
    supplies.reduce((a, s) => a + s.amountUsd, 0) +
    borrows.reduce((a, b) => a + b.amountUsd, 0)

  if (total <= 0) {
    return <div className="h-5 w-full rounded-sm bg-[var(--color-bg)]" />
  }

  const orderedSupplies = [...supplies].sort((a, b) => b.amountUsd - a.amountUsd)
  const orderedBorrows = [...borrows].sort((a, b) => b.amountUsd - a.amountUsd)

  const supplyTotal = orderedSupplies.reduce((a, s) => a + s.amountUsd, 0)
  const borrowTotal = orderedBorrows.reduce((a, b) => a + b.amountUsd, 0)
  const supplyWidthPct = (supplyTotal / total) * 100
  const borrowWidthPct = (borrowTotal / total) * 100

  return (
    <div className="flex h-5 w-full items-stretch overflow-hidden rounded-sm bg-[var(--color-bg)]">
      {orderedSupplies.length > 0 ? (
        <div className="flex h-full" style={{ width: `${supplyWidthPct}%` }}>
          {orderedSupplies.map((a, i) => (
            <Segment
              key={`s-${i}`}
              asset={a}
              parentWidthPct={(a.amountUsd / supplyTotal) * 100}
              fill={FILL[classify(a.symbol)]}
              prefix=""
            />
          ))}
        </div>
      ) : null}
      {supplyTotal > 0 && borrowTotal > 0 ? (
        <div className="w-px bg-[var(--color-bg)]" aria-hidden />
      ) : null}
      {orderedBorrows.length > 0 ? (
        <div className="flex h-full" style={{ width: `${borrowWidthPct}%` }}>
          {orderedBorrows.map((a, i) => (
            <Segment
              key={`b-${i}`}
              asset={a}
              parentWidthPct={(a.amountUsd / borrowTotal) * 100}
              fill={BORROW_FILL[classify(a.symbol)]}
              prefix="-"
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Segment({
  asset,
  parentWidthPct,
  fill,
  prefix,
}: {
  asset: Asset
  parentWidthPct: number
  fill: string
  prefix: string
}) {
  const label = `${asset.symbol} ${prefix}${fmtUsd(asset.amountUsd)}`
  const showLabel = parentWidthPct >= 16
  return (
    <div
      title={label}
      className="flex h-full items-center justify-center overflow-hidden truncate px-1.5 text-[9px] font-medium text-white"
      style={{ width: `${parentWidthPct}%`, background: fill }}
    >
      {showLabel ? <span className="truncate tracking-tight">{label}</span> : null}
    </div>
  )
}
