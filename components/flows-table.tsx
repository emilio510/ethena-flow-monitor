"use client"

import { useMemo, useState } from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { SectionHead } from "@/components/ui/section-head"
import { Tag } from "@/components/ui/tag"
import { fmtUsd, shortAddr } from "@/lib/format"
import { KNOWN_WALLET_LABELS } from "@/config/wallets"
import type { Flow, Classification, FlowChain } from "@/lib/flows/types"

const PAGE_SIZE = 50

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

/** Block explorer for a flow's chain. Flows are only ethereum | xrpl today. */
function txUrl(chain: FlowChain, hash: string): string {
  return chain === "xrpl"
    ? `https://xrpscan.com/tx/${hash}`
    : `https://etherscan.io/tx/${hash}`
}
function addrUrl(chain: FlowChain, addr: string): string {
  return chain === "xrpl"
    ? `https://xrpscan.com/account/${addr}`
    : `https://etherscan.io/address/${addr}`
}

const linkCls =
  "font-mono text-[var(--color-text-dim)] hover:text-[var(--color-accent)] hover:underline"

export function FlowsTable({ flows }: { flows: Flow[]; limit?: number }) {
  const [page, setPage] = useState(0)
  const sorted = useMemo(() => [...flows].sort((a, b) => b.timestamp - a.timestamp), [flows])

  const counts: Record<Classification, number> = { redeem: 0, rebalance: 0, external: 0 }
  for (const f of flows) counts[f.classification]++

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const start = clampedPage * PAGE_SIZE
  const shown = sorted.slice(start, start + PAGE_SIZE)

  const subtitle =
    flows.length === 0
      ? "outflows >= $1M, last 90 days"
      : `${flows.length} flows — ${counts.rebalance} rebalance, ${counts.redeem} redeem, ${counts.external} external`

  return (
    <GlassCard className="p-5">
      <SectionHead title="Recent flows — outflows >= $1M, last 90 days" subtitle={subtitle} />
      {flows.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--color-text-ghost)]">
          No flows in the last 90 days.
        </p>
      ) : (
        <>
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
                  <th className="py-2 pr-4 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((f, i) => (
                  <tr
                    key={`${f.chain}-${f.txHash}-${f.to}-${f.asset}-${start + i}`}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="py-2 pr-4 font-mono text-[var(--color-text-ghost)]">
                      {fmtDate(f.timestamp)}
                    </td>
                    <td className="py-2 pr-4">{f.chain}</td>
                    <td className="py-2 pr-4">
                      <a href={addrUrl(f.chain, f.from)} target="_blank" rel="noreferrer" className={linkCls}>
                        {label(f.from)}
                      </a>
                    </td>
                    <td className="py-2 pr-4">
                      <a href={addrUrl(f.chain, f.to)} target="_blank" rel="noreferrer" className={linkCls}>
                        {label(f.to)}
                      </a>
                    </td>
                    <td className="py-2 pr-4">{f.asset}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtUsd(f.amountUsd)}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <Tag tone={CLASS_TONE[f.classification]}>{f.classification}</Tag>
                        {f.confidence === "low" && <Tag tone="warn">low confidence</Tag>}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <a
                        href={txUrl(f.chain, f.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className={linkCls}
                        title={f.txHash}
                      >
                        {shortAddr(f.txHash)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--color-text-ghost)]">
            <span>
              {start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)} of {sorted.length}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1 enabled:hover:bg-[var(--color-bg-elev)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="tabular-nums">
                Page {clampedPage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage >= pageCount - 1}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1 enabled:hover:bg-[var(--color-bg-elev)] disabled:opacity-40"
              >
                Next →
              </button>
            </span>
          </div>
        </>
      )}
    </GlassCard>
  )
}
