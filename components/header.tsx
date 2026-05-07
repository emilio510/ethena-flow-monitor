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
    <header>
      <div className="flex items-center justify-between px-8 pt-7 pb-6">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-[var(--color-text)]"
          >
            Ethena Flow Monitor
          </Link>
          <span className="text-[12px] text-[var(--color-text-ghost)]">
            Recursive-loop exposure on Aave V3
          </span>
        </div>
        {freshness ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
            <span className="mono">As of {freshness}</span>
          </div>
        ) : null}
      </div>
      {hasFailures ? (
        <div className="mx-8 mb-4 flex items-center gap-2 rounded-md bg-[color:rgb(239_68_68_/_0.08)] px-3 py-2 text-[11px] text-[var(--color-recursion)]">
          <span className="font-medium">Partial data</span>
          <span className="text-[var(--color-text-dim)]">
            {failedWallets!.length} of 11 Ethena wallet
            {failedWallets!.length === 1 ? "" : "s"} failed; figures may be understated
          </span>
        </div>
      ) : null}
    </header>
  )
}
