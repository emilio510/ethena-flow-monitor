type Variant = "ethena" | "pt" | "anomaly" | "passive" | "default"

const STYLES: Record<Variant, string> = {
  ethena:
    "border-[color:rgb(52_211_153_/_0.4)]   text-[var(--color-success)]   bg-[color:rgb(52_211_153_/_0.06)]",
  pt:
    "border-[color:rgb(245_158_11_/_0.4)]   text-[var(--color-pt-tag)]    bg-[color:rgb(245_158_11_/_0.06)]",
  anomaly:
    "border-[color:rgb(239_68_68_/_0.4)]    text-[var(--color-recursion)] bg-[color:rgb(239_68_68_/_0.06)]",
  passive:
    "border-[color:rgb(52_211_153_/_0.4)]   text-[var(--color-success)]   bg-[color:rgb(52_211_153_/_0.06)]",
  default:
    "border-[var(--color-border-subtle)]    text-[var(--color-text-dim)]",
}

export function Tag({
  variant = "default",
  children,
}: {
  variant?: Variant
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.08em] ${STYLES[variant]}`}
    >
      {children}
    </span>
  )
}
