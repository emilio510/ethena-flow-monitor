export function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`
  return `${sign}$${abs.toFixed(2)}`
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}

export function shortAddr(addr: string): string {
  if (addr.length < 11) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
