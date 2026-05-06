"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[ethena-flow-monitor] route error:", error.message, error.digest)
  }, [error])

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-recursion)]">
          Something went wrong
        </div>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          The dashboard could not load this page. The TokenLogic API may be down or
          unreachable. Try again, or come back in a moment.
        </p>
        {error.digest ? (
          <p className="mb-4 text-xs text-[var(--color-text-muted)]">
            Error reference: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="border border-[var(--color-accent)] px-3 py-1 text-xs uppercase tracking-wider text-[var(--color-accent)] hover:bg-[var(--color-bg)]"
        >
          Retry
        </button>
      </div>
    </main>
  )
}
