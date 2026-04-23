# Skip Conditions — When the Scheduled Agent May Skip a Brief

> Read before every scheduled run. Governs autonomous operation during
> night-runs where Zivar is not in the loop.

## Principle

A brief may be **skipped** (not blocked) when it cannot be completed
correctly without human input that is not currently available. Skipping
is a first-class status — the agent continues to the next eligible brief
and records the skip in `NIGHT-RUN.md`.

Three distinct statuses:
- **Done** = "Completed and verified end-to-end."
- **Prepared** = "All files written correctly. Local verifications (typecheck,
  lint, unit tests) green. External verification blocked by egress/creds —
  Zivar will run it manually."
- **Skipped** = "Shouldn't start at all. Missing secret or decision makes the
  work meaningless until Zivar acts."
- **Blocked** = "Started and got stuck. Something is broken and needs fixing."

## When to Skip

A brief is skipped if ANY of these hold:

1. **Missing secret that only Zivar can provision.** Brief requires a
   credential listed in `.agent/secrets.env.example` with an empty value.
   Examples: Stripe, Onslip production API, Caspeco OAuth, Swish Handel,
   Google Places.
2. **Architecture decision required.** Brief requires Zivar to choose
   between documented alternatives (e.g. auth provider selection for
   admin). The brief itself must explicitly say so.
3. **Tier ⚫ Ultrathink.** These require review before commit. Never run
   unattended.
4. **Depends on a skipped brief that is blocking.** Only if the skipped
   dependency produced artifacts the current brief needs. If the
   dependency is optional, keep going.

## When to PREPARE instead of skip

For briefs where Cowork **can** write all code/SQL/config correctly but
**cannot** verify against an external service due to egress restrictions:

- DB-briefs where SQL migration files + generated types are the real output.
  `pnpm supabase db push` is the external step — Zivar runs it manually.
- API-briefs where the skeleton + routes + tests can be written, but
  `curl` against Supabase health-check is blocked.
- Any brief that is NOT blocked by missing credentials (those SKIP), but
  only by network access (those PREPARE).

**Rule:** If the work product is code/SQL/config that compiles and
typechecks locally, write it fully. Document what verification step Zivar
needs to run. Mark as PREPARED, not SKIPPED.

### How to mark PREPARED

1. Complete all file-writing steps in the brief.
2. Run local verifications (typecheck, lint, any pure unit tests).
3. Skip only external verifications (db push, curl to external services,
   runtime against real API).
4. Create `briefs/done/BRIEF-XXX-NNN.prepared.md`:
   ```markdown
   # BRIEF-XXX-NNN — <title> — PREPARED

   - **Date:** <ISO>
   - **Commit:** <hash>
   - **Status:** Files complete. Awaiting manual verification by Zivar.

   ## Local verifications passed
   - [x] pnpm typecheck
   - [x] pnpm lint
   - [x] <any unit tests>

   ## Manual steps for Zivar (run locally with network access)
   ```bash
   # exact commands with expected output
   cd packages/db
   pnpm supabase db push
   pnpm supabase gen types typescript --linked > src/database.types.ts
   ```

   ## Files changed
   - packages/db/supabase/migrations/001_xxx.sql
   - ...
   ```
5. Append to `NIGHT-RUN.md` under "Prepared".
6. Commit with brief's normal commit message — same as Done.
7. Continue to next eligible brief.

Prepared briefs count as processed. They do NOT block downstream briefs
that only need the files (not the deployed state). Downstream briefs that
DO need the deployed state get marked PREPARED themselves.

## When NOT to Skip

- Brief is 🔴 Think hard → NOT auto-skipped. Run it carefully, invoke
  `engineering:code-review` skill as charter already requires.
- Brief uses mocks — even if real creds are missing, mock-first
  integrations are designed to run without them. Never skip a brief
  that has a working mock path documented in `docs/mock-strategy.md`.
- Brief touches DB schema — `SUPABASE_DB_PASSWORD` is present, DB-briefs
  are NOT auto-skipped.

## How to Skip

When deciding to skip, do all of the following:

1. Create `briefs/done/BRIEF-XXX-NNN.skipped.md` with:
   ```markdown
   # BRIEF-XXX-NNN — <title> — SKIPPED

   - **Date:** <ISO>
   - **Reason:** <one of: MISSING_SECRET | DECISION_REQUIRED | ULTRATHINK | DEPENDENCY_SKIPPED>
   - **What's needed to unskip:** <concrete: "Zivar provisions STRIPE_SECRET_KEY in .agent/secrets.env">
   - **Blocks:** <list of brief IDs that depend on this one, if any>
   ```
2. Append a line to `NIGHT-RUN.md` under "Skipped".
3. Continue to the next eligible brief. Do not treat skips as failures.

## Status policy for current sprint

> **Update 2026-04-24:** PREPARED-briefs nedan är numera verifierade av
> Zivar lokalt — DB pushad, API + guest PWA kör end-to-end mot Supabase
> cloud. Tabellen lämnas som historisk record över vad som var blockerat
> under nattkörningen 2026-04-23.

### Fortfarande SKIPPED (credentials/decisions missing)

| Brief | Reason | Unskip by |
|---|---|---|
| API-005 | MISSING_SECRET | Fill Stripe keys in secrets.env |
| KI-006 | DEPENDENCY_SKIPPED (API-005) | Same |
| TA-001 | DECISION_REQUIRED (auth provider) | Zivar decides in CONTEXT.md |
| TA-002 | DEPENDENCY_SKIPPED (TA-001) | Same |
| TA-003 | DEPENDENCY_SKIPPED (TA-001) | Same |
| TA-004 | DEPENDENCY_SKIPPED (TA-001) | Same |
| SA-001 | ULTRATHINK | Zivar reviews before run |

### Tidigare PREPARED → numera DONE (verifierat 2026-04-23/24)

DB-001, DB-002, DB-003, SC-001, API-001, API-002, API-004, KI-002,
KI-003, KI-007 — alla körs end-to-end mot live Supabase + lokal API.

### DONE autonomously (mock-first, no egress needed)

POS-001, POS-002, API-003, API-006, KI-004, KI-005, TA-005
