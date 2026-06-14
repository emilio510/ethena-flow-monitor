// Asset/token logos vendored from bgd-labs/web3-icons into public/icons/assets.
// Server-renderable (no onError): we gate on a known-available set and render
// the on-brand letter-pill fallback for symbols we don't have a logo for
// (Ethena-specific / exotic: JAAA, STAC, jleUSDG, sUSDtb, PT-*, …).
const AVAILABLE = new Set([
  "usde", "susde", "usdtb", "usdc", "usdt", "usdt0", "usdm", "usds", "pyusd",
  "musd", "usdg", "rlusd", "weth", "wbtc", "wsteth", "weeth", "cbbtc", "lbtc",
  "tbtc", "xaut", "xaut0", "gho", "fbtc", "wmnt", "syrupusdc", "syrupusdt", "susd",
])

/** Normalise a display symbol to the vendored icon key (lowercase, strip a
 *  leading "a"/"stata" aToken prefix is NOT done — we want the underlying). */
function iconKey(symbol: string): string {
  return symbol.toLowerCase()
}

export function AssetIcon({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const key = iconKey(symbol)
  if (AVAILABLE.has(key)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/icons/assets/${key}.svg`}
        alt={symbol}
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        style={{ width: size, height: size }}
      />
    )
  }
  // Fallback: neutral glass pill with the symbol's first character.
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[color:rgba(255,255,255,0.06)] font-medium text-[var(--color-text-ghost)]"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.45), lineHeight: 1 }}
      aria-label={symbol}
      title={symbol}
    >
      {symbol.replace(/^PT-/, "").charAt(0).toUpperCase()}
    </span>
  )
}
