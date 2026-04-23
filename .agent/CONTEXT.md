# Agent Context — Everything Cowork Needs to Know

> Read at the start of every scheduled run (after env.sh + setup-git.sh).
> Single source of truth for project state, decisions, and gotchas.
> Update when decisions are made, not when convenient.

---

## Project essentials

- **Product:** FlowPay — QR-based pay-at-table for Swedish restaurants.
- **Architecture:** Layer on top of existing POS (Onslip, Caspeco).
  POS is source of truth for receipts/VAT/Z-reports. We never replace it.
- **Monorepo:** pnpm + Turborepo. Node 20+, pnpm 10+.
- **Apps:** `apps/guest` (Vite PWA), `apps/admin` (Next 15, not created yet),
  `apps/api` (Fastify).
- **Packages:** `packages/db`, `packages/ui`, `packages/schemas`.
  Coming: `pos-adapters`, `payments`.

## Supabase project

- **Name:** Flowpay
- **Org:** Flowpay (separate from Corevo Solutions — do NOT touch Corevo)
- **Ref:** `nhpmaxtdxkzbauqbkbdk`
- **Region:** eu-north-1 (Stockholm)
- **Tier:** Free (concept phase, no customer data)
- **URL:** https://nhpmaxtdxkzbauqbkbdk.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/nhpmaxtdxkzbauqbkbdk
- **API keys:** New-style (`sb_publishable_...` / `sb_secret_...`), NOT legacy JWT.

## Key decisions made

- **Schema:** Everything in `public`. No custom schemas.
- **Case:** snake_case in DB, camelCase in frontend, convert at data layer.
- **PK:** UUID only, never SERIAL/INT.
- **Timestamps:** Always TIMESTAMPTZ.
- **RLS:** All tenant tables get RLS. Enforced in SC-001.
- **Mock-first:** Every external integration has a mock path. Flip via
  `USE_MOCK_*` env vars. Mocks are first-class, not throwaway.
- **Push target:** `main` directly during sprint.

## Pending decisions (block specific briefs)

| Decision | Required by | Status |
|---|---|---|
| Auth provider (Supabase Auth? Magic link? OAuth?) | TA-001 | PENDING |
| Stripe account + Connect setup | API-005 | PENDING |
| Onslip prod API access | POS-001 (prod path) | PENDING — mock works |
| Caspeco OAuth app registration | POS-002 (prod path) | PENDING — mock works |

## Known gotchas

### Egress is blocked to *.supabase.co (confirmed 2026-04-22)

Cowork sandbox proxy returns `403 Host not in allowlist` for Supabase.
See `STATUS-EGRESS-BLOCKED.md`.

**This does NOT stop DB/API briefs from being processed.** Rule:

1. **Write everything.** Complete all file-creation steps in the brief:
   SQL migrations, TypeScript types (from schema, not from live DB —
   author them by hand if needed), Fastify routes, React components.
2. **Verify locally.** Run `pnpm typecheck`, `pnpm lint`, any pure unit tests.
3. **Skip external verification.** `supabase db push`, `curl` against
   Supabase, live API round-trips — document these as manual steps.
4. **Mark as PREPARED, not SKIPPED.** See `docs/SKIP-CONDITIONS.md` "When to
   PREPARE instead of skip".

Goal: when the night-run ends, every DB/API brief has complete, working
files in the repo. Zivar runs the deploy commands manually the next day
with network access.

### Sandbox egress may fail
Earlier runs saw `proxy 403` calling `*.supabase.co` or
`release-assets.githubusercontent.com`. If a network command fails with 000/403:
1. Do NOT loop retries.
2. Write `STATUS-EGRESS-BLOCKED.md` with exact command + exit code.
3. Write skip/block for current brief.
4. Continue to next brief that doesn't need egress.

### Windows mount quirks (cowork machine)
- Some files can't be `rm`-ed directly. Use
  `mcp__cowork__allow_cowork_file_delete` if blocked.
- `.symlink-test` and `_tmp_*` files may appear — they're in `.gitignore`.
- Git metadata lives outside mount — see `.agent/env.sh` for `GIT_DIR`.

### Stale mount-state after Zivar pushes between runs
`setup-git.sh` fresh-init does `git reset --soft origin/main`. If Zivar
pushed between runs, worktree may be stale. Before `git add -A`:
```bash
git fetch origin main
git log HEAD..origin/main --oneline | head -5   # non-empty = origin ahead
```
If origin is ahead: rebase on origin/main before adding changes.
Never auto-revert Zivar's commits.

### Supabase CLI binary not bundled
`npm install` in some sandboxes can't download Supabase CLI binary
(GitHub release-assets 403). If `npx supabase --version` fails:
- Scaffolding (migration files) still works
- `supabase db push/link/login` won't — skip binary-dependent verifs,
  note in `.done.md`

### IN-002 partial-done state
IN-002 is DONE but has 2 pending manual verifs on Zivar's machine.
Don't re-open. Don't block DB-001 on it.

## Priority rules

Standard order: `briefs/README.md` Fas 0 → Fas 3.

Override:
- `Beror på:` unmet → skip, try next
- Matches `docs/SKIP-CONDITIONS.md` → `.skipped.md` + next
- Context < 30% → WIP-commit, end run, next run picks up fresh

## Where to write what

| Event | Destination |
|---|---|
| Brief completed | `briefs/done/BRIEF-XXX-NNN.done.md` + `NIGHT-RUN.md` |
| Brief files complete, external verification pending | `briefs/done/BRIEF-XXX-NNN.prepared.md` + `NIGHT-RUN.md` |
| Brief skipped (missing creds) | `briefs/done/BRIEF-XXX-NNN.skipped.md` + `NIGHT-RUN.md` |
| Brief blocked mid-execution | `briefs/blocked/BRIEF-XXX-NNN.blocked.md` + `NIGHT-RUN.md` |
| Non-urgent question to Zivar | `questions/BRIEF-XXX-NNN.question.md` |
| Run-level status | `status/YYYY-MM-DD-HH.md` |
| New decision | Update this file "Key decisions" + commit |
| New gotcha | Update this file "Known gotchas" + commit |

## Contact hygiene

- Never chat. Write files.
- Zivar's input arrives as `.answer.md` in `questions/` or new briefs.
- Ambiguity → follow `FlowPay-Master-v2.md` patterns, note in `.done.md`.
  No block needed for that.
