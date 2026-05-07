"use client"

import { useEffect, useState } from "react"

/** "Updated X ago" pill driven by the server-render timestamp.
 *  - SSR initially renders with `now = timestamp` so the first paint matches
 *    server output and avoids hydration mismatch.
 *  - On mount the client switches to real `Date.now()` and ticks every 30s.
 *  Because the page is ISR-cached, `timestamp` reflects when this specific
 *  page was last rendered — different routes may show different ages. */
export function DataAge({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(timestamp)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000))
  const text =
    diffSec < 30
      ? "just now"
      : diffSec < 60
        ? `${diffSec}s ago`
        : diffSec < 3600
          ? `${Math.floor(diffSec / 60)} min ago`
          : `${Math.floor(diffSec / 3600)}h ${Math.floor((diffSec % 3600) / 60)}m ago`

  return (
    <div className="flex items-center gap-2 rounded-md border border-[color:rgb(93_214_197_/_0.3)] bg-[color:rgb(93_214_197_/_0.06)] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-success)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
      <span suppressHydrationWarning>Updated {text}</span>
    </div>
  )
}
