#!/bin/bash
#
# launchd entrypoint: refresh the committed Ethena snapshot and push.
#
# Ethena's API is behind Cloudflare anti-bot that challenges datacenter
# egress (Vercel, GitHub Actions) — only a residential IP gets through.
# So the refresh runs here, on this Mac, driven by the launchd agent at
# ~/Library/LaunchAgents/com.ethena-flow.refresh.plist.
#
# Install / reinstall:
#   cp scripts/com.ethena-flow.refresh.plist ~/Library/LaunchAgents/
#   launchctl unload ~/Library/LaunchAgents/com.ethena-flow.refresh.plist 2>/dev/null
#   launchctl load   ~/Library/LaunchAgents/com.ethena-flow.refresh.plist
#
# Run once by hand:  bash scripts/refresh-and-push.sh

set -euo pipefail

# launchd runs with a minimal environment — set PATH explicitly so the
# homebrew node and system git resolve.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Repo root = parent of this script's directory (portable, no hardcoded path).
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ethena snapshot refresh ==="

node --experimental-strip-types scripts/refresh-ethena-snapshot.ts

if git diff --quiet -- data/; then
  echo "data/ unchanged — Ethena snapshot is identical, nothing to push."
  exit 0
fi

git add data/
git commit -m "chore: refresh ethena snapshot ($(date -u +%Y-%m-%dT%H:%MZ))"
git push
echo "=== pushed — Vercel will redeploy ==="
