type Variant = "ethena" | "pt" | "anomaly" | "passive" | "default"

const STYLES: Record<Variant, string> = {
  ethena: "border-[var(--color-success)]   text-[var(--color-success)]",
  pt: "border-[var(--color-pt-tag)]    text-[var(--color-pt-tag)]",
  anomaly: "border-[var(--color-recursion)] text-[var(--color-recursion)]",
  passive: "border-[var(--color-success)]   text-[var(--color-success)]",
  default: "border-[var(--color-border)]    text-[var(--color-text-muted)]",
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
      className={`inline-block rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${STYLES[variant]}`}
    >
      {children}
    </span>
  )
}
