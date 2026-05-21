/**
 * Refresh the committed Ethena snapshot files used by the Vercel build.
 *
 * Why: Ethena's API sits behind Cloudflare anti-bot that challenges Vercel
 * egress, so live-fetching from prod isn't reliable. We commit a snapshot
 * and let the build read it as a static import.
 *
 * Usage (from a residential network, e.g. your laptop):
 *
 *   node --experimental-strip-types scripts/refresh-ethena-snapshot.ts
 *   git add data && git commit -m "chore: refresh ethena snapshot" && git push
 *
 * The page re-renders on the next deploy (or after the ISR window) with
 * the fresh data.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const SOURCES = [
  {
    url: "https://app.ethena.fi/api/positions/current/backing-assets",
    file: "data/ethena-snapshot.json",
  },
  {
    url: "https://app.ethena.fi/api/stablecoin-collateral",
    file: "data/ethena-stables.json",
  },
]

// Browser-mimicking headers. Ethena's Cloudflare front challenges
// datacenter egress (Vercel, GitHub Actions); a full browser header set
// plus retries is our best shot at slipping through on a datacenter IP.
const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://app.ethena.fi/dashboards/backing-assets",
  Origin: "https://app.ethena.fi",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
}

async function fetchJson(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000))
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) continue
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("json")) continue
    return await res.text()
  }
  return null
}

for (const { url, file } of SOURCES) {
  const text = await fetchJson(url)
  if (!text) {
    console.error(`✗ ${file}: Cloudflare challenge after 5 attempts`)
    process.exit(1)
  }
  writeFileSync(join(ROOT, file), text + "\n")
  const sizeKb = (text.length / 1024).toFixed(1)
  console.log(`✓ ${file} (${sizeKb} KiB)`)
}
