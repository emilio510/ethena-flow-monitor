import { loadFootprint } from "@/lib/views/footprint"
import { getUsdeCirculatingSupply } from "@/lib/onchain/usde-supply"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { HeroMeter } from "@/components/ui/hero-meter"
import { FootprintTable } from "@/components/footprint-table"
import { TokenBalanceTable } from "@/components/token-balance-table"
import { ReconciliationPanel } from "@/components/reconciliation-panel"
import { MonitoredWalletsTable } from "@/components/monitored-wallets-table"
import { FlowsTable } from "@/components/flows-table"
import { GlassCard } from "@/components/ui/glass-card"
import { buildReconciliation } from "@/lib/views/reconciliation"
import { FlowsFileSchema } from "@/lib/flows/types"
import { Tag } from "@/components/ui/tag"
import { fmtUsd, fmtPct } from "@/lib/format"
import { AssetIcon } from "@/components/asset-icon"
import { custodialValue, fetchBackingAssets, totalBacking } from "@/lib/ethena"
import type { BackingSnapshot } from "@/lib/ethena"
import flowsData from "@/data/ethena-flows.json"

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
  const flows = FlowsFileSchema.parse(flowsData)
  // Fetch Ethena's snapshot first so loadFootprint can use it for Solana
  // attribution. Cheap (single edge-cached GET) — the rest fans out behind it.
  const ethenaSnapshot = await safeFetchBacking()
  const footprint = await loadFootprint({ ethenaSnapshot: ethenaSnapshot ?? undefined })
  // USDe circulating supply, read independently on-chain (mainnet totalSupply =
  // global supply; not from the lagging snapshot). null on read failure.
  const usdeSupply = await getUsdeCirculatingSupply()
  const {
    rows,
    failedWallets,
    walletInventory,
    deployedUsd,
    idle,
    recursiveUsd,
    untrackedHoldings,
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
  // Recursive-exposure denominator: prefer USDe circulating supply (on-chain,
  // authoritative, always-current) over the lagging snapshot backing total —
  // "what share of circulating USDe is sitting in recursive loops". Falls back
  // to backing when the on-chain supply read failed.
  const recursionDenom = usdeSupply && usdeSupply > 0 ? usdeSupply : backingBase
  const nonRecursiveUsd = Math.max(0, recursionDenom - recursiveUsd)
  // Backing-vs-supply coverage: does reported backing keep up with the USDe
  // actually circulating on-chain? null when the supply read failed.
  const supplyCoverage = usdeSupply && usdeSupply > 0 ? backingBase / usdeSupply : null

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
              <div className="mt-3">
                <Tag tone={verifierOk ? "ok" : "warn"}>
                  {verifierOk ? "✓" : "⚠"} on-chain {verifierDeltaPct >= 0 ? "+" : ""}
                  {fmtPct(verifierDeltaPct)} vs Ethena reported
                </Tag>
              </div>
            ) : (
              <div className="mt-3">
                <Tag tone="ghost">on-chain only — Ethena API unavailable</Tag>
              </div>
            )}
            {usdeSupply !== null ? (
              <div className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-ghost)]">
                vs{" "}
                <span className="font-mono text-[var(--color-text)]">{fmtUsd(usdeSupply)}</span>{" "}
                USDe circulating supply (on-chain)
                {supplyCoverage !== null ? (
                  <>
                    {" — backing covers "}
                    <span className="font-mono text-[var(--color-text)]">
                      {fmtPct(supplyCoverage)}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <HeroMeter
            refractive
            label="Recursive exposure"
            ratio={recursionDenom > 0 ? recursiveUsd / recursionDenom : 0}
            rightCaption={
              <>
                {fmtUsd(recursiveUsd)}
                <br />
                of {fmtUsd(recursionDenom)}
                {usdeSupply && usdeSupply > 0 ? " USDe supply" : " backing"}
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
          <GlassCard refractive className="p-5">
            <FootprintTable rows={rows} />
          </GlassCard>
        </div>
        <div className="mt-8">
          <GlassCard refractive className="p-5">
            <TokenBalanceTable
              rows={idle.rows}
              total={idle.totalUsd}
              title="Idle backing — not deployed in lending"
              shareLabel="Share of Idle"
            />
          </GlassCard>
        </div>
        {idle.reserveFundRows.length > 0 ? (
          <div className="mt-8">
            <GlassCard refractive className="p-5">
              <TokenBalanceTable
                rows={idle.reserveFundRows}
                total={idle.reserveFundTotalUsd}
                title="Reserve fund — insurance, excluded from backing"
                shareLabel="Share of Fund"
                note="Held in a dedicated wallet as a solvency backstop. Ethena's reported backing total excludes it, so the figures above do too — it is shown here for completeness only."
              />
            </GlassCard>
          </div>
        ) : null}
        {reconciliation ? (
          <div className="mt-8">
            <GlassCard refractive className="p-5">
              <ReconciliationPanel data={reconciliation} />
            </GlassCard>
          </div>
        ) : null}
        <div className="mt-8">
          <GlassCard refractive className="p-5">
            <MonitoredWalletsTable rows={walletInventory} />
          </GlassCard>
        </div>
        {untrackedHoldings.length > 0 ? (
          <div className="mt-8">
            <GlassCard refractive className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Tag tone="warn">Untracked holdings — needs triage</Tag>
              </div>
              <p className="mb-3 text-xs text-[var(--color-text-ghost)]">
                The following EVM token positions are above $1M but are not in
                the tracked allowlist. They are NOT included in any backing
                total. Add to <code>config/idle-tokens.ts</code> once confirmed.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
                    <th className="pb-2 pr-4">Symbol / Address</th>
                    <th className="pb-2 pr-4">Chain</th>
                    <th className="pb-2 pr-4">Wallet</th>
                    <th className="pb-2 text-right">Value (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {untrackedHoldings.map((h, i) => (
                    <tr key={i} className="border-t border-[var(--color-border)]">
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-2 font-mono text-xs">
                          <AssetIcon symbol={h.symbol} size={16} />
                          {h.symbol}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs">{h.chain}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {h.wallet.slice(0, 6)}…{h.wallet.slice(-4)}
                      </td>
                      <td className="py-2 text-right font-mono text-xs">
                        {fmtUsd(h.valueUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </div>
        ) : null}
        <div className="mt-8">
          <FlowsTable flows={flows} />
        </div>
      </section>
    </main>
  )
}
