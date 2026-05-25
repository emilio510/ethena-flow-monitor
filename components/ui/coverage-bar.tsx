type Tone = "ok" | "warn" | "risk"

const TONE_BG: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  risk: "var(--color-risk)",
}

function tone(coverage: number): Tone {
  if (coverage >= 0.95) return "ok"
  if (coverage >= 0.8) return "warn"
  return "risk"
}

export function CoverageBar({
  value,
  reported,
}: {
  /** On-chain (verified) value in USD. */
  value: number
  /** Reported value in USD -- denominator. */
  reported: number
}) {
  const coverage = reported > 0 ? value / reported : 0
  const widthPct = Math.min(100, Math.max(0, coverage * 100))
  const t = tone(coverage)
  return (
    <div className="h-[4px] w-full overflow-hidden rounded-sm bg-[color:rgba(255,255,255,0.06)]">
      <div
        data-fill
        data-tone={t}
        className="h-full rounded-sm"
        style={{ width: `${widthPct}%`, background: TONE_BG[t] }}
      />
    </div>
  )
}
