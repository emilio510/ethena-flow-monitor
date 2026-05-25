import Link from "next/link"
import { DataAge } from "./data-age"
import { ETHENA_WALLETS } from "@/config/wallets"

export function Header({
  renderedAt,
  failedWallets,
}: {
  renderedAt?: number
  failedWallets?: string[]
}) {
  const hasFailures = failedWallets && failedWallets.length > 0
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[color:rgba(10,10,12,0.6)] backdrop-blur-[20px]">
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="text-[13px] font-medium tracking-[-0.01em] text-[var(--color-text)]">
            Ethena Flow Monitor
          </span>
          <span className="hidden text-[11px] text-[var(--color-text-ghost)] md:inline">
            Recursive-loop exposure across Aave, Morpho, Kamino &amp; Jupiter
          </span>
        </Link>
        {renderedAt ? <DataAge timestamp={renderedAt} /> : null}
      </div>
      {hasFailures ? (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-md border border-[color:rgba(255,69,58,0.25)] bg-[var(--color-risk-soft)] px-3 py-2 font-mono text-[11px] text-[var(--color-risk)]">
          <span className="font-medium">Partial data</span>
          <span className="text-[var(--color-text-ghost)]">
            {failedWallets!.length} of {ETHENA_WALLETS.length} Ethena wallet
            {failedWallets!.length === 1 ? "" : "s"} failed; figures may be understated
          </span>
        </div>
      ) : null}
    </header>
  )
}
