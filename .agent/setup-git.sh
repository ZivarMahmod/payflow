#!/bin/bash
# Initialize or refresh the agent's git state at the start of a scheduled run.
# Idempotent — safe to run every time.
#
#   source /sessions/confident-focused-cannon/mnt/payflow/.agent/env.sh
#   bash /sessions/confident-focused-cannon/mnt/payflow/.agent/setup-git.sh

set -e

if [ -z "$GITHUB_PAT" ]; then
  echo "WARN: GITHUB_PAT not set — push will fail. Reads/clones still work."
fi

REMOTE_URL_ANON="https://github.com/ZivarMahmod/payflow.git"
if [ -n "$GITHUB_PAT" ]; then
  REMOTE_URL_AUTH="https://x-access-token:${GITHUB_PAT}@github.com/ZivarMahmod/payflow.git"
else
  REMOTE_URL_AUTH="$REMOTE_URL_ANON"
fi

# Init GIT_DIR outside the mount if it doesn't exist (fresh sandbox).
if [ ! -d "$PAYFLOW_GITDIR/.git" ]; then
  echo "Initializing fresh GIT_DIR at $PAYFLOW_GITDIR"
  mkdir -p "$PAYFLOW_GITDIR"
  (cd "$PAYFLOW_GITDIR" && git init --initial-branch=main .)
  git remote add origin "$REMOTE_URL_AUTH" 2>/dev/null || git remote set-url origin "$REMOTE_URL_AUTH"
  git fetch origin main
  # Align index with origin/main WITHOUT touching worktree files (they're authoritative on mount).
  git reset --soft origin/main
else
  # Existing GIT_DIR — just update auth on remote URL in case PAT changed.
  git remote set-url origin "$REMOTE_URL_AUTH" 2>/dev/null
  # Fetch and try fast-forward any remote commits into the mount.
  git fetch origin main 2>&1 | tail -3
  # If remote is ahead, pull. If local has uncommitted changes, pull --ff-only still works.
  git pull --ff-only origin main 2>&1 | tail -3 || echo "WARN: pull --ff-only failed (maybe diverged). Manual resolution needed."
fi

echo "GIT setup complete."
echo "HEAD: $(git rev-parse HEAD)"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
