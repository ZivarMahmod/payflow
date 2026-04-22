# Skip Conditions — When the Scheduled Agent May Skip a Brief

> Read before every scheduled run. Governs autonomous operation during
> night-runs where Zivar is not in the loop.

## Principle

A brief may be **skipped** (not blocked) when it cannot be completed
correctly without human input that is not currently available. Skipping
is a first-class status — the agent continues to the next eligible brief
and records the skip in `NIGHT-RUN.md`.

Skipping is NOT the same as blocking. Block = "I started and got stuck,
something is broken." Skip = "I identified up-front that I should not
start this one, and I moved on."

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

## Specific Skip Policy for Current Sprint

Unless `.agent/secrets.env` has been updated since this file was written,
the following briefs WILL be skipped on the first night-run:

| Brief | Reason | To unskip |
|---|---|---|
| BRIEF-API-005 | MISSING_SECRET | `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET` |
| BRIEF-KI-006 | DEPENDENCY_SKIPPED (API-005) | same as API-005 |
| BRIEF-TA-001 | DECISION_REQUIRED (Supabase Auth provider config) | Zivar confirms auth provider + redirect URLs |
| BRIEF-TA-002 | DEPENDENCY_SKIPPED (TA-001) | same as TA-001 |
| BRIEF-TA-003 | DEPENDENCY_SKIPPED (TA-001) | same as TA-001 |
| BRIEF-TA-004 | DEPENDENCY_SKIPPED (TA-001) | same as TA-001 |
| BRIEF-SA-001 | ULTRATHINK | Zivar reviews architecture before run |

All other briefs (DB-*, SC-*, API-001–004 + API-006, POS-*, KI-002 through
KI-005 + KI-007, TA-005) are in-scope for autonomous execution.
