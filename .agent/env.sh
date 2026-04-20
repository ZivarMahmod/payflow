#!/bin/bash
# Environment setup for agent git operations.
# Source this at start of every scheduled run before any git command.
#
#   source /path/to/payflow/.agent/env.sh

# Derive mount path from this file's location (survives session-name changes).
_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PAYFLOW_MOUNT="$(dirname "$_ENV_DIR")"

# The mount has Windows filesystem restrictions — git metadata lives outside it.
# Sandbox session dirs don't persist, so GIT_DIR is reinitialized each run from origin.
# Use $HOME (session-specific) instead of /tmp to avoid cross-session permission
# conflicts when different sandbox users leave stale objects in /tmp.
export PAYFLOW_GITDIR="${HOME:-/tmp}/payflow-git"
export GIT_DIR="$PAYFLOW_GITDIR/.git"
export GIT_WORK_TREE="$PAYFLOW_MOUNT"

# Load secrets if present (PAT, etc.) — gitignored, stored per-machine.
if [ -f "$PAYFLOW_MOUNT/.agent/secrets.env" ]; then
  set -a
  source "$PAYFLOW_MOUNT/.agent/secrets.env"
  set +a
fi

# Git identity (always same).
git config --global user.email "zivar68@gmail.com" 2>/dev/null
git config --global user.name "Zivar Mahmod" 2>/dev/null
git config --global init.defaultBranch main 2>/dev/null
git config --global pull.ff only 2>/dev/null
