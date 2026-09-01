@AGENTS.md

# Ethena Flow Monitor

Next.js 16 dashboard that independently verifies Ethena's USDe backing from on-chain reads and scores how much of it is levered in recursive DeFi loops. Deploys publicly from `main` on Vercel.

Full project context (architecture, deploy state, TokenLogic API and Morpho gotchas, load-bearing decisions): **`docs/project-context.md`**. Read it before non-trivial changes.

## Commands

```bash
pnpm dev            # next dev --turbopack
pnpm build          # next build
pnpm test           # vitest run
pnpm test:watch
pnpm lint
pnpm refresh:flows  # tsx --env-file=.env.local scripts/refresh-flows.ts
```

## Known failure modes

Global list: ~/.claude/rules/known-failure-modes.md applies in full.

- Repo-specific gotchas (token-unit vs USD fields on the TokenLogic API, Morpho GraphQL schema renames, uncovered market_keys) live in `docs/project-context.md`; that file is the source of truth, do not duplicate it here.
