# BRIEF-TA-001 — Admin-skeleton + auth — SKIPPED

- **Date:** 2026-04-23T09:00+02:00
- **Commit:** pending-zivar-commit
- **Reason:** DECISION_REQUIRED
- **Thinking tier:** 🟡 Think

## What's needed to unskip

Zivar makes one concrete decision about the auth provider and records it
in `.agent/CONTEXT.md`:

1. **Magic link via Supabase Auth (brief's default).** Simplest path —
   Supabase handles email delivery, session cookies, and the middleware
   redirect pattern. Local dev uses Mailpit on :54324. No BankID today.
2. **BankID-first via Criipto / Signicat / Freja eID+.** Requires:
   - Vendor contract + test-merchant credentials (which vendor?).
   - OIDC client_id/secret added to `.agent/secrets.env`.
   - A decision whether to keep Supabase Auth as the session layer and
     plug BankID as an OIDC identity provider, OR to own the session
     cookie entirely (much more work).
3. **Clerk / Auth0 / WorkOS.** Third-party session layer. Different
   middleware pattern from the Supabase-SSR one the brief describes;
   most of the code in `apps/admin/src/lib/supabase/{server,client}.ts`
   would be swapped for a different SDK.

The brief says "Supabase Auth (magic link) initially, BankID senare",
which looks like option (1) — but the schedule has stayed paused on
this for multiple runs, which reads like the decision is not as settled
as the brief implies. SKIPPED until Zivar confirms in writing.

## Why SKIPPED and not PREPARED

PREPARED is for briefs whose files can be written correctly against a
documented external interface (DB migration, SQL, route skeleton). The
admin skeleton's shape changes materially between the three options
above — middleware, session hydration, and the login page each have
different code paths per provider. Writing the Supabase-magic-link
version now and then re-writing it later is worse than waiting one
message from Zivar.

Additionally: `pnpm create next-app` as step 1 of the brief is
interactive and can't be run headless in the current egress-blocked
sandbox; it's an external operation per SKIP-CONDITIONS §PREPARED rules.

## Blocks

- **TA-002** (Dashboard) — needs `apps/admin/` to exist.
- **TA-003** (Feedback inbox) — same.
- **TA-004** (Settings) — same.
- **TA-005** admin-side wiring — the pure PDF generator ships as
  `packages/qr-pdf/` (see BRIEF-TA-005.prepared.md); only the
  ~40 lines of admin page + API route are gated on TA-001.

## When it's safe to run autonomously

Once `.agent/CONTEXT.md` contains a line like
`admin_auth_provider: supabase_magic_link` (or one of the BankID /
Clerk / Auth0 alternatives with the required secret present in
`.agent/secrets.env`), the night-run can retake this brief.
