import { GlassCard } from "@/components/ui/glass-card"

const DEFAULT_THRESHOLD = 0.2

export function HeroMeter({
  label,
  ratio,
  rightCaption,
  threshold = DEFAULT_THRESHOLD,
}: {
  label: string
  /** 0..1 fraction -- drives bar fill and value display. */
  ratio: number
  /** Right-aligned caption (e.g. "$1.31B of $6.42B"). */
  rightCaption: React.ReactNode
  /** Pulse the value above this fraction. */
  threshold?: number
}) {
  const pct = ratio * 100
  const fillPct = Math.min(100, Math.max(0, pct))
  const pulse = ratio > threshold
  const pulseStyle = pulse
    ? {
        animation:
          "efm-rise 700ms var(--ease-out) 200ms forwards, efm-risk-pulse 3s ease-in-out 1.5s infinite",
      }
    : {
        animation: "efm-rise 700ms var(--ease-out) 200ms forwards",
      }
  const fillAnimation = pulse
    ? "efm-fill var(--dur-meter) var(--ease-out) 400ms forwards, efm-glow-pulse 3s ease-in-out 1.5s infinite"
    : "efm-fill var(--dur-meter) var(--ease-out) 400ms forwards"
  return (
    <GlassCard className="flex flex-col justify-between p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
            {label}
          </div>
          <div
            data-meter-value
            data-pulse={pulse}
            className="mt-1 font-mono text-[36px] font-light leading-none tracking-[-0.03em] text-[var(--color-risk)] opacity-0"
            style={pulseStyle}
          >
            {pct.toFixed(1)}
            <span className="ml-[2px] text-[22px] text-[var(--color-text-ghost)]">%</span>
          </div>
        </div>
        <div className="text-right font-mono text-[10px] leading-[1.5] text-[var(--color-text-ghost)]">
          {rightCaption}
        </div>
      </div>
      <div className="mt-4 h-[8px] overflow-hidden rounded-sm bg-[color:rgba(255,255,255,0.06)]">
        <div
          data-meter-fill
          className="h-full rounded-sm bg-[var(--color-risk)]"
          style={{
            width: 0,
            ["--efm-fill-to" as string]: `${fillPct}%`,
            animation: fillAnimation,
            boxShadow: "0 0 10px rgba(255,69,58,0.4)",
          }}
        />
      </div>
    </GlassCard>
  )
}
