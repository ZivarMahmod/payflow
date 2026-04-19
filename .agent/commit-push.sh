#!/bin/bash
# Stage, commit, and push after a brief is done.
# Usage: bash .agent/commit-push.sh "BRIEF-XXX-NNN: <short message>"
#
# Assumes env.sh has already been sourced (GIT_DIR, GIT_WORK_TREE, GITHUB_PAT).

set -e

MSG="${1:-Agent work-in-progress}"

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit (working tree matches HEAD)."
else
  git commit -m "$MSG"
  echo "Committed: $(git rev-parse HEAD)"
fi

# Always try to push — there may be unpushed commits from previous runs.
AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo "?")
if [ "$AHEAD" = "0" ]; then
  echo "Already in sync with origin/main."
  exit 0
fi
echo "$AHEAD commits to push."

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
