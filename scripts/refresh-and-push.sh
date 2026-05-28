#!/bin/bash
#
# launchd entrypoint: refresh the committed Ethena snapshot AND flows ledger,
# then push. The snapshot fetch hits Ethena's Cloudflare-gated API (residential
# IP only); the flows scan hits public on-chain RPCs. The two are independent —
# one failing must not block or clobber the other.
#
# Install / reinstall:
#   cp scripts/com.ethena-flow.refresh.plist ~/Library/LaunchAgents/
#   launchctl unload ~/Library/LaunchAgents/com.ethena-flow.refresh.plist 2>/dev/null
#   launchctl load   ~/Library/LaunchAgents/com.ethena-flow.refresh.plist
#
# Run once by hand:  bash scripts/refresh-and-push.sh

set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ethena refresh ==="

# Step 1: backing snapshot (Ethena API). Non-fatal on failure.
if node --experimental-strip-types scripts/refresh-ethena-snapshot.ts; then
  echo "snapshot: ok"
else
  echo "snapshot: FAILED (Cloudflare/network) — keeping previous data"
fi

# Step 2: flows ledger (on-chain RPCs). Non-fatal on failure.
if npx tsx --env-file=.env.local scripts/refresh-flows.ts; then
  echo "flows: ok"
else
  echo "flows: FAILED — keeping previous data"
fi

# Commit whatever changed across both steps.
if git diff --quiet -- data/; then
  echo "data/ unchanged — nothing to push."
  exit 0
fi

git add data/
git commit -m "chore: refresh ethena snapshot + flows ($(date -u +%Y-%m-%dT%H:%MZ))"
if git push; then
  echo "=== pushed — Vercel will redeploy ==="
else
  echo "=== git push FAILED — commit is local; next run will retry ==="
fi
