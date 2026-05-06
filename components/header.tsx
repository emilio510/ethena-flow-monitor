import Link from "next/link"

export function Header({
  freshness,
  failedWallets,
}: {
  freshness?: string
  failedWallets?: string[]
}) {
  const hasFailures = failedWallets && failedWallets.length > 0
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Link href="/" className="text-[var(--color-accent)] uppercase tracking-wider">
            Ethena Flow Monitor
          </Link>
          <span className="ml-3 text-xs text-[var(--color-text-muted)]">
            Recursive-loop exposure on Aave V3
          </span>
        </div>
        {freshness ? (
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Data as of {freshness}
          </span>
        ) : null}
      </div>
      {hasFailures ? (
        <div className="border-t border-[var(--color-recursion)] bg-[var(--color-bg-card)] px-6 py-2 text-[10px] uppercase tracking-wider text-[var(--color-recursion)]">
          Partial data: {failedWallets!.length} of 11 Ethena wallet
          {failedWallets!.length === 1 ? "" : "s"} failed to fetch — figures may be understated
        </div>
      ) : null}
    </header>
  )
}
