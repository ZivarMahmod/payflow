#!/bin/bash
# Stage, commit, and push after a brief is done.
# Usage: bash .agent/commit-push.sh "BRIEF-XXX-NNN: <short message>"
#
# Assumes env.sh has already been sourced (GIT_DIR, GIT_WORK_TREE, GITHUB_PAT).

set -e

MSG="${1:-Agent work-in-progress}"

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

git commit -m "$MSG"
echo "Committed: $(git rev-parse HEAD)"

if [ -z "$GITHUB_PAT" ]; then
  echo "WARN: GITHUB_PAT not set — skipping push. Commit is local only."
  exit 0
fi

# Try push. If fails (non-fast-forward, auth), log and continue. Next run retries.
if git push origin main 2>&1 | tail -5; then
  echo "Pushed."
else
  echo "ERROR: push failed. Commit is local; next run will retry after pull."
  exit 2
fi
