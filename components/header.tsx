import Link from "next/link"

export function Header({ freshness }: { freshness?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
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
    </header>
  )
}
