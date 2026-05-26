import { fmtUsd } from "@/lib/format"
import type { Reconciliation, ReconciliationStatus } from "@/lib/views/reconciliation"
import { SectionHead } from "@/components/ui/section-head"
import { Tag } from "@/components/ui/tag"
import { AssetIcon } from "@/components/ui/asset-icon"
import { CoverageBar } from "@/components/ui/coverage-bar"

function fmtGap(usd: number): string {
  if (Math.abs(usd) < 5e5) return "≈ $0"
  return (usd > 0 ? "+" : "−") + fmtUsd(Math.abs(usd))
}

const STATUS_TONE: Record<ReconciliationStatus, "ok" | "risk" | "ghost"> = {
  verified: "ok",
  gap: "risk",
  "off-chain": "ghost",
}

const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  verified: "verified",
  gap: "gap",
  "off-chain": "off-chain",
}

export function ReconciliationPanel({ data }: { data: Reconciliation }) {
  return (
    <div>
      <SectionHead
        title="Per-asset reconciliation"
        subtitle="Ethena reported vs on-chain verified. Off-chain rows have no reader (XRPL, Copper) — their gap is structural."
        status={<Tag tone="ghost">{fmtGap(data.gapTotal)} unverified</Tag>}
      />
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
            <th className="py-2 pl-3 pr-3 font-medium">Asset</th>
            <th className="py-2 pr-3 text-right font-medium">Reported</th>
            <th className="py-2 pr-3 text-right font-medium">On-chain</th>
            <th className="py-2 pr-3 font-medium">Coverage</th>
            <th className="py-2 pr-3 text-right font-medium">Δ</th>
            <th className="py-2 pr-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr
              key={r.asset}
              className="border-b border-dashed border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-elev)]"
            >
              <td className="py-2.5 pl-3 pr-3">
                <span className="flex items-center gap-2.5">
                  <AssetIcon symbol={r.asset} />
                  <span className="text-[var(--color-text)]">{r.asset}</span>
                </span>
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-[var(--color-text)]">
                {fmtUsd(r.ethenaUsd)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-[var(--color-text)]">
                {fmtUsd(r.onchainUsd)}
              </td>
              <td className="py-2.5 pr-3" style={{ width: 140 }}>
                {r.status === "off-chain" ? (
                  <span className="text-[10px] text-[var(--color-text-ghost)]">n/a</span>
                ) : (
                  <CoverageBar value={r.onchainUsd} reported={r.ethenaUsd} />
                )}
              </td>
              <td
                className={`py-2.5 pr-3 text-right font-mono ${
                  r.status === "verified"
                    ? "text-[var(--color-ok)]"
                    : r.status === "gap"
                      ? "text-[var(--color-risk)]"
                      : "text-[var(--color-text-ghost)]"
                }`}
              >
                {fmtGap(r.gapUsd)}
              </td>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <Tag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                  {r.note ? (
                    <span className="truncate text-[10px] text-[var(--color-text-ghost)]">
                      {r.note}
                    </span>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-[var(--color-text-dim)]">
            <td className="py-2.5 pl-3 pr-3 text-[10px] uppercase tracking-[0.1em]">Total</td>
            <td className="py-2.5 pr-3 text-right font-mono">{fmtUsd(data.ethenaTotal)}</td>
            <td className="py-2.5 pr-3 text-right font-mono">{fmtUsd(data.onchainTotal)}</td>
            <td />
            <td className="py-2.5 pr-3 text-right font-mono">{fmtGap(data.gapTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
