import { loadFootprint } from "@/lib/views/footprint"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { HeroMeter } from "@/components/ui/hero-meter"
import { FootprintTable } from "@/components/footprint-table"
import { TokenBalanceTable } from "@/components/token-balance-table"
import { ReconciliationPanel } from "@/components/reconciliation-panel"
import { MonitoredWalletsTable } from "@/components/monitored-wallets-table"
import { buildReconciliation } from "@/lib/views/reconciliation"
import { fmtUsd, fmtPct } from "@/lib/format"
import { custodialValue, fetchBackingAssets, totalBacking } from "@/lib/ethena"
import type { BackingSnapshot } from "@/lib/ethena"

// 5-min ISR: keeps the cache warm during traffic but lets a failed render
// (e.g. a transient CF challenge that drops Ethena's API path) heal
// quickly. Previously 3600s meant a single bad render lingered for an hour.
export const revalidate = 300
// View A walks every borrower across every market Ethena touches; this
// can run 30-60s on cold load against the busy ethereum + base markets.
export const maxDuration = 90

async function safeFetchBacking(): Promise<BackingSnapshot | null> {
  // Best-effort: if Ethena's API is down or its schema drifts, fall back to
  // the on-chain-only view rather than 500-ing the entire page. Log the
  // underlying failure (including undici's `cause` chain — that's where the
  // real DNS / TLS / ECONNRESET signal lives behind the generic
  // "fetch failed" wrapper) so Vercel runtime logs are useful.
  try {
    return await fetchBackingAssets()
  } catch (err) {
    const head = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    const cause =
      err instanceof Error && "cause" in err && err.cause
        ? ` | cause: ${describeCause(err.cause)}`
        : ""
    console.warn(`[ethena-flow-monitor] backing-assets fetch failed: ${head}${cause}`)
    return null
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: string }).code
    return `${cause.name}${code ? `(${code})` : ""}: ${cause.message}`
  }
  return String(cause)
}

export default async function Page() {
  const renderedAt = Date.now()
  // Fetch Ethena's snapshot first so loadFootprint can use it for Solana
  // attribution. Cheap (single edge-cached GET) — the rest fans out behind it.
  const ethenaSnapshot = await safeFetchBacking()
  const footprint = await loadFootprint({ ethenaSnapshot: ethenaSnapshot ?? undefined })
  const {
    rows,
    failedWallets,
    walletInventory,
    deployedUsd,
    idle,
    recursiveUsd,
  } = footprint
  const onchainBacking = deployedUsd + idle.totalUsd
  // Headline = Ethena's reported total when available, fall back to on-chain.
  const ethenaTotal = ethenaSnapshot ? totalBacking(ethenaSnapshot) : null
  const ethenaCustodial = ethenaSnapshot ? custodialValue(ethenaSnapshot) : null
  // Verifier delta: how far our on-chain reads are from Ethena's verifiable
  // (non-custodial) figure. Anything beyond ±2% is worth a yellow badge.
  const ethenaVerifiable =
    ethenaTotal !== null && ethenaCustodial !== null ? ethenaTotal - ethenaCustodial : null
  const verifierDeltaPct =
    ethenaVerifiable && ethenaVerifiable > 0
      ? (onchainBacking - ethenaVerifiable) / ethenaVerifiable
      : null
  const verifierOk = verifierDeltaPct !== null && Math.abs(verifierDeltaPct) < 0.02
  // Per-asset reconciliation — only when Ethena's snapshot is available.
  const reconciliation = ethenaSnapshot
    ? buildReconciliation(ethenaSnapshot, rows, idle.rows)
    : null
  // Recursive / non-recursive split of total backing. Recursive capital is
  // what's levered in loops; the rest is backing that stands on its own.
  const backingBase = ethenaTotal ?? onchainBacking
  const nonRecursiveUsd = Math.max(0, backingBase - recursiveUsd)

  return (
    <main>
      <Header renderedAt={renderedAt} failedWallets={failedWallets} />
      <section className="px-6 pt-8 pb-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
              Total backing
            </div>
            <div
              className="mt-2 font-mono text-[44px] font-light leading-none tracking-[-0.03em] text-[var(--color-text)] opacity-0"
              style={{ animation: "efm-rise 700ms var(--ease-out) 100ms forwards" }}
            >
              {ethenaTotal !== null ? fmtUsd(ethenaTotal) : fmtUsd(onchainBacking)}
            </div>
            {ethenaTotal !== null && verifierDeltaPct !== null ? (
              <span
                className={`mt-3 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                  verifierOk
                    ? "border-[color:rgba(48,209,88,0.25)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                    : "border-[color:rgba(255,159,10,0.25)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                }`}
              >
                {verifierOk ? "✓" : "⚠"} on-chain {verifierDeltaPct >= 0 ? "+" : ""}
                {fmtPct(verifierDeltaPct)} vs Ethena reported
              </span>
            ) : (
              <span className="mt-3 inline-flex rounded-full border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-ghost)]">
                on-chain only — Ethena API unavailable
              </span>
            )}
          </div>
          <HeroMeter
            label="Recursive exposure"
            ratio={backingBase > 0 ? recursiveUsd / backingBase : 0}
            rightCaption={
              <>
                {fmtUsd(recursiveUsd)}
                <br />
                of {fmtUsd(backingBase)}
              </>
            }
          />
        </div>
      </section>

      <section className="px-6 pb-6">
        <KpiStrip columns={4}>
          <KpiCard
            label="Custodial / off-chain"
            value={ethenaCustodial !== null ? fmtUsd(ethenaCustodial) : "—"}
            subValue="Copper + BTC-anchored"
          />
          <KpiCard label="Deployed in lending" value={fmtUsd(deployedUsd)} />
          <KpiCard label="Idle backing" value={fmtUsd(idle.totalUsd)} />
          <KpiCard label="Non-recursive backing" value={fmtUsd(nonRecursiveUsd)} />
        </KpiStrip>
      </section>

      <section className="px-6 pb-6">
        <div className="mt-6">
          <FootprintTable rows={rows} />
        </div>
        <div className="mt-8">
          <TokenBalanceTable
            rows={idle.rows}
            total={idle.totalUsd}
            title="Idle backing — not deployed in lending"
            shareLabel="Share of Idle"
          />
        </div>
        {idle.reserveFundRows.length > 0 ? (
          <div className="mt-8">
            <TokenBalanceTable
              rows={idle.reserveFundRows}
              total={idle.reserveFundTotalUsd}
              title="Reserve fund — insurance, excluded from backing"
              shareLabel="Share of Fund"
              note="Held in a dedicated wallet as a solvency backstop. Ethena's reported backing total excludes it, so the figures above do too — it is shown here for completeness only."
            />
          </div>
        ) : null}
        {reconciliation ? (
          <div className="mt-8">
            <ReconciliationPanel data={reconciliation} />
          </div>
        ) : null}
        <div className="mt-8">
          <MonitoredWalletsTable rows={walletInventory} />
        </div>
      </section>
    </main>
  )
}
