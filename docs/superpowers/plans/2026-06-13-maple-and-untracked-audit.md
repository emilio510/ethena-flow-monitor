# Maple position + EVM untracked-holdings alert — Spec + Plan

Date: 2026-06-13
Status: Approved (user chose: fix Maple + add EVM untracked-holdings alert)

## Problem
1. Wallet `0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c` holds **MPLhysUSDC1** (`0xc39a5a616f0ad1ff45077fa2de3f79ab8eb8b8b9`, "High Yield Secured Lending Maple Pool USDC1"), an **ERC-4626** Maple Finance pool token, underlying **USDC** — ~39.03M shares × 1.2814 USDC/share ≈ **$50M**. It is untracked (not in `config/idle-tokens.ts`). Ethena's snapshot reports "Maple Institutional" = $0 (snapshot lag).
2. Root cause: the EVM idle reader (`lib/onchain/balances.ts`) values only a hardcoded allowlist (`IDLE_TOKENS`). New EVM positions are silently missed (this is the 4th such miss).

## Goal
- **Fix Maple now:** add MPLhysUSDC1 to the idle allowlist as an ERC-4626 token; it then values via the existing `convertToAssets` path (same as sUSDe/sUSDtb), counts toward backing, and reconciles as on-chain (snapshot-lag until Ethena reports Maple).
- **Add a safety net:** an EVM **untracked-holdings audit** that flags any non-allowlisted token a monitored wallet holds above a $ threshold as "untracked — confirm" (loud, in the failures/alert channel). It does NOT auto-count unknowns (EVM is spam-heavy) — it alerts so the next miss surfaces immediately. Mirrors the Solana `untracked:` path.

## Task 1 — Maple (affects backing; ERC-4626 path)
`config/idle-tokens.ts`, `IDLE_TOKENS.ethereum`, add:
```ts
{ symbol: "MPLhysUSDC1", address: "0xc39a5a616f0ad1ff45077fa2de3f79ab8eb8b8b9", decimals: 6, isErc4626: true },
```
No reader change — `getEthenaIdleBalances` already calls `convertToAssets(rawSum)` for `isErc4626` tokens and values the result 1:1 USD. The row keys as its own symbol "MPLhysUSDC1" (does NOT fold into plain USDC). Reconciliation: ours "MPLhysUSDC1" ≈ $50M vs ethena $0 → "on-chain exceeds reported — snapshot lag" (Ethena's Maple Institutional counterparty is name-keyed and $0). Verify on-chain valuation ≈ $50M, not $39M (the 1:1-share-count trap).

## Task 2 — EVM untracked-holdings audit (alert-only; cannot affect backing)
New `lib/onchain/untracked-audit.ts`:
```ts
export interface UntrackedFinding {
  chain: Chain; wallet: string; address: string; symbol: string;
  valueUsd: number; kind: "erc4626-stable" | "priced";
}
export async function auditUntrackedHoldings(exclude: ReadonlySet<string>): Promise<UntrackedFinding[]>
```
Algorithm, per EVM idle chain (`IDLE_CHAINS`: ethereum, base) and each `MONITORED_WALLETS` entry:
1. `alchemy_getTokenBalances(wallet)` → non-zero contract addresses (raw via JSON-RPC, like the recon probe).
2. Drop addresses in `exclude` (lowercased) and in a `UNTRACKED_DENY` set (known spam, extendable).
3. For the remainder, batch two valuations:
   - **Alchemy Prices by-address** (`fetchTokenPrices`, one batched call per chain) → `priceUsd`.
   - **ERC-4626 stable probe** via `client.multicall` (`allowFailure: true`): `asset()` + `convertToAssets(balance)` + the token's `decimals()`. If `asset()` ∈ `KNOWN_STABLE_UNDERLYINGS` (USDC/USDT/USDe/USDtb/DAI/USDS addresses), value = `convertToAssets / 10**assetDecimals` (USD ≈ 1:1). Non-ERC4626 tokens revert → skipped.
4. `valueUsd = erc4626StableValue ?? (priceUsd ? balance×priceUsd : undefined)`.
5. If `valueUsd >= UNTRACKED_ALERT_USD` (default **$1M**, in config) → push an `UntrackedFinding`.
Partial-tolerant: a failed wallet/chain logs + is skipped, never throws. `server-only`.

### Wiring (`lib/views/footprint.ts`)
- Build the exclusion set: lowercased `IDLE_TOKENS` addresses ∪ tracked Morpho vault addresses (`morphoMeta` values — these wallets hold Morpho vault ERC4626 shares like Steakhouse `0xbeefc1cd…`, which are ALREADY counted via the Morpho footprint, so they MUST be excluded or the audit double-alerts) ∪ `RESERVE_FUND` Curve LP token addresses ∪ the new Maple token.
- Call `auditUntrackedHoldings(exclude)` inside the existing `Promise.allSettled` batch (partial-tolerant).
- Add `untrackedHoldings: UntrackedFinding[]` to `FootprintResult`. These are ALERTS — they do NOT enter `idle`, `deployedUsd`, reconciliation, or any backing total.
- Surface them on the page (a small "untracked holdings — needs triage" notice; reuse the existing failures/alert styling). UI can be minimal; the data + a visible warning is the requirement.

## Invariants
- Maple valued via ERC-4626 `convertToAssets` (no 1:1-share undercount, no `?? 0`).
- The audit is **alert-only**: it can never add to or subtract from any backing/reconciliation number. (This is what keeps its spam exposure safe — a wrongly-flagged token is noise, never a wrong backing figure.)
- Audit excludes everything already tracked (idle allowlist + Morpho vaults + reserve LP + Maple) so it doesn't re-flag known positions.
- Spam resistance: only flag tokens that are EITHER Alchemy-priced OR ERC4626-with-known-stable-underlying, AND ≥ $1M. Pure spam (no price, not ERC4626-stable) is ignored.

## Tasks (TDD; independent review before merge — Task 1 touches backing, review carefully)
1. Add Maple to `config/idle-tokens.ts`. Test: an `isErc4626` idle token with a mocked `convertToAssets` rate of 1.2814 and balance 39.03M values to ≈ $50M (not $39M) and rows as its own symbol. (Reuse the existing balances test harness/mocks.)
2. `lib/onchain/untracked-audit.ts` + config (`UNTRACKED_ALERT_USD`, `UNTRACKED_DENY`, `KNOWN_STABLE_UNDERLYINGS`). Tests (mock getTokenBalances + multicall + fetchTokenPrices): a held ERC4626-stable token > $1M not in exclude → finding; an excluded address (idle/Morpho vault) → no finding; a priced token > $1M → finding; sub-$1M or unpriced-non-ERC4626 → no finding.
3. `lib/views/footprint.ts` — build exclusion set, call audit in the allSettled batch, thread `untrackedHoldings` through `FootprintResult`; surface a triage notice on the page. Test: footprint returns `untrackedHoldings`; excluded Morpho vault not flagged; backing totals UNCHANGED by the audit.
4. Verify — full suite + tsc + build + live smoke: Maple ≈ $50M appears in idle + reconciles as snapshot-lag; the Steakhouse Morpho vault is NOT in untracked findings; any genuinely-untracked >$1M holding shows as a triage notice.

## Out of scope
- Full EVM auto-discovery/auto-valuation (chosen against — EVM spam surface too large; alert-only is the safe net).
- Auto-promoting an untracked finding into backing — that stays a human step (add to `IDLE_TOKENS`).
