# .agent/ — helper scripts for the scheduled agent

These scripts handle the git workflow across sandbox sessions that don't
persist state between runs. Everything outside `/sessions/.../mnt/payflow/`
gets wiped, so git state is re-established from `origin` each run.

## Files

| File | Purpose |
|---|---|
| `env.sh` | Sets `GIT_DIR`, `GIT_WORK_TREE`, loads `secrets.env` (PAT) |
| `setup-git.sh` | Initializes GIT_DIR from origin, pulls latest |
| `commit-push.sh` | Stages all, commits, pushes to origin/main |
| `secrets.env` | **Gitignored.** Stores `GITHUB_PAT=ghp_...` |

## Agent runtime flow

```bash
cd /sessions/confident-focused-cannon/mnt/payflow
source .agent/env.sh
bash .agent/setup-git.sh          # fetch + pull
# ...agent does work (reads briefs, writes code, creates done files)...
bash .agent/commit-push.sh "BRIEF-IN-001: Scaffold pnpm + Turborepo"
```

## Resetting if things go wrong

- Delete `/tmp/payflow-git/` — next run re-initializes.
- Manually fix `secrets.env` if PAT rotated.
- If mount diverges from origin: `git fetch origin && git reset --hard origin/main`
  (destructive — will clobber uncommitted agent work).
