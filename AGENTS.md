<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TokenLogic API

Canonical reference for every `/v1/aave/*` endpoint we hit (and don't hit yet): **[`docs/tokenlogic-api.md`](docs/tokenlogic-api.md)**. Read it before touching `lib/tokenlogic/*` schemas or adding new endpoint calls. Field names and types are not always documented strictly upstream — when in doubt, probe the live response and prefer permissive zod parsers (e.g. `numericLike`, `NumberArrayOrCsv`) over hard `z.number()`.
