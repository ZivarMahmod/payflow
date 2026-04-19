#!/bin/bash
# Environment setup for agent git operations.
# Source this at start of every scheduled run before any git command.
#
#   source /sessions/confident-focused-cannon/mnt/payflow/.agent/env.sh

# The mount has Windows filesystem restrictions — git metadata lives outside it.
# Sandbox session dirs don't persist, so GIT_DIR is reinitialized each run from origin.
export PAYFLOW_MOUNT="/sessions/confident-focused-cannon/mnt/payflow"
export PAYFLOW_GITDIR="/tmp/payflow-git"
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
