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
    <span
      className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(48,209,88,0.3)] bg-[var(--color-ok-soft)] px-2.5 py-[3px] font-mono text-[10px] text-[var(--color-ok)]"
      title={new Date(timestamp).toISOString()}
    >
      <span
        aria-hidden
        className="h-[6px] w-[6px] rounded-full bg-current"
        style={{ boxShadow: "0 0 8px currentColor" }}
      />
      <span suppressHydrationWarning>live · {text}</span>
    </span>
  )
}
