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

for (const { url, file } of SOURCES) {
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`✗ ${file}: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const ct = res.headers.get("content-type") ?? ""
  if (!ct.includes("json")) {
    const body = await res.text()
    console.error(`✗ ${file}: got ${ct}, first 200: ${body.slice(0, 200)}`)
    process.exit(1)
  }
  const text = await res.text()
  writeFileSync(join(ROOT, file), text + "\n")
  const sizeKb = (text.length / 1024).toFixed(1)
  console.log(`✓ ${file} (${sizeKb} KiB)`)
}
