import { GlassCard } from "@/components/ui/glass-card"
import { SectionHead } from "@/components/ui/section-head"
import { Tag } from "@/components/ui/tag"
import { fmtUsd, shortAddr } from "@/lib/format"
import { KNOWN_WALLET_LABELS } from "@/config/wallets"
import type { Flow, Classification } from "@/lib/flows/types"

const DEFAULT_LIMIT = 100

const CLASS_TONE: Record<Classification, "ok" | "warn" | "risk"> = {
  redeem: "warn",
  rebalance: "ok",
  external: "risk",
}

function label(addr: string): string {
  return KNOWN_WALLET_LABELS[addr.toLowerCase()] ?? shortAddr(addr)
}

function fmtDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"
}

export function FlowsTable({ flows, limit = DEFAULT_LIMIT }: { flows: Flow[]; limit?: number }) {
  const sorted = [...flows].sort((a, b) => b.timestamp - a.timestamp)
  const shown = sorted.slice(0, limit)
  const counts: Record<Classification, number> = { redeem: 0, rebalance: 0, external: 0 }
  for (const f of flows) counts[f.classification]++
  const subtitle =
    flows.length === 0
      ? "Outflows >= $1M, last 90 days"
      : `showing ${shown.length} of ${flows.length} — ${counts.rebalance} rebalance, ${counts.redeem} redeem, ${counts.external} external`

  return (
    <GlassCard className="p-5">
      <SectionHead title="Recent flows — outflows >= $1M, last 90 days" subtitle={subtitle} />
      {flows.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--color-text-ghost)]">
          No flows in the last 90 days.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-[var(--color-text-ghost)]">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Chain</th>
                <th className="py-2 pr-4 font-medium">From</th>
                <th className="py-2 pr-4 font-medium">To</th>
                <th className="py-2 pr-4 font-medium">Asset</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={`${f.chain}-${f.txHash}-${f.to}-${f.asset}`} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-4 font-mono text-[var(--color-text-ghost)]">{fmtDate(f.timestamp)}</td>
                  <td className="py-2 pr-4">{f.chain}</td>
                  <td className="py-2 pr-4 font-mono">{label(f.from)}</td>
                  <td className="py-2 pr-4 font-mono">{label(f.to)}</td>
                  <td className="py-2 pr-4">{f.asset}</td>
                  <td className="py-2 pr-4 text-right font-mono">{fmtUsd(f.amountUsd)}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <Tag tone={CLASS_TONE[f.classification]}>{f.classification}</Tag>
                      {f.confidence === "low" && <Tag tone="warn">low confidence</Tag>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}
