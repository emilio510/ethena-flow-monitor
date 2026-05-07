import { notFound } from "next/navigation"
import {
  loadVaultView,
  VaultNotFoundError,
  isMorphoChain,
} from "@/lib/views/vault"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { ChainIcon } from "@/components/chain-icon"
import { Tag } from "@/components/tag"
import { VaultAllocationPanel } from "@/components/vault-allocation-panel"
import { fmtUsd, fmtPct, shortAddr } from "@/lib/format"

export const revalidate = 300
export const maxDuration = 90

export default async function Page({
  params,
}: {
  params: Promise<{ chain: string; address: string }>
}) {
  const { chain, address } = await params
  if (!isMorphoChain(chain)) notFound()

  let view
  try {
    view = await loadVaultView(chain, address)
  } catch (err) {
    if (err instanceof VaultNotFoundError) notFound()
    throw err
  }

  return (
    <main>
      <Header />
      <section className="px-8 pb-12">
        <div className="mb-2 flex items-baseline gap-3">
          <h1 className="text-[28px] tracking-tight text-[var(--color-accent)]">
            {view.name}
          </h1>
          <span className="text-[13px] text-[var(--color-text-dim)]">on</span>
          <span className="flex items-center gap-2">
            <ChainIcon chain={view.chain} size={18} />
            <span className="text-[13px] capitalize text-[var(--color-text)]">
              {view.chain}
            </span>
          </span>
          <span className="text-[var(--color-text-ghost)]">·</span>
          <span className="text-[12px] uppercase tracking-[0.05em] text-[var(--color-text-ghost)]">
            Morpho Blue
          </span>
        </div>
        <div className="mb-7 text-[12px] text-[var(--color-text-ghost)]">
          {view.assetSymbol} vault · {shortAddr(view.address)}
        </div>

        <KpiStrip>
          <KpiCard label="Vault TVL" value={fmtUsd(view.totalAssetsUsd)} />
          <KpiCard label="Underlying" value={view.assetSymbol} />
          <KpiCard label="Ethena supplied" value={fmtUsd(view.ethenaSuppliedUsd)} />
          <KpiCard label="Ethena share" value={fmtPct(view.ethenaShareOfVault)} />
          <KpiCard label="Vault recursion" value={fmtPct(view.vaultRecursionShare)} />
          <KpiCard
            label="Recursion score"
            value={fmtPct(view.recursionScore)}
            tone="recursion"
          />
        </KpiStrip>

        <div className="mt-8">
          <VaultAllocationPanel
            totalAssetsUsd={view.totalAssetsUsd}
            vaultRecursionShare={view.vaultRecursionShare}
            allocation={view.allocation}
          />
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
            Ethena depositors in this vault
          </h2>
          <div className="border border-[var(--color-border)]">
            <div className="grid grid-cols-[40px_minmax(0,1.5fr)_110px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-ghost)]">
              <div>#</div>
              <div>Wallet</div>
              <div></div>
              <div className="text-right">Supplied</div>
              <div className="text-right">Share of Vault</div>
            </div>
            {view.ethenaDepositors.length === 0 ? (
              <div className="px-4 py-3 text-[12px] text-[var(--color-text-ghost)]">
                No Ethena wallets currently deposited in this vault.
              </div>
            ) : (
              view.ethenaDepositors.map((d, i) => (
                <div
                  key={d.walletAddress + i}
                  className="grid grid-cols-[40px_minmax(0,1.5fr)_110px_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[var(--color-border)] px-4 py-2.5"
                >
                  <div className="text-[12px] text-[var(--color-text-ghost)]">
                    #{i + 1}
                  </div>
                  <div className="text-[13px] text-[var(--color-accent)]">
                    {shortAddr(d.walletAddress)}
                  </div>
                  <div>
                    <Tag variant="ethena">Ethena</Tag>
                  </div>
                  <div className="text-right text-[13px] text-[var(--color-text)]">
                    {fmtUsd(d.ethenaSuppliedUsd)}
                  </div>
                  <div className="relative">
                    <div
                      className="absolute inset-y-0 right-0 rounded-sm bg-[color:rgb(245_204_76_/_0.12)]"
                      style={{ width: `${Math.min(100, d.shareOfVault * 100)}%` }}
                      aria-hidden
                    />
                    <div className="relative px-2 py-0.5 text-right text-[13px] text-[var(--color-text)]">
                      {fmtPct(d.shareOfVault)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
