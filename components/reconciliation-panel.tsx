import { fmtUsd } from "@/lib/format"
import type { Reconciliation, ReconciliationStatus } from "@/lib/views/reconciliation"

const COLS =
  "grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]"

const STATUS_TEXT: Record<ReconciliationStatus, string> = {
  verified: "text-[var(--color-success)]",
  gap: "text-[var(--color-recursion)]",
  "off-chain": "text-[var(--color-text-ghost)]",
}

const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  verified: "Verified",
  gap: "Gap",
  "off-chain": "Off-chain",
}

/** Signed USD — '+' kept for positive gaps so the direction is unambiguous. */
function fmtGap(usd: number): string {
  if (Math.abs(usd) < 5e5) return "≈ $0"
  return (usd > 0 ? "+" : "−") + fmtUsd(Math.abs(usd))
}

export function ReconciliationPanel({ data }: { data: Reconciliation }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          Backing reconciliation — Ethena reported vs on-chain verified
        </h2>
        <span className="text-[12px] text-[var(--color-text-ghost)]">
          {fmtGap(data.gapTotal)} unverified
        </span>
      </div>
      <p className="mb-3 text-[11px] text-[var(--color-text-ghost)]">
        Per-asset breakdown of the verifier badge. Reserve fund excluded from
        both sides. &ldquo;Off-chain&rdquo; rows have no reader (XRP Ledger,
        Copper custody) — their gap is structural, not a data error.
      </p>
      <div className="border border-[var(--color-border)]">
        <div
          className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]`}
        >
          <div>Asset</div>
          <div className="text-right">Ethena reported</div>
          <div className="text-right">On-chain verified</div>
          <div className="text-right">Gap</div>
          <div>Status</div>
        </div>
        {data.rows.map((r) => (
          <div
            key={r.asset}
            className={`grid ${COLS} items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5`}
          >
            <div className="text-[13px] text-[var(--color-accent)]">{r.asset}</div>
            <div className="text-right text-[13px] text-[var(--color-text)]">
              {fmtUsd(r.ethenaUsd)}
            </div>
            <div className="text-right text-[13px] text-[var(--color-text)]">
              {fmtUsd(r.onchainUsd)}
            </div>
            <div className={`text-right text-[13px] ${STATUS_TEXT[r.status]}`}>
              {fmtGap(r.gapUsd)}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-[11px] uppercase tracking-[0.06em] ${STATUS_TEXT[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
              {r.note ? (
                <span className="truncate text-[10px] text-[var(--color-text-ghost)]">
                  {r.note}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        <div
          className={`grid ${COLS} items-center gap-4 px-4 py-2.5 text-[var(--color-text-dim)]`}
        >
          <div className="text-[12px] uppercase tracking-[0.08em]">Total</div>
          <div className="text-right text-[13px]">{fmtUsd(data.ethenaTotal)}</div>
          <div className="text-right text-[13px]">{fmtUsd(data.onchainTotal)}</div>
          <div className="text-right text-[13px]">{fmtGap(data.gapTotal)}</div>
          <div />
        </div>
      </div>
    </div>
  )
}
