type Tone = "ok" | "risk" | "warn" | "ghost"

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-[color:rgba(48,209,88,0.25)]",
  risk: "bg-[var(--color-risk-soft)] text-[var(--color-risk)] border-[color:rgba(255,69,58,0.25)]",
  warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-[color:rgba(255,159,10,0.25)]",
  ghost:
    "bg-[color:rgba(255,255,255,0.05)] text-[var(--color-text-ghost)] border-[var(--color-border)]",
}

export function Tag({
  tone = "ghost",
  children,
}: {
  tone?: Tone
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-[3px] font-mono text-[10px] tracking-[0.04em] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
