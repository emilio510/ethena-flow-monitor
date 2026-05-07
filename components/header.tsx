import Link from "next/link"
import { DataAge } from "./data-age"

export function Header({
  renderedAt,
  failedWallets,
}: {
  /** Server-render timestamp (epoch ms). Drives the "Updated X ago" pill so
   *  users can see how stale the ISR-cached page is. */
  renderedAt?: number
  failedWallets?: string[]
}) {
  const hasFailures = failedWallets && failedWallets.length > 0
  return (
    <header>
      <div className="border-b border-[var(--color-border)] px-8 py-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-ghost)]">
          Ethena Flow Monitor · Aave V3 Recursive-Loop Exposure
        </div>
      </div>
      <div className="flex items-center justify-between px-8 pt-6 pb-5">
        <Link href="/" className="text-[22px] tracking-tight text-[var(--color-text)]">
          On-Chain Lending Risk
        </Link>
        {renderedAt ? <DataAge timestamp={renderedAt} /> : null}
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
