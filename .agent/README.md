# .agent/ — Cowork agent configuration

Everything the Cowork agent needs to run FlowPay builds.

## Files

| File | Purpose | Tracked? |
|---|---|---|
| `CONTEXT.md` | Project state, decisions, gotchas | ✅ |
| `secrets.env.example` | Template for local secrets | ✅ |
| `secrets.env` | Actual secrets, filled locally | ❌ NEVER |
| `env.sh` | Loads GIT_DIR + sources secrets.env | ✅ |
| `setup-git.sh` | Initializes GIT_DIR, pulls origin/main | ✅ |
| `commit-push.sh` | Commits staged + pushes to main | ✅ |

## First-time setup (per machine)

```bash
cd <repo-root>
cp .agent/secrets.env.example .agent/secrets.env
# Edit .agent/secrets.env:
#   From Bitwarden "Flowpay Supabase" → SUPABASE_* values
#   GitHub PAT → GITHUB_PAT
# Leave OPTIONAL blocks empty until credentials arrive.
```

Verify it's NOT tracked:
```bash
git status .agent/secrets.env   # should list nothing
git check-ignore -v .agent/secrets.env   # should confirm ignore rule
```

## Missing secrets behavior

Agent reads secrets at run start:
- OPTIONAL empty → dependent briefs get skipped (see `SKIP-CONDITIONS.md`)
- REQUIRED empty → `STOP-SETUP-INCOMPLETE.md` + clean exit

## Updating CONTEXT.md

When a decision changes, update `CONTEXT.md` in the same commit as the
code change. Agent reads it fresh every run.
