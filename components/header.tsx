import Link from "next/link"

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)] px-6 py-4">
      <Link href="/" className="text-[var(--color-accent)] uppercase tracking-wider">
        Ethena Flow Monitor
      </Link>
      <span className="ml-3 text-xs text-[var(--color-text-muted)]">
        Recursive-loop exposure on Aave V3
      </span>
    </header>
  )
}
